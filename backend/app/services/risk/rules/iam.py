"""IAM-specific deterministic drift rules.

Covers aws_iam_policy, aws_iam_role (trust policy + inline policies),
aws_iam_role_policy, and *policy_attachment resources. Policy documents are
parsed and compared as statement sets — never as raw strings.
"""
from __future__ import annotations

from typing import Any, Optional

from app.domain.models import RiskFactor
from app.services.risk import policy_doc

SUPPORTED_TYPES = {
    "aws_iam_role",
    "aws_iam_policy",
    "aws_iam_role_policy",
    "aws_iam_user_policy",
    "aws_iam_role_policy_attachment",
    "aws_iam_policy_attachment",
    "aws_iam_user_policy_attachment",
}

ADMIN_POLICY_ARNS = {"AdministratorAccess", "arn:aws:iam::aws:policy/AdministratorAccess"}
PRIVILEGE_PREFIXES = ("iam:", "organizations:", "account:")


def _policy_field(resource_type: str) -> Optional[str]:
    if resource_type in ("aws_iam_policy", "aws_iam_role_policy", "aws_iam_user_policy"):
        return "policy"
    return None


def _added_removed(before_set: set, after_set: set) -> tuple[set, set]:
    return after_set - before_set, before_set - after_set


def _score_permission_delta(before_doc, after_doc, factors: list[RiskFactor]) -> None:
    """Compare two parsed policy documents."""
    b_actions, a_actions = policy_doc.allowed_actions(before_doc), policy_doc.allowed_actions(after_doc)
    b_res, a_res = policy_doc.allowed_resources(before_doc), policy_doc.allowed_resources(after_doc)
    added_actions, removed_actions = _added_removed(b_actions, a_actions)
    added_res, removed_res = _added_removed(b_res, a_res)

    if policy_doc.is_admin_like(a_actions, a_res) and not policy_doc.is_admin_like(b_actions, b_res):
        factors.append(RiskFactor(
            rule_id="IAM_ADMIN_LIKE", score=45,
            message="Policy now grants admin-like access (wildcard actions on all resources).",
        ))
    else:
        if "*" in added_actions:
            factors.append(RiskFactor(
                rule_id="IAM_ACTION_WILDCARD", score=40,
                message='Policy now allows Action "*".',
            ))
        if "*" in added_res:
            factors.append(RiskFactor(
                rule_id="IAM_RESOURCE_WILDCARD", score=30,
                message='Policy now applies to Resource "*".',
            ))

    escalations = sorted(a for a in added_actions
                         if a == "*" or any(a.startswith(p) for p in PRIVILEGE_PREFIXES))
    if escalations and "IAM_ADMIN_LIKE" not in {f.rule_id for f in factors} \
            and "*" not in added_actions:
        factors.append(RiskFactor(
            rule_id="IAM_PRIVILEGE_ESCALATION", score=30,
            message=f"New privilege-bearing actions added: {escalations[:5]}.",
        ))
    if added_actions and not escalations and "*" not in added_actions:
        factors.append(RiskFactor(
            rule_id="IAM_ACTIONS_ADDED", score=15,
            message=f"Additional actions permitted: {sorted(added_actions)[:5]}.",
        ))
    if removed_actions or removed_res:
        factors.append(RiskFactor(
            rule_id="IAM_PRIVILEGE_REDUCED", score=5,
            message="Permissions were removed (privilege reduction).",
        ))
    if policy_doc.has_unanalyzable_notaction(after_doc):
        factors.append(RiskFactor(
            rule_id="IAM_NOTACTION_PRESENT", score=10,
            message="Policy uses NotAction; effective permissions are hard to bound.",
        ))


def _evaluate_document(ctx, field: str) -> list[RiskFactor]:
    before_doc = policy_doc.load_policy((ctx.before or {}).get(field))
    after_doc = policy_doc.load_policy((ctx.after or {}).get(field))
    factors: list[RiskFactor] = []
    if before_doc == after_doc:
        return factors
    if before_doc is None and after_doc is not None:
        factors.append(RiskFactor(
            rule_id="IAM_POLICY_ADDED", score=20,
            message="A new policy document was added outside Terraform.",
        ))
    if after_doc is None and before_doc is not None:
        factors.append(RiskFactor(
            rule_id="IAM_POLICY_REMOVED", score=15,
            message="A managed policy document was removed outside Terraform.",
        ))
        return factors
    _score_permission_delta(before_doc, after_doc, factors)
    return factors


