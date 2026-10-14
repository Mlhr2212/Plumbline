"""In-memory repositories — default for local development and tests."""
from __future__ import annotations

import base64
import json
from typing import Any, Optional

from app.domain.models import (
    DriftEvent, DriftStatus, ReconciliationProposal, Scan, TimelineEvent,
)

_ACTIVE = {DriftStatus.OPEN, DriftStatus.ACKNOWLEDGED,
           DriftStatus.REMEDIATION_REQUESTED, DriftStatus.RECONCILING}


def _matches(obj: Any, filters: dict[str, Any]) -> bool:
    for k, v in filters.items():
        if v is None:
            continue
        attr = getattr(obj, k, None)
        if hasattr(attr, "value"):
            attr = attr.value
        if attr != v:
            return False
    return True


def _page(items: list, cursor: Optional[str], limit: int) -> tuple[list, Optional[str]]:
    start = int(base64.b64decode(cursor).decode()) if cursor else 0
    chunk = items[start:start + limit]
    nxt = start + limit
    token = base64.b64encode(str(nxt).encode()).decode() if nxt < len(items) else None
    return chunk, token


class MemoryDriftRepository:
    def __init__(self):
        self._items: dict[str, DriftEvent] = {}

    def save(self, event: DriftEvent) -> None:
        self._items[event.id] = event

    def get(self, drift_id: str) -> Optional[DriftEvent]:
        return self._items.get(drift_id)

    def find_by_fingerprint(self, fingerprint: str) -> Optional[DriftEvent]:
        for e in self._items.values():
            if e.fingerprint == fingerprint and e.status in _ACTIVE:
                return e
        return None

    def find_open_for_resource(self, environment: str, address: str) -> list[DriftEvent]:
        return [e for e in self._items.values()
                if e.environment == environment and e.resource_address == address
                and e.status in _ACTIVE]

    def list_open(self, environment: str) -> list[DriftEvent]:
        return [e for e in self._items.values()
                if e.environment == environment and e.status in _ACTIVE]

    def list(self, filters, cursor, limit):
        items = sorted(
            (e for e in self._items.values() if _matches(e, filters)),
            key=lambda e: e.detected_at, reverse=True)
        return _page(items, cursor, limit)


class MemoryScanRepository:
    def __init__(self):
        self._items: dict[str, Scan] = {}

    def save(self, scan: Scan) -> None:
        self._items[scan.id] = scan

    def get(self, scan_id: str) -> Optional[Scan]:
        return self._items.get(scan_id)

    def list(self, filters, cursor, limit):
        items = sorted(
            (s for s in self._items.values() if _matches(s, filters)),
            key=lambda s: s.started_at, reverse=True)
        return _page(items, cursor, limit)


class MemoryTimelineRepository:
    def __init__(self):
        self._items: dict[str, list[TimelineEvent]] = {}

    def append(self, events: list[TimelineEvent]) -> None:
        for e in events:
            self._items.setdefault(e.drift_id, []).append(e)
            self._items[e.drift_id].sort(key=lambda x: x.timestamp)

    def list(self, drift_id: str) -> list[TimelineEvent]:
        return list(self._items.get(drift_id, []))


class MemoryReconciliationRepository:
    def __init__(self):
        self._items: dict[str, ReconciliationProposal] = {}

    def save(self, proposal: ReconciliationProposal) -> None:
        self._items[proposal.id] = proposal

    def get(self, proposal_id: str) -> Optional[ReconciliationProposal]:
        return self._items.get(proposal_id)

    def list_for_drift(self, drift_id: str) -> list[ReconciliationProposal]:
        return [p for p in self._items.values() if p.drift_event_id == drift_id]

    def list(self, filters, cursor, limit):
        items = sorted(
            (p for p in self._items.values() if _matches(p, filters)),
            key=lambda p: p.created_at, reverse=True)
        return _page(items, cursor, limit)
