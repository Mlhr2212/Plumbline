"""Generic risk rules applied to every drifted resource."""
from __future__ import annotations

from app.domain.models import RiskFactor

SECURITY_SENSITIVE_TYPES = {
    "aws_security_group",
    "aws_security_group_rule",
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
    "aws_network_acl",
    "aws_network_acl_rule",
    "aws_iam_role",
    "aws_iam_policy",
    "aws_iam_role_policy",
    "aws_iam_role_policy_attachment",
    "aws_iam_user_policy",
    "aws_iam_policy_attachment",
    "aws_kms_key",
    "aws_s3_bucket_policy",
    "aws_s3_bucket_public_access_block",
    "aws_route_table",
    "aws_default_security_group",
}

CRITICAL_DEPENDENT_TYPES = {
    "aws_db_instance",
    "aws_rds_cluster",
    "aws_eks_cluster",
    "aws_elasticache_cluster",
    "aws_lb",
    "aws_alb",
    "aws_iam_role",
    "aws_kms_key",
}

PRODUCTION_NAMES = {"prod", "production", "prd"}


def evaluate(ctx) -> list[RiskFactor]:
    factors: list[RiskFactor] = []

    if ctx.environment.lower() in PRODUCTION_NAMES:
        factors.append(RiskFactor(
            rule_id="GEN_PROD_ENVIRONMENT", score=15,
            message="Resource resides in a production environment.",
        ))

    if ctx.resource_type in SECURITY_SENSITIVE_TYPES:
        factors.append(RiskFactor(
            rule_id="GEN_SECURITY_RESOURCE", score=10,
            message=f"{ctx.resource_type} is an identity/network-security resource.",
        ))

    if ctx.actions == ["delete"] or "delete" in ctx.actions:
        factors.append(RiskFactor(
            rule_id="GEN_RESOURCE_DELETED", score=30,
            message="Resource was deleted outside of Terraform.",
        ))

    if sorted(ctx.actions) == ["create", "delete"]:
        factors.append(RiskFactor(
            rule_id="GEN_RESOURCE_REPLACED", score=25,
            message="Reconciliation requires resource replacement (destroy + create).",
        ))

    if ctx.diffs and all(d.path == "tags" or d.path.startswith("tags.") or d.path.startswith("tags[")
                         for d in ctx.diffs):
        factors.append(RiskFactor(
            rule_id="GEN_TAGS_ONLY", score=3,
            message="Only resource tags drifted; no functional change detected.",
        ))

    if ctx.attribution_status == "unknown" and ctx.diffs:
        factors.append(RiskFactor(
            rule_id="GEN_UNKNOWN_ATTRIBUTION", score=10,
            message="No CloudTrail actor could be identified for this change.",
        ))

    return factors
