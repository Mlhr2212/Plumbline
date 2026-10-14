"""Scan ingestion pipeline.

    plan JSON -> parse -> resource_drift extraction -> attribute diff
    -> fingerprint/dedupe -> risk -> attribution -> dependency summary
    -> remediation eligibility -> persist drift + timeline -> resolve pass

Terraform exit codes are handled per contract: 0 = clean, 1 = plan error,
2 = changes present. Exit code 2 is NOT a failure.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import timedelta
from typing import Optional

from app import observability
from app.config.settings import Settings
from app.domain.models import (
    ApiError, DriftEvent, DriftStatus, EvidenceItem, RecommendedAction,
    Scan, ScanIngestRequest, ScanStatus, TerraformMetadata,
    TimelineEventType, aws_service_for, utcnow,
)
from app.parsers.terraform_plan import TerraformPlan, parse_plan
from app.repositories.factory import Repositories
from app.services.attribution.enricher import CloudTrailEnricher
from app.services.dependencies.graph import blast_radius
from app.services.drift import diff as diff_engine
from app.services.drift import fingerprint as fp
from app.services.drift import replay
from app.services.remediation import policy as remediation_policy
from app.services.risk import engine as risk_engine

log = logging.getLogger("plumbline.ingest")

_PLAN_ERROR_EXIT_CODES = {1}


def _config_region(plan: TerraformPlan) -> str:
    try:
        expr = plan.configuration["provider_config"]["aws"]["expressions"]["region"]
        return expr.get("constant_value") or ""
    except (KeyError, TypeError):
        return ""


def _load_artifact(uri: str, max_bytes: int, settings: Settings) -> dict:
    """Fetch a plan artifact from S3 (s3://bucket/key)."""
    if not uri.startswith("s3://"):
        raise ApiError(422, f"unsupported artifact URI scheme: {uri!r}")
    bucket, _, key = uri[5:].partition("/")
    if not bucket or not key:
        raise ApiError(422, f"malformed artifact URI: {uri!r}")
    import boto3
    s3 = boto3.client("s3", region_name=settings.aws_region)
    head = s3.head_object(Bucket=bucket, Key=key)
    if head.get("ContentLength", 0) > max_bytes:
        raise ApiError(413, "plan artifact exceeds maximum allowed size")
    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read(max_bytes + 1)
    if len(body) > max_bytes:
        raise ApiError(413, "plan artifact exceeds maximum allowed size")
    try:
        return json.loads(body)
    except ValueError:
        raise ApiError(422, "plan artifact is not valid JSON")


class IngestionPipeline:
    def __init__(self, settings: Settings, repos: Repositories,
                 enricher: Optional[CloudTrailEnricher] = None):
        self._s = settings
        self._repos = repos
        self._enricher = enricher

    # -- public ---------------------------------------------------------

    def ingest(self, req: ScanIngestRequest) -> Scan:
        scan = Scan(
            id=str(uuid.uuid4()), environment=req.environment,
            repository=req.repository, commit_sha=req.commit_sha,
            workspace=req.workspace, regions=req.regions,
            account_id=req.account_id,
            terraform_exit_code=req.terraform_exit_code,
        )
        self._repos.scans.save(scan)
        observability.incr("scans_total")
        log.info("scan started", extra={"scan_id": scan.id,
                                        "environment": scan.environment})

        try:
            return self._run(scan, req)
        except ApiError as e:
            self._fail(scan, e.detail)
            raise
        except Exception as e:  # noqa: BLE001 — mark the scan, then surface
            log.exception("scan failed", extra={"scan_id": scan.id})
            self._fail(scan, f"internal error: {type(e).__name__}")
            raise ApiError(500, "ingestion failed") from e

    # -- internals ------------------------------------------------------

    def _fail(self, scan: Scan, error: str) -> None:
        scan.status = ScanStatus.FAILED
        scan.error = error
        scan.completed_at = utcnow()
        self._repos.scans.save(scan)
        observability.incr("scan_failures_total")

    def _run(self, scan: Scan, req: ScanIngestRequest) -> Scan:
        if req.terraform_exit_code in _PLAN_ERROR_EXIT_CODES:
            self._fail(scan, "terraform plan exited with an error (exit code 1)")
            return scan

        plan_json = req.plan_json
        if plan_json is None and req.plan_artifact_uri:
            plan_json = _load_artifact(req.plan_artifact_uri,
                                       self._s.ingest_max_plan_bytes, self._s)
        if plan_json is None:
            raise ApiError(422, "scan requires plan_json or plan_artifact_uri")

        plan = parse_plan(plan_json, self._s.supported_plan_format_major)
        region = req.regions[0] if req.regions else _config_region(plan)
        phash = fp.plan_hash(plan_json)

        scan.plan_format_version = plan.format_version
        scan.terraform_version = plan.terraform_version
        scan.plan_hash = phash

        drifted_addresses: set[str] = set()
        for res in plan.resource_drift:
            if not res.is_managed or res.change.actions == ["no-op"]:
                continue
            drifted_addresses.add(res.address)
            self._process_drift(scan, req, plan, res, region, phash)

        resolved = self._resolve_pass(scan, req.environment, drifted_addresses)

        scan.status = ScanStatus.COMPLETED
        scan.drift_detected = len(drifted_addresses)
        scan.drift_resolved = resolved
        scan.completed_at = utcnow()
        self._repos.scans.save(scan)
        self._refresh_active_gauge(req.environment)
        log.info("scan completed",
                 extra={"scan_id": scan.id, "environment": scan.environment})
        return scan

    def _process_drift(self, scan: Scan, req: ScanIngestRequest,
                       plan: TerraformPlan, res, region: str, phash: str) -> None:
        diffs = diff_engine.diff(
            res.change.before, res.change.after,
            res.change.before_sensitive, res.change.after_sensitive)
        if not diffs:
            diffs = []  # e.g. pure renames; event still recorded via actions

        fingerprint = fp.fingerprint_drift(req.environment, res.address, diffs)
        existing = self._repos.drifts.find_by_fingerprint(fingerprint)
        if existing is not None:
            existing.last_seen_at = utcnow()
            existing.scan_count += 1
            existing.scan_id = scan.id
            self._repos.drifts.save(existing)
            log.info("drift re-observed",
                     extra={"scan_id": scan.id, "drift_event_id": existing.id,
                            "resource_address": res.address})
            return

        # Materially different drift on a resource with an open event:
        # supersede the old record so incidents reflect current reality.
        for old in self._repos.drifts.find_open_for_resource(req.environment,
                                                             res.address):
            old.status = DriftStatus.SUPERSEDED
            old.resolved_at = utcnow()
            self._repos.drifts.save(old)
            self._repos.timeline.append([replay.lifecycle_event(
                old.id, TimelineEventType.DRIFT_RESOLVED,
                "Superseded by new drift",
                "The drifted state changed materially; a new event was created.")])

        detected = utcnow()
        attribution = self._attribution(res, detected, req.account_id, region)

        ctx = risk_engine.RiskContext(
            resource_type=res.type, environment=req.environment,
            actions=res.change.actions, before=res.change.before,
            after=res.change.after, diffs=diffs,
            attribution_status=attribution.status)
        risk = risk_engine.evaluate(ctx)

        deps = blast_radius(res.address, plan)

        event = DriftEvent(
            id=str(uuid.uuid4()), scan_id=scan.id, fingerprint=fingerprint,
            resource_address=res.address, resource_type=res.type,
            resource_name=res.name, provider=res.provider_short or "aws",
            aws_service=aws_service_for(res.type),
            environment=req.environment, region=region,
            aws_account_id=req.account_id, actions=res.change.actions,
            severity=risk.severity, risk_score=risk.score,
            attribute_diffs=diffs, cloudtrail_attribution=attribution,
            risk_factors=risk.factors, dependency_context=deps,
            terraform_metadata=TerraformMetadata(
                format_version=plan.format_version,
                terraform_version=plan.terraform_version,
                workspace=req.workspace, plan_hash=phash,
                resource_changes=len(plan.resource_changes),
                resources_drifted=len(plan.resource_drift),
                actions=res.change.actions,
                planned_actions=(plan.change_for(res.address).change.actions
                                 if plan.change_for(res.address) else [])),
            evidence=[EvidenceItem(
                kind="terraform_plan",
                summary="resource_drift entry from terraform show -json",
                data={"address": res.address, "actions": res.change.actions,
                      "action_reason": res.change.action_reason}),
            ],
        )

        eligibility = remediation_policy.evaluate(
            event, enabled=self._s.auto_remediation_enabled,
            allow_production=self._s.auto_remediation_allow_production,
            plan_hash_current=phash)
        event.remediation_eligibility = {
            "eligible": eligibility.eligible, "path": eligibility.path,
            "rule_id": eligibility.rule_id, "reasons": eligibility.reasons,
        }
        event.recommended_action = self._recommended(eligibility.path, risk.severity)

        self._repos.drifts.save(event)
        self._repos.timeline.append(replay.detection_timeline(event, scan, attribution))
        observability.incr("drift_detected_total")
        log.info("drift detected",
                 extra={"scan_id": scan.id, "drift_event_id": event.id,
                        "resource_address": res.address,
                        "environment": req.environment})

    def _attribution(self, res, detected, account_id: str, region: str):
        if not self._enricher or not self._s.attribution_enabled:
            from app.domain.models import Attribution, AttributionSource
            return Attribution(source=AttributionSource.NONE, status="disabled")
        return self._enricher.enrich(res.type, res.change.before,
                                     res.change.after, detected,
                                     account_id=account_id, region=region)

    @staticmethod
    def _recommended(path: str, severity) -> RecommendedAction:
        from app.domain.models import Severity
        if path == "auto":
            return RecommendedAction.AUTO_REMEDIATE_ELIGIBLE
        if severity in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM):
            return RecommendedAction.CREATE_PR
        return RecommendedAction.INVESTIGATE

    def _resolve_pass(self, scan: Scan, environment: str,
                      drifted_addresses: set[str]) -> int:
        """Drift that disappeared since the last scan => resource returned to
        desired state (or the resource itself was deleted from state)."""
        resolved = 0
        for event in self._repos.drifts.list_open(environment):
            if event.scan_id == scan.id or event.resource_address in drifted_addresses:
                continue
            if event.terraform_metadata.workspace != scan.workspace:
                continue  # different workspace; do not resolve its drift
            event.status = DriftStatus.RESOLVED
            event.resolved_at = utcnow()
            self._repos.drifts.save(event)
            duration = (event.resolved_at - event.first_seen_at).total_seconds()
            observability.incr("drift_resolved_total")
            observability.incr("drift_resolution_time_seconds", duration)
            self._repos.timeline.append([replay.lifecycle_event(
                event.id, TimelineEventType.DRIFT_RESOLVED,
                "Drift resolved",
                "A subsequent scan found the resource back in desired state.",
                metadata={"scan_id": scan.id,
                          "duration_seconds": duration})])
            resolved += 1
        return resolved

    def _refresh_active_gauge(self, environment: str) -> None:
        try:
            observability.set_gauge(
                "active_drift",
                len(self._repos.drifts.list_open(environment)))
        except Exception:  # noqa: BLE001 — metrics must never break ingestion
            pass
