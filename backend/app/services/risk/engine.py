"""Deterministic, explainable risk scoring engine.

Score range 0-100. Every point is attributed to a named rule with a
human-readable explanation — scoring is a sum of evidence, never a model
opinion.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.domain.models import AttributeDiff, RiskFactor, Severity
from app.services.risk.rules import generic, iam, security_group

SEVERITY_BANDS = [
    (75, Severity.CRITICAL),
    (50, Severity.HIGH),
    (25, Severity.MEDIUM),
    (1, Severity.LOW),
    (0, Severity.INFO),
]


@dataclass
class RiskContext:
    resource_type: str
    environment: str
    actions: list[str] = field(default_factory=list)
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    diffs: list[AttributeDiff] = field(default_factory=list)
    attribution_status: str = "unknown"


@dataclass
class RiskResult:
    score: int
    severity: Severity
    factors: list[RiskFactor]


# Resource-type dispatch; "*" applies to everything.
_RULES: dict[str, list[Callable[[RiskContext], list[RiskFactor]]]] = {
    "*": [generic.evaluate],
}
for _t in security_group.SUPPORTED_TYPES:
    _RULES.setdefault(_t, []).append(security_group.evaluate)
for _t in iam.SUPPORTED_TYPES:
    _RULES.setdefault(_t, []).append(iam.evaluate)


def severity_for(score: int) -> Severity:
    for threshold, sev in SEVERITY_BANDS:
        if score >= threshold:
            return sev
    return Severity.INFO


def evaluate(ctx: RiskContext) -> RiskResult:
    factors: list[RiskFactor] = []
    for rule_fn in _RULES.get("*", []) + _RULES.get(ctx.resource_type, []):
        factors.extend(rule_fn(ctx))

    # Dedupe by rule_id, keeping the highest-scoring instance.
    best: dict[str, RiskFactor] = {}
    for f in factors:
        if f.rule_id not in best or f.score > best[f.rule_id].score:
            best[f.rule_id] = f
    merged = sorted(best.values(), key=lambda f: -f.score)

    score = min(100, sum(f.score for f in merged))
    return RiskResult(score=score, severity=severity_for(score), factors=merged)
