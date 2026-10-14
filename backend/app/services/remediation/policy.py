"""Auto-remediation eligibility policy.

Auto-remediation is OFF by default and only ever applies to narrow,
explicitly allowlisted drift patterns. It is gated by rule evaluation —
never by severity score alone — and the caller must still pass the
fingerprint/plan-hash freshness check before any apply is attempted.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.domain.models import DriftEvent

# Resource types eligible for tag-only auto remediation.
TAG_ONLY_ALLOWLIST = {
    "aws_instance", "aws_security_group", "aws_s3_bucket",
    "aws_lambda_function", "aws_db_instance", "aws_iam_role",
}

# Resource types eligible for rule-level auto remediation.
RULE_ALLOWLIST = {
    "aws_security_group",
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
}

PUBLIC_CIDRS = {"0.0.0.0/0", "::/0"}


@dataclass
class Eligibility:
    eligible: bool
    path: str  # "auto" | "pr" | "manual" | "disabled"
    reasons: list[str] = field(default_factory=list)
    rule_id: Optional[str] = None


def _tags_only(event: DriftEvent) -> bool:
    return bool(event.attribute_diffs) and all(
        d.path == "tags" or d.path.startswith("tags.") or d.path.startswith("tags[")
        for d in event.attribute_diffs
    )


def _public_exposure_only(event: DriftEvent) -> bool:
    """True when the drift only ADDED public ingress/egress exposure.

    Reconciliation then purely revokes out-of-band public rules — the safest
    possible SG remediation.
    """
    if event.resource_type not in RULE_ALLOWLIST:
        return False
    if "delete" in event.actions or sorted(event.actions) == ["create", "delete"]:
        return False
    cidrs = set()
    for d in event.attribute_diffs:
        if d.path.startswith(("ingress", "egress")) and ".cidr_blocks[" in d.path:
            if d.change_type.value == "added" and isinstance(d.after, str):
                cidrs.add(d.after)
        elif ".cidr_ipv4" in d.path or ".cidr_ipv6" in d.path:
            if isinstance(d.after, str):
                cidrs.add(d.after)
    return bool(cidrs) and cidrs <= PUBLIC_CIDRS


def evaluate(event: DriftEvent, *, enabled: bool, allow_production: bool,
             plan_hash_current: Optional[str] = None) -> Eligibility:
    reasons: list[str] = []
    if not enabled:
        return Eligibility(False, "disabled",
                           ["AUTO_REMEDIATION disabled by configuration."],
                           rule_id="AUTO_DISABLED")

    if event.status.value not in ("OPEN", "ACKNOWLEDGED"):
        return Eligibility(False, "manual", ["Drift is not in an actionable state."],
                           rule_id="NOT_ACTIONABLE")

    env = (event.environment or "").lower()
    if env in ("prod", "production", "prd") and not allow_production:
        return Eligibility(False, "pr",
                           ["Production drift requires pull-request reconciliation."],
                           rule_id="PROD_REQUIRES_PR")

    if sorted(event.actions) == ["create", "delete"] or event.actions == ["delete"]:
        return Eligibility(False, "pr",
                           ["Remediation would destroy or replace infrastructure; "
                            "automatic apply is never permitted."],
                           rule_id="DESTRUCTIVE_ACTION")

    if plan_hash_current is not None and \
            plan_hash_current != event.terraform_metadata.plan_hash:
        return Eligibility(False, "manual",
                           ["Stored plan no longer matches current plan; "
                            "drift is stale — rescan required."],
                           rule_id="STALE_PLAN")

    if _tags_only(event) and event.resource_type in TAG_ONLY_ALLOWLIST:
        return Eligibility(True, "auto",
                           ["Only tags drifted on an allowlisted resource type."],
                           rule_id="TAG_ONLY_DRIFT")

    if _public_exposure_only(event):
        return Eligibility(True, "auto",
                           ["Drift consists solely of added public SG rules; "
                            "apply revokes them."],
                           rule_id="SG_PUBLIC_RULE_REVOKE")

    reasons.append("Drift does not match any auto-remediation allowlist rule.")
    return Eligibility(False, "pr", reasons, rule_id="NO_ALLOWLIST_MATCH")
