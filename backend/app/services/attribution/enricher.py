"""CloudTrail attribution enrichment.

Correlates a drifted resource with CloudTrail events using deterministic
confidence scoring. Attribution is never presented as guaranteed — a low-
confidence result yields ``status: "unknown"`` rather than a fabricated actor.

Confidence inputs:
  * resource identifier present in the event (exact match)   +0.50
  * event name is a known mutating API for the resource type +0.20
  * time proximity to detection                              +0.05-0.15
  * same region                                              +0.05
  * actor ARN in the same account                            +0.05
  * event carries an error code (a failed attempt)           capped at 0.35
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Protocol

from app.domain.models import Attribution, AttributionSource

# resource type -> (identifier attribute candidates, mutating CloudTrail events)
RESOURCE_EVENTS: dict[str, tuple[list[str], set[str]]] = {
    "aws_security_group": (
        ["id", "arn", "name"],
        {"AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress",
         "RevokeSecurityGroupIngress", "RevokeSecurityGroupEgress",
         "ModifySecurityGroupRules", "UpdateSecurityGroupRuleDescriptionsIngress",
         "UpdateSecurityGroupRuleDescriptionsEgress"},
    ),
    "aws_vpc_security_group_ingress_rule": (
        ["id", "arn"],
        {"AuthorizeSecurityGroupIngress", "ModifySecurityGroupRules",
         "RevokeSecurityGroupIngress"},
    ),
    "aws_vpc_security_group_egress_rule": (
        ["id", "arn"],
        {"AuthorizeSecurityGroupEgress", "ModifySecurityGroupRules",
         "RevokeSecurityGroupEgress"},
    ),
    "aws_iam_role": (
        ["name", "arn", "id"],
        {"UpdateAssumeRolePolicy", "AttachRolePolicy", "DetachRolePolicy",
         "PutRolePolicy", "DeleteRolePolicy", "UpdateRole", "TagRole", "UntagRole"},
    ),
    "aws_iam_policy": (
        ["arn", "name", "id"],
        {"CreatePolicyVersion", "SetDefaultPolicyVersion", "DeletePolicyVersion"},
    ),
    "aws_iam_role_policy": (
        ["name", "id"],
        {"PutRolePolicy", "DeleteRolePolicy", "UpdateRolePolicy"},
    ),
    "aws_iam_role_policy_attachment": (
        ["role", "policy_arn"],
        {"AttachRolePolicy", "DetachRolePolicy"},
    ),
    "aws_instance": (
        ["id", "arn"],
        {"ModifyInstanceAttribute", "RunInstances", "StopInstances",
         "StartInstances", "TerminateInstances", "RebootInstances"},
    ),
    "aws_s3_bucket": (
        ["bucket", "id", "arn"],
        {"PutBucketPolicy", "DeleteBucketPolicy", "PutBucketAcl",
         "PutBucketVersioning", "PutBucketEncryption", "PutPublicAccessBlock"},
    ),
    "aws_lambda_function": (
        ["function_name", "arn", "id"],
        {"UpdateFunctionConfiguration", "UpdateFunctionCode", "DeleteFunction",
         "PutFunctionConcurrency", "AddPermission", "RemovePermission"},
    ),
}

_DEFAULT_IDENTIFIERS = ["id", "arn", "name"]


@dataclass
class TrailEvent:
    event_name: str
    event_time: Optional[datetime] = None
    actor: Optional[str] = None          # principal ARN / username
    actor_type: Optional[str] = None     # IAMUser | AssumedRole | Root | ...
    session: Optional[str] = None
    event_id: Optional[str] = None
    source_ip: Optional[str] = None
    user_agent: Optional[str] = None
    region: Optional[str] = None
    resources: list[str] = field(default_factory=list)
    request_parameters: dict[str, Any] = field(default_factory=dict)
    error_code: Optional[str] = None


class TrailLookup(Protocol):
    """Abstraction over CloudTrail LookupEvents (or a fixture in tests)."""
    def lookup(self, identifiers: list[str], event_names: set[str],
               start: datetime, end: datetime, region: str) -> list[TrailEvent]:
        ...


def _flatten_values(obj: Any, out: set[str]) -> None:
    if isinstance(obj, str):
        out.add(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _flatten_values(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _flatten_values(v, out)


def _event_strings(ev: TrailEvent) -> set[str]:
    vals = set(ev.resources)
    _flatten_values(ev.request_parameters, vals)
    return vals


class CloudTrailEnricher:
    def __init__(self, lookup: Optional[TrailLookup], lookback_hours: int = 72):
        self.lookup = lookup
        self.lookback_hours = lookback_hours

    def enrich(self, resource_type: str, before: Optional[dict], after: Optional[dict],
               detected_at: datetime, account_id: str = "", region: str = "") -> Attribution:
        if self.lookup is None:
            return Attribution(source=AttributionSource.NONE, status="disabled",
                               confidence=0.0)

        ident_fields, known_events = RESOURCE_EVENTS.get(
            resource_type, (_DEFAULT_IDENTIFIERS, set()))
        identifiers = self._identifiers(before, after, ident_fields)
        if not identifiers:
            return Attribution(source=AttributionSource.CLOUDTRAIL, status="unknown",
                               confidence=0.0)

        end = detected_at if detected_at.tzinfo else detected_at.replace(tzinfo=timezone.utc)
        start = end - timedelta(hours=self.lookback_hours)
        try:
            events = self.lookup.lookup(identifiers, known_events, start, end, region)
        except Exception:
            # Attribution is best-effort enrichment; never fail ingestion.
            return Attribution(source=AttributionSource.CLOUDTRAIL, status="unknown",
                               confidence=0.0)

        scored = sorted(
            ((self._score(ev, identifiers, known_events, end, account_id, region), ev)
             for ev in events),
            key=lambda t: t[0], reverse=True,
        )
        candidates = [{
            "actor": ev.actor, "event_name": ev.event_name,
            "event_time": ev.event_time.isoformat() if ev.event_time else None,
            "event_id": ev.event_id, "confidence": round(c, 3),
        } for c, ev in scored[:3] if c > 0]

        if not scored or scored[0][0] < 0.3:
            return Attribution(source=AttributionSource.CLOUDTRAIL, status="unknown",
                               confidence=0.0, candidates=candidates)

        conf, best = scored[0]
        return Attribution(
            actor=best.actor, actor_type=best.actor_type,
            event_name=best.event_name, event_time=best.event_time,
            source_ip=best.source_ip, user_agent=best.user_agent,
            event_id=best.event_id, confidence=round(conf, 3),
            source=AttributionSource.CLOUDTRAIL,
            status="identified" if conf >= 0.7 else "candidate",
            candidates=candidates,
        )

    @staticmethod
    def _identifiers(before: Optional[dict], after: Optional[dict],
                     fields: list[str]) -> list[str]:
        out: list[str] = []
        for obj in (after, before):
            if not isinstance(obj, dict):
                continue
            for f in fields:
                v = obj.get(f)
                if isinstance(v, str) and v and v not in out:
                    out.append(v)
        return out

    @staticmethod
    def _score(ev: TrailEvent, identifiers: list[str], known_events: set[str],
               detected_at: datetime, account_id: str, region: str) -> float:
        score = 0.0
        if identifiers and _event_strings(ev) & set(identifiers):
            score += 0.50
        if ev.event_name in known_events:
            score += 0.20
        if ev.event_time:
            et = ev.event_time if ev.event_time.tzinfo else ev.event_time.replace(tzinfo=timezone.utc)
            delta = (detected_at - et).total_seconds()
            if 0 <= delta <= 3600:
                score += 0.15
            elif 0 <= delta <= 86400:
                score += 0.10
            elif delta > 0:
                score += 0.05
        if region and ev.region == region:
            score += 0.05
        if account_id and ev.actor and f":{account_id}:" in ev.actor:
            score += 0.05
        if ev.error_code:
            score = min(score, 0.35)
        return min(score, 0.99)
