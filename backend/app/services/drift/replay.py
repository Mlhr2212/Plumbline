"""Drift Replay — normalized forensic timeline construction.

Every drift event owns an ordered timeline the frontend renders directly.
``certainty`` separates CONFIRMED evidence from INFERRED reconstruction —
inferred entries (e.g. the estimated change window) are explicitly marked and
never presented as facts. Timestamps use real evidence where available
(CloudTrail event time) and clearly-marked estimates where not.
"""
from __future__ import annotations

from typing import Optional

from app.domain.models import (
    Attribution, DriftEvent, Scan, TimelineEvent, TimelineEventType,
)


def detection_timeline(event: DriftEvent, scan: Scan,
                       attribution: Attribution) -> list[TimelineEvent]:
    """Timeline emitted when a NEW drift event is first confirmed."""
    events = [
        TimelineEvent(
            drift_id=event.id, timestamp=scan.started_at,
            type=TimelineEventType.SCAN_STARTED,
            title="Scheduled drift scan started",
            description=f"terraform plan executed for {scan.environment} "
                        f"(commit {scan.commit_sha or 'unknown'}).",
            source="github_actions", certainty="confirmed",
            metadata={"scan_id": scan.id, "workspace": scan.workspace},
        ),
        TimelineEvent(
            drift_id=event.id, timestamp=scan.started_at,
            type=TimelineEventType.PLAN_GENERATED,
            title="Terraform plan generated",
            description="Provider refresh completed; plan JSON captured "
                        "machine-readable evidence.",
            source="terraform", certainty="confirmed",
            metadata={"format_version": event.terraform_metadata.format_version,
                      "terraform_version": event.terraform_metadata.terraform_version},
        ),
        TimelineEvent(
            drift_id=event.id, timestamp=scan.started_at,
            type=TimelineEventType.BASELINE_CONFIRMED,
            title="Terraform baseline confirmed",
            description=f"{event.resource_address} last applied configuration "
                        "is the declared baseline.",
            source="terraform", certainty="confirmed",
            metadata={"resource_address": event.resource_address,
                      "actions": event.actions},
        ),
    ]

    if attribution.event_time:
        events.append(TimelineEvent(
            drift_id=event.id, timestamp=attribution.event_time,
            type=TimelineEventType.CLOUD_CHANGE,
            title="Out-of-band AWS change",
            description="Estimated modification window derived from CloudTrail.",
            source="cloudtrail_estimate", certainty="inferred",
            confidence=attribution.confidence,
            metadata={"estimated": True},
        ))
    else:
        events.append(TimelineEvent(
            drift_id=event.id, timestamp=event.detected_at,
            type=TimelineEventType.CLOUD_CHANGE,
            title="Out-of-band AWS change",
            description="Change occurred between the previous scan and this one; "
                        "exact time unknown.",
            source="inference", certainty="inferred",
            confidence=0.0,
            metadata={"estimated": True},
        ))

    if attribution.event_name:
        events.append(TimelineEvent(
            drift_id=event.id,
            timestamp=attribution.event_time or event.detected_at,
            type=TimelineEventType.CLOUDTRAIL_EVENT,
            title=f"CloudTrail: {attribution.event_name}",
            description=f"Actor: {attribution.actor or 'unknown'}",
            source="cloudtrail", certainty="confirmed",
            confidence=attribution.confidence,
            evidence_refs=[attribution.event_id] if attribution.event_id else [],
            metadata={
                "actor": attribution.actor, "actor_type": attribution.actor_type,
                "event_id": attribution.event_id, "source_ip": attribution.source_ip,
                "attribution_status": attribution.status,
            },
        ))

    events += [
        TimelineEvent(
            drift_id=event.id, timestamp=event.detected_at,
            type=TimelineEventType.DRIFT_CONFIRMED,
            title="Drift confirmed",
            description=f"{len(event.attribute_diffs)} attribute difference(s) "
                        f"on {event.resource_address} (resource_drift evidence).",
            source="plumbline", certainty="confirmed",
            metadata={"fingerprint": event.fingerprint},
        ),
        TimelineEvent(
            drift_id=event.id, timestamp=event.detected_at,
            type=TimelineEventType.RISK_CLASSIFIED,
            title=f"Risk classified: {event.severity.value}",
            description=f"Score {event.risk_score}/100 across "
                        f"{len(event.risk_factors)} rule(s).",
            source="plumbline", certainty="confirmed",
            metadata={"risk_score": event.risk_score,
                      "severity": event.severity.value,
                      "rules": [f.rule_id for f in event.risk_factors]},
        ),
    ]
    return events


def lifecycle_event(drift_id: str, event_type: TimelineEventType,
                    title: str, description: str = "", source: str = "plumbline",
                    certainty: str = "confirmed",
                    confidence: Optional[float] = None,
                    metadata: Optional[dict] = None) -> TimelineEvent:
    from app.domain.models import utcnow
    return TimelineEvent(
        drift_id=drift_id, timestamp=utcnow(), type=event_type, title=title,
        description=description, source=source, certainty=certainty,
        confidence=confidence, metadata=metadata or {},
    )
