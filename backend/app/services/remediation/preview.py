"""Remediation preview.

Explains what reconciliation is expected to do BEFORE it happens. All fields
are predictions derived from the stored Terraform plan and dependency graph;
nothing here is a guarantee — in particular ``downtime_expected`` reflects
detected replacement/deletion risk, not a promise of zero downtime.
"""
from __future__ import annotations

from typing import Optional

from app.domain.models import DriftEvent, RemediationPreview, Severity

# Types where an in-place "update" can still interrupt service.
_UPDATE_RISK_TYPES = {
    "aws_instance", "aws_launch_template", "aws_db_instance",
    "aws_rds_cluster", "aws_eks_node_group", "aws_elasticache_cluster",
    "aws_lambda_function",
}


def build_preview(event: DriftEvent, planned_actions: Optional[list[str]],
                  plan_is_current: bool) -> RemediationPreview:
    reasons: list[str] = []
    actions = planned_actions or []
    modified = destroyed = replaced = 0

    if planned_actions is None:
        reasons.append("No resource_change entry for this address in the stored "
                       "plan; preview confidence is reduced.")
    elif sorted(actions) == ["create", "delete"]:
        replaced = 1
        reasons.append("Terraform plans to REPLACE the resource (destroy + create).")
    elif "delete" in actions:
        destroyed = 1
        reasons.append("Terraform plans to DESTROY the resource.")
    elif "update" in actions:
        modified = 1
        reasons.append("Terraform plans an in-place update.")
    elif "create" in actions:
        modified = 1
        reasons.append("Terraform plans to create the resource.")
    elif actions == ["no-op"]:
        reasons.append("Plan shows no-op for this resource; drift may already "
                       "be reconciled or requires refresh.")
    else:
        reasons.append(f"Planned actions: {actions}.")

    dependents = event.dependency_context
    known = len(dependents.direct_dependents) + len(dependents.transitive_dependents)
    if known:
        reasons.append(f"{known} Terraform-declared dependent resource(s) may be affected.")
    if dependents.affected_critical_resources:
        reasons.append("Critical dependents include: "
                       + ", ".join(dependents.affected_critical_resources))

    downtime = bool(replaced or destroyed or
                    ("update" in actions and event.resource_type in _UPDATE_RISK_TYPES))
    if downtime:
        reasons.append("Service interruption is possible (replacement/deletion/"
                       "update-sensitive resource).")
    else:
        reasons.append("No downtime-inducing actions detected; not a guarantee "
                       "of zero downtime.")

    if planned_actions:
        risk_after = Severity.LOW
        reasons.append("Post-remediation risk assumes desired state is restored.")
    else:
        risk_after = Severity.MEDIUM
        reasons.append("Plan does not fully describe the corrective action; "
                       "residual risk is uncertain.")

    confidence = 0.9 if planned_actions else 0.6
    if not plan_is_current:
        confidence = 0.4
        reasons.append("Stored plan may be stale; a fresh scan is recommended.")

    return RemediationPreview(
        drift_event_id=event.id,
        resources_modified=modified,
        resources_destroyed=destroyed,
        resources_replaced=replaced,
        known_dependents=known,
        downtime_expected=downtime,
        risk_before=event.severity,
        risk_after=risk_after,
        terraform_actions=actions,
        confidence=round(confidence, 2),
        reasons=reasons,
    )
