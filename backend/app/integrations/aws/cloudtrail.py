"""AWS CloudTrail LookupEvents client.

Uses the ambient AWS credential chain only (instance role / OIDC / sso) —
no keys are configured in code. Requires nothing more than
``cloudtrail:LookupEvents``.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.services.attribution.enricher import TrailEvent


class CloudTrailLookupClient:
    def __init__(self, region: str, client: Any = None):
        self._region = region
        if client is not None:
            self._client = client
        else:
            import boto3  # lazy: keeps the backend importable without AWS SDK creds
            self._client = boto3.client("cloudtrail", region_name=region)

    def lookup(self, identifiers: list[str], event_names: set[str],
               start: datetime, end: datetime, region: str) -> list[TrailEvent]:
        """LookupEvents filtered by ResourceName, then refined client-side."""
        events: list[TrailEvent] = []
        for ident in identifiers[:3]:  # cap API calls per resource
            kwargs: dict[str, Any] = {
                "LookupAttributes": [{"AttributeKey": "ResourceName", "AttributeValue": ident}],
                "StartTime": start, "EndTime": end, "MaxResults": 50,
            }
            while True:
                resp = self._client.lookup_events(**kwargs)
                for e in resp.get("Events", []):
                    events.append(self._to_event(e))
                token = resp.get("NextToken")
                if not token:
                    break
                kwargs["NextToken"] = token
        # Filter to events actually touching our identifiers.
        seen: dict[str, TrailEvent] = {}
        for ev in events:
            if ev.event_id:
                seen.setdefault(ev.event_id, ev)
        return list(seen.values())

    @staticmethod
    def _to_event(e: dict[str, Any]) -> TrailEvent:
        detail: dict[str, Any] = {}
        raw = e.get("CloudTrailEvent")
        if raw:
            try:
                detail = json.loads(raw)
            except ValueError:
                detail = {}
        ident = detail.get("userIdentity") or {}
        actor = ident.get("arn") or ident.get("principalId") or e.get("Username")
        session = None
        if ident.get("type") == "AssumedRole":
            session = (ident.get("sessionContext") or {}).get("sessionIssuer", {}).get("arn")
        resources = [r.get("ResourceName", "") for r in e.get("Resources", [])]
        return TrailEvent(
            event_name=e.get("EventName", ""),
            event_time=e.get("EventTime"),
            actor=actor,
            actor_type=ident.get("type"),
            session=session,
            event_id=e.get("EventId"),
            source_ip=detail.get("sourceIPAddress"),
            user_agent=detail.get("userAgent"),
            region=detail.get("awsRegion") or e.get("AwsRegion"),
            resources=[r for r in resources if r],
            request_parameters=detail.get("requestParameters") or {},
            error_code=detail.get("errorCode"),
        )
