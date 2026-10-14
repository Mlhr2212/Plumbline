"""Reconciliation proposal builder.

Two strategies:

* ``RESTORE_DESIRED`` — `terraform apply` restores the declared state. No code
  change is required; the proposal documents evidence and expected actions.
* ``ACCEPT_DRIFT`` — the deployed reality is intentional; Terraform source must
  be updated. For a narrow, well-understood set of resources we generate
  *structured* proposed changes (never naive string rewriting). Anything else
  produces a proposal marked ``unsupported`` so humans handle it.
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from app.domain.models import (
    DriftEvent, EvidenceItem, ReconciliationProposal, RemediationStrategy,
)

_GENERATORS_NOTE = (
    "Generated change suggestions are review artifacts; a human must apply "
    "them to the appropriate .tf file before merging."
)


def _tf_changes_for_accept(event: DriftEvent) -> tuple[list[dict[str, Any]], list[str]]:
    """Return (recommended_tf_changes, reasons). Empty list => unsupported."""
    reasons: list[str] = []
    diffs = event.attribute_diffs

    # 1. Tag-only drift — safe for any resource type.
    if diffs and all(d.path.startswith("tags") for d in diffs):
        return ([{
            "op": "update_attribute",
            "attribute": "tags",
            "resource": event.resource_address,
            "value": {d.path.split(".", 1)[-1]: d.after for d in diffs
                      if "." in d.path},
        }], ["Tag drift can be reconciled declaratively."])

    # 2. Security-group rule additions (the signature demo scenario).
    if event.resource_type in ("aws_security_group", "aws_default_security_group"):
        added = [d for d in diffs
                 if d.path.startswith(("ingress[", "egress[")) and "." not in d.path]
        if added:
            return ([{
                "op": "add_block",
                "attribute": d.path.split("[")[0],
                "resource": event.resource_address,
                "value": d.after,
            } for d in added],
            [_GENERATORS_NOTE])
        reasons.append("SG diff is intra-rule (widened/narrowed); manual review required.")
        return ([], reasons)

    # 3. IAM policy document replacement.
    if event.resource_type in ("aws_iam_policy", "aws_iam_role_policy", "aws_iam_user_policy"):
        doc_diff = next((d for d in diffs if d.path == "policy"), None)
        if doc_diff and doc_diff.after:
            return ([{
                "op": "replace_attribute",
                "attribute": "policy",
                "resource": event.resource_address,
                "value": doc_diff.after,
            }], ["Policy document can be updated to match deployed state; "
                 "review carefully for unintended privilege grants."])

    reasons.append(
        f"No safe generator for {event.resource_type}; manual reconciliation required.")
    return ([], reasons)


def build_proposal(event: DriftEvent, strategy: RemediationStrategy) -> ReconciliationProposal:
    proposal = ReconciliationProposal(
        id=str(uuid.uuid4()),
        drift_event_id=event.id,
        strategy=strategy,
        resource_address=event.resource_address,
        changed_attributes=event.attribute_diffs,
        risk=event.severity,
        evidence=[EvidenceItem(kind="drift_event",
                               summary=f"Drift fingerprint {event.fingerprint[:12]}",
                               data={"severity": event.severity.value,
                                     "risk_score": event.risk_score})],
    )

    if strategy == RemediationStrategy.RESTORE_DESIRED:
        proposal.status = "draft"
        proposal.reasons = [
            "terraform apply will reconcile the resource to the declared configuration.",
            "No Terraform code change is required.",
        ]
        return proposal

    if strategy == RemediationStrategy.ACCEPT_DRIFT:
        changes, reasons = _tf_changes_for_accept(event)
        proposal.recommended_tf_changes = changes
        proposal.reasons = reasons
        proposal.status = "draft" if changes else "unsupported"
        return proposal

    proposal.status = "unsupported"
    proposal.reasons = ["Manual remediation strategy; no generated changes."]
    return proposal


def proposal_files(proposal: ReconciliationProposal, event: DriftEvent) -> dict[str, str]:
    """Render a proposal into reviewable PR files."""
    base = f"plumbline-reconciliations/{proposal.id}"
    lines = [
        f"# PlumbLine reconciliation — {event.resource_address}",
        "",
        f"- Drift event: `{event.id}`",
        f"- Strategy: `{proposal.strategy.value}`",
        f"- Severity: {event.severity.value} (score {event.risk_score})",
        f"- Environment: {event.environment}",
        "",
        "## Attribute drift",
        "| Path | Before | After | Change |",
        "|---|---|---|---|",
    ]
    for d in event.attribute_diffs[:100]:
        b = "<sensitive>" if d.sensitive else json.dumps(d.before, default=str)
        a = "<sensitive>" if d.sensitive else json.dumps(d.after, default=str)
        lines.append(f"| `{d.path}` | {b} | {a} | {d.change_type.value} |")
    lines += ["", "## Reasons", *[f"- {r}" for r in proposal.reasons]]
    files = {f"{base}/EVIDENCE.md": "\n".join(lines) + "\n"}

    if proposal.recommended_tf_changes:
        files[f"{base}/proposed-changes.json"] = json.dumps(
            {"resource": event.resource_address,
             "changes": proposal.recommended_tf_changes},
            indent=2, default=str) + "\n"
    return files
