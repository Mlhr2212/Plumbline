"""Security-group-specific deterministic drift rules.

Covers ``aws_security_group`` (inline ingress/egress blocks) and the newer
``aws_vpc_security_group_{ingress,egress}_rule`` resources. Rules compare the
before/after rule sets rather than raw JSON paths so semantic changes (a rule
widened vs. a rule added) classify correctly.
"""
from __future__ import annotations

import ipaddress
from typing import Any, Optional

from app.domain.models import RiskFactor

PUBLIC_V4 = "0.0.0.0/0"
PUBLIC_V6 = "::/0"

DANGEROUS_PORTS = {
    22: ("SG_PUBLIC_SSH", "SSH"),
    3389: ("SG_PUBLIC_RDP", "RDP"),
}
DATABASE_PORTS = {3306, 5432, 1433, 1521, 27017, 6379, 9200, 9300, 11211, 5984}

SUPPORTED_TYPES = {
    "aws_security_group",
    "aws_default_security_group",
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
}


def _cidrs(rule: dict[str, Any]) -> list[str]:
    out = []
    for key in ("cidr_blocks", "ipv6_cidr_blocks"):
        out.extend(rule.get(key) or [])
    for key in ("cidr_ipv4", "cidr_ipv6"):
        if rule.get(key):
            out.append(rule[key])
    return [str(c) for c in out]


def _is_public(cidr: str) -> bool:
    return cidr in (PUBLIC_V4, PUBLIC_V6)


def _is_broad(cidr: str) -> bool:
    """Non-private address space with a wide prefix (e.g. a public /8)."""
    if _is_public(cidr):
        return False  # handled by the public rules
    try:
        net = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False
    if net.prefixlen > 8:
        return False
    return not (net.is_private or net.is_loopback or net.is_link_local)


def _protocol(rule: dict[str, Any]) -> str:
    return str(rule.get("protocol", rule.get("ip_protocol", ""))).lower()


def _covers_port(rule: dict[str, Any], port: int) -> bool:
    proto = _protocol(rule)
    if proto in ("-1", "all"):
        return True
    try:
        return int(rule.get("from_port", -1)) <= port <= int(rule.get("to_port", -1))
    except (TypeError, ValueError):
        return False


def _all_protocol(rule: dict[str, Any]) -> bool:
    return _protocol(rule) in ("-1", "all")


def _identity(rule: dict[str, Any]) -> tuple:
    """Match key: protocol + port range. CIDR changes count as 'widened'."""
    return (_protocol(rule), rule.get("from_port"), rule.get("to_port"))


def _rules_of(obj: Optional[dict], direction: str) -> list[dict[str, Any]]:
    if not obj:
        return []
    rules = obj.get(direction) or []
    return [r for r in rules if isinstance(r, dict)]


def _score_exposure(rule: dict[str, Any], factors: list[RiskFactor], direction: str) -> None:
    if direction != "ingress":
        return
    cidrs = _cidrs(rule)
    if not cidrs:
        return
    public = any(_is_public(c) for c in cidrs)
    if not public:
        if any(_is_broad(c) for c in cidrs):
            factors.append(RiskFactor(
                rule_id="SG_BROAD_INGRESS", score=15,
                message=f"Ingress permits a broad non-private CIDR range ({', '.join(cidrs)}).",
            ))
        return
    if _all_protocol(rule):
        factors.append(RiskFactor(
            rule_id="SG_ALL_PROTOCOL_PUBLIC", score=35,
            message="All-protocol ingress is open to the entire internet (0.0.0.0/0 or ::/0).",
        ))
        return
    matched = False
    for port, (rule_id, label) in DANGEROUS_PORTS.items():
        if _covers_port(rule, port):
            factors.append(RiskFactor(
                rule_id=rule_id, score=35,
                message=f"{label} ingress is available from 0.0.0.0/0 or ::/0.",
            ))
            matched = True
            break
    if not matched and any(_covers_port(rule, p) for p in DATABASE_PORTS):
        factors.append(RiskFactor(
            rule_id="SG_PUBLIC_DATABASE", score=35,
            message="A database port is exposed to the entire internet.",
        ))
        matched = True
    if not matched:
        factors.append(RiskFactor(
            rule_id="SG_PUBLIC_INGRESS", score=25,
            message="Ingress is open to the entire internet (0.0.0.0/0 or ::/0).",
        ))


def _diff_sg_rules(ctx, direction: str) -> list[RiskFactor]:
    before_rules = _rules_of(ctx.before, direction)
    after_rules = _rules_of(ctx.after, direction)
    factors: list[RiskFactor] = []

    before_by_id = {_identity(r): r for r in before_rules}
    after_by_id = {_identity(r): r for r in after_rules}

    for ident, rule in after_by_id.items():
        prior = before_by_id.get(ident)
        if prior is None:
            _score_exposure(rule, factors, direction)
            continue
        added_cidrs = set(_cidrs(rule)) - set(_cidrs(prior))
        removed_cidrs = set(_cidrs(prior)) - set(_cidrs(rule))
        if added_cidrs:
            if any(_is_public(c) for c in added_cidrs):
                _score_exposure(rule, factors, direction)
            else:
                factors.append(RiskFactor(
                    rule_id="SG_BOUNDARY_WIDENED", score=20,
                    message=f"{direction.title()} rule widened to include {sorted(added_cidrs)}.",
                ))
        if removed_cidrs:
            factors.append(RiskFactor(
                rule_id="SG_BOUNDARY_NARROWED", score=5,
                message=f"{direction.title()} rule narrowed: removed {sorted(removed_cidrs)}.",
            ))

    for ident in before_by_id.keys() - after_by_id.keys():
        factors.append(RiskFactor(
            rule_id="SG_RULE_REMOVED", score=10,
            message=f"A {direction} rule present in Terraform state was removed "
                    f"({_identity_label(ident)}).",
        ))
    return _dedupe(factors)


def _identity_label(ident: tuple) -> str:
    proto, f, t = ident
    return f"protocol={proto} ports={f}-{t}"


def _evaluate_standalone_rule(ctx) -> list[RiskFactor]:
    """aws_vpc_security_group_(ingress|egress)_rule resources."""
    factors: list[RiskFactor] = []
    direction = "ingress" if "ingress" in ctx.resource_type else "egress"
    after = ctx.after or {}
    if direction == "ingress" and ctx.actions != ["delete"]:
        _score_exposure(after, factors, direction)
    if "delete" in ctx.actions:
        factors.append(RiskFactor(
            rule_id="SG_RULE_REMOVED", score=10,
            message=f"A {direction} rule resource was removed outside Terraform.",
        ))
    return _dedupe(factors)


def _dedupe(factors: list[RiskFactor]) -> list[RiskFactor]:
    seen: dict[str, RiskFactor] = {}
    for f in factors:
        if f.rule_id not in seen:
            seen[f.rule_id] = f
    return list(seen.values())


def evaluate(ctx) -> list[RiskFactor]:
    if ctx.resource_type in ("aws_vpc_security_group_ingress_rule",
                             "aws_vpc_security_group_egress_rule"):
        return _evaluate_standalone_rule(ctx)
    factors = _diff_sg_rules(ctx, "ingress")
    factors += _diff_sg_rules(ctx, "egress")
    return _dedupe(factors)