def _evaluate_trust(ctx) -> list[RiskFactor]:
    before_doc = policy_doc.load_policy((ctx.before or {}).get("assume_role_policy"))
    after_doc = policy_doc.load_policy((ctx.after or {}).get("assume_role_policy"))
    if before_doc == after_doc:
        return []
    added_principals = policy_doc.trusted_principals(after_doc) - policy_doc.trusted_principals(before_doc)
    if not added_principals:
        return [RiskFactor(
            rule_id="IAM_TRUST_MODIFIED", score=15,
            message="Assume-role trust policy changed.",
        )]
    if "*" in added_principals:
        return [RiskFactor(
            rule_id="IAM_TRUST_PUBLIC", score=45,
            message="Trust policy now allows ANY principal to assume this role.",
        )]
    return [RiskFactor(
        rule_id="IAM_TRUST_WIDENED", score=30,
        message=f"Trust policy widened to new principals: {sorted(added_principals)[:5]}.",
    )]


def _evaluate_attachment(ctx) -> list[RiskFactor]:
    after = ctx.after or {}
    factors: list[RiskFactor] = []
    arn = str(after.get("policy_arn") or "")
    short = arn.rsplit("/", 1)[-1]
    if "delete" in ctx.actions:
        factors.append(RiskFactor(
            rule_id="IAM_POLICY_DETACHED", score=15,
            message="A managed policy attachment was removed outside Terraform.",
        ))
        return factors
    if arn in ADMIN_POLICY_ARNS or short == "AdministratorAccess":
        factors.append(RiskFactor(
            rule_id="IAM_ADMIN_ATTACHMENT", score=40,
            message="AdministratorAccess (or equivalent) was attached outside Terraform.",
        ))
    else:
        factors.append(RiskFactor(
            rule_id="IAM_ATTACHMENT_ADDED", score=15,
            message=f"A managed policy was attached outside Terraform ({short or 'unknown'}).",
        ))
    return factors


def _evaluate_role_inline(ctx) -> list[RiskFactor]:
    """Inline policies on aws_iam_role are nested blocks: [{name, policy}]."""
    factors: list[RiskFactor] = []
    b = {p.get("name"): p.get("policy") for p in (ctx.before or {}).get("inline_policy") or []}
    a = {p.get("name"): p.get("policy") for p in (ctx.after or {}).get("inline_policy") or []}
    for name in a.keys() - b.keys():
        factors.append(RiskFactor(
            rule_id="IAM_INLINE_POLICY_ADDED", score=20,
            message=f"Inline policy {name!r} was added outside Terraform.",
        ))
        _score_permission_delta(None, policy_doc.load_policy(a[name]), factors)
    for name in b.keys() - a.keys():
        factors.append(RiskFactor(
            rule_id="IAM_POLICY_REMOVED", score=15,
            message=f"Inline policy {name!r} was removed outside Terraform.",
        ))
    for name in a.keys() & b.keys():
        if a[name] != b[name]:
            _score_permission_delta(policy_doc.load_policy(b[name]),
                                    policy_doc.load_policy(a[name]), factors)
    return _dedupe(factors)


def _dedupe(factors: list[RiskFactor]) -> list[RiskFactor]:
    seen: dict[str, RiskFactor] = {}
    for f in factors:
        if f.rule_id not in seen:
            seen[f.rule_id] = f
    return list(seen.values())


def evaluate(ctx) -> list[RiskFactor]:
    if ctx.resource_type.endswith("policy_attachment"):
        return _evaluate_attachment(ctx)
    factors: list[RiskFactor] = []
    field = _policy_field(ctx.resource_type)
    if field:
        factors += _evaluate_document(ctx, field)
    if ctx.resource_type == "aws_iam_role":
        factors += _evaluate_trust(ctx)
        factors += _evaluate_role_inline(ctx)
        # managed_policy_arns changes behave like attachments
        b = set((ctx.before or {}).get("managed_policy_arns") or [])
        a = set((ctx.after or {}).get("managed_policy_arns") or [])
        for arn in a - b:
            short = str(arn).rsplit("/", 1)[-1]
            if short == "AdministratorAccess" or arn in ADMIN_POLICY_ARNS:
                factors.append(RiskFactor(
                    rule_id="IAM_ADMIN_ATTACHMENT", score=40,
                    message="AdministratorAccess was attached outside Terraform.",
                ))
            else:
                factors.append(RiskFactor(
                    rule_id="IAM_ATTACHMENT_ADDED", score=15,
                    message=f"Managed policy {short!r} attached outside Terraform.",
                ))
        for arn in b - a:
            factors.append(RiskFactor(
                rule_id="IAM_POLICY_DETACHED", score=15,
                message=f"Managed policy {str(arn).rsplit('/', 1)[-1]!r} detached outside Terraform.",
            ))
    return _dedupe(factors)
