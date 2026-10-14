"""Drift endpoints, including Drift Replay and remediation control."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app import observability
from app.api.deps import get_repositories, require_api_key
from app.config.settings import Settings, get_settings
from app.domain.models import (
    ApiError, DependencySummary, DriftEvent, DriftStatus, Page,
    RemediationPreview, RemediationStrategy, ReconciliationProposal,
    StaleDriftError, TimelineEvent, TimelineEventType,
)
from app.integrations.github.client import GitHubClient, GitHubIntegrationError
from app.repositories.factory import Repositories
from app.services.drift import replay
from app.services.remediation import preview as preview_svc
from app.services.remediation import reconciliation

log = logging.getLogger("plumbline.api.drifts")
router = APIRouter(prefix="/api/v1/drifts", tags=["drifts"])

_TERMINAL = {DriftStatus.RESOLVED, DriftStatus.SUPERSEDED,
             DriftStatus.ACCEPTED, DriftStatus.IGNORED}


class ReconcileRequest(BaseModel):
    strategy: RemediationStrategy = RemediationStrategy.RESTORE_DESIRED
    create_pr: bool = True
    reason: Optional[str] = None


class IgnoreRequest(BaseModel):
    reason: Optional[str] = None


def _get_or_404(repos: Repositories, drift_id: str) -> DriftEvent:
    event = repos.drifts.get(drift_id)
    if event is None:
        raise ApiError(404, "drift event not found")
    return event


def _assert_fresh(event: DriftEvent, repos: Repositories) -> None:
    """Stale-drift protection: reject actions against superseded/terminal
    records, or when a different open fingerprint exists for the resource."""
    if event.status in _TERMINAL:
        raise StaleDriftError(
            f"drift event is {event.status.value.lower()}; it is no longer actionable")
    for other in repos.drifts.find_open_for_resource(event.environment,
                                                     event.resource_address):
        if other.id != event.id and other.fingerprint != event.fingerprint:
            raise StaleDriftError(
                "a newer drift event exists for this resource; rescan required")


def _github_client(settings: Settings) -> Optional[GitHubClient]:
    if not settings.github_token or not settings.github_repository:
        return None
    return GitHubClient(settings.github_token, settings.github_repository,
                        settings.github_base_branch)


# -- reads ---------------------------------------------------------------

@router.get("", response_model=Page)
def list_drifts(
    environment: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    aws_service: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1),
    repos: Repositories = Depends(get_repositories),
    settings: Settings = Depends(get_settings),
) -> Page:
    items, nxt = repos.drifts.list(
        {"environment": environment, "region": region,
         "resource_type": resource_type, "aws_service": aws_service,
         "severity": severity, "status": status},
        cursor, min(limit, settings.max_page_size))
    return Page(items=items, next_cursor=nxt)


@router.get("/{drift_id}", response_model=DriftEvent)
def get_drift(drift_id: str, repos: Repositories = Depends(get_repositories)) -> DriftEvent:
    return _get_or_404(repos, drift_id)


@router.get("/{drift_id}/timeline", response_model=list[TimelineEvent])
def drift_timeline(drift_id: str,
                   repos: Repositories = Depends(get_repositories)) -> list[TimelineEvent]:
    _get_or_404(repos, drift_id)
    return repos.timeline.list(drift_id)


@router.get("/{drift_id}/dependencies", response_model=DependencySummary)
def drift_dependencies(drift_id: str,
                       repos: Repositories = Depends(get_repositories)) -> DependencySummary:
    return _get_or_404(repos, drift_id).dependency_context


@router.get("/{drift_id}/remediation-preview", response_model=RemediationPreview)
def remediation_preview(drift_id: str,
                        repos: Repositories = Depends(get_repositories)) -> RemediationPreview:
    event = _get_or_404(repos, drift_id)
    planned = event.terraform_metadata.planned_actions or None
    plan_is_current = event.status not in _TERMINAL
    preview = preview_svc.build_preview(event, planned, plan_is_current)
    # Record the first preview as a Drift Replay timeline event.
    existing = repos.timeline.list(drift_id)
    if not any(e.type == TimelineEventType.REMEDIATION_PREVIEWED for e in existing):
        repos.timeline.append([replay.lifecycle_event(
            event.id, TimelineEventType.REMEDIATION_PREVIEWED,
            "Remediation preview generated",
            f"actions={preview.terraform_actions or 'unknown'} "
            f"risk {preview.risk_before.value} -> {preview.risk_after.value}",
            metadata={"confidence": preview.confidence})])
    return preview


# -- lifecycle ------------------------------------------------------------

@router.post("/{drift_id}/reconcile", response_model=ReconciliationProposal)
def reconcile(drift_id: str, body: ReconcileRequest,
              repos: Repositories = Depends(get_repositories),
              settings: Settings = Depends(get_settings),
              _: None = Depends(require_api_key)) -> ReconciliationProposal:
    event = _get_or_404(repos, drift_id)
    _assert_fresh(event, repos)

    proposal = reconciliation.build_proposal(event, body.strategy)
    repos.reconciliations.save(proposal)

    event.status = DriftStatus.REMEDIATION_REQUESTED
    events = [replay.lifecycle_event(
        event.id, TimelineEventType.REMEDIATION_STARTED,
        f"Remediation initiated: {body.strategy.value}",
        body.reason or "",
        metadata={"proposal_id": proposal.id, "strategy": body.strategy.value})]

    if body.strategy == RemediationStrategy.ACCEPT_DRIFT and body.create_pr:
        client = _github_client(settings)
        if client is None:
            proposal.reasons.append(
                "GitHub integration not configured; proposal saved without a PR.")
        elif proposal.recommended_tf_changes or proposal.status == "unsupported":
            files = reconciliation.proposal_files(proposal, event)
            try:
                pr = client.create_pr(
                    branch=f"plumbline/reconcile-{event.id[:8]}",
                    title=f"[PlumbLine] Accept drift: {event.resource_address}",
                    body="\n".join(proposal.reasons)
                         + "\n\nSee `EVIDENCE.md` in this PR for the full drift diff.",
                    files=files)
                proposal.pr_url, proposal.pr_number = pr.url, pr.number
                proposal.status = "pr_created"
                repos.reconciliations.save(proposal)
                events.append(replay.lifecycle_event(
                    event.id, TimelineEventType.PR_CREATED,
                    f"Reconciliation PR #{pr.number} opened", pr.url,
                    source="github", metadata={"pr_url": pr.url}))
                observability.incr("reconciliation_pr_total")
            except GitHubIntegrationError as e:
                proposal.status = "failed"
                repos.reconciliations.save(proposal)
                raise ApiError(502, f"GitHub PR creation failed: {e}") from e

    repos.drifts.save(event)
    repos.timeline.append(events)
    return proposal


@router.post("/{drift_id}/accept", response_model=ReconciliationProposal)
def accept_drift(drift_id: str, body: ReconcileRequest,
                 repos: Repositories = Depends(get_repositories),
                 settings: Settings = Depends(get_settings),
                 _: None = Depends(require_api_key)) -> ReconciliationProposal:
    """ACCEPT_DRIFT: deployed reality is intended; reconcile Terraform source.

    Produces an auditable proposal (and a PR when GitHub is configured). It
    never mutates Terraform state silently.
    """
    body.strategy = RemediationStrategy.ACCEPT_DRIFT
    proposal = reconcile(drift_id, body, repos, settings)
    event = _get_or_404(repos, drift_id)
    event.status = DriftStatus.ACCEPTED
    repos.drifts.save(event)
    repos.timeline.append([replay.lifecycle_event(
        event.id, TimelineEventType.DRIFT_ACCEPTED,
        "Drift accepted", body.reason or
        "Deployed state accepted; Terraform source reconciliation initiated.")])
    return proposal


@router.post("/{drift_id}/ignore", response_model=DriftEvent)
def ignore_drift(drift_id: str, body: IgnoreRequest,
                 repos: Repositories = Depends(get_repositories),
                 _: None = Depends(require_api_key)) -> DriftEvent:
    event = _get_or_404(repos, drift_id)
    _assert_fresh(event, repos)
    event.status = DriftStatus.IGNORED
    repos.drifts.save(event)
    repos.timeline.append([replay.lifecycle_event(
        event.id, TimelineEventType.DRIFT_IGNORED,
        "Drift ignored", body.reason or "")])
    return event


@router.post("/{drift_id}/acknowledge", response_model=DriftEvent)
def acknowledge_drift(drift_id: str,
                      repos: Repositories = Depends(get_repositories),
                      _: None = Depends(require_api_key)) -> DriftEvent:
    """Mark a drift event under investigation (INVESTIGATION_STARTED)."""
    event = _get_or_404(repos, drift_id)
    _assert_fresh(event, repos)
    event.status = DriftStatus.ACKNOWLEDGED
    repos.drifts.save(event)
    repos.timeline.append([replay.lifecycle_event(
        event.id, TimelineEventType.INVESTIGATION_STARTED,
        "Investigation started", "An engineer acknowledged the drift event.")])
    return event
