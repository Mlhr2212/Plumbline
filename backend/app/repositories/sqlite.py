"""SQLite-backed repositories — durable local storage, zero external services.

Designed for self-hosted / offline use: one file, stdlib ``sqlite3`` only.
Each record is stored as its serialized pydantic model alongside a few
indexed columns for lookup queries; filtering and ordering otherwise mirror
the in-memory repositories so behavior is identical across backends.
"""
from __future__ import annotations

import base64
import json
import sqlite3
from typing import Any, Optional

from app.domain.models import (
    DriftEvent, DriftStatus, ReconciliationProposal, Scan, TimelineEvent,
)

_ACTIVE = {DriftStatus.OPEN.value, DriftStatus.ACKNOWLEDGED.value,
           DriftStatus.REMEDIATION_REQUESTED.value, DriftStatus.RECONCILING.value}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS drifts (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    environment TEXT NOT NULL,
    resource_address TEXT NOT NULL,
    status TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    environment TEXT NOT NULL,
    started_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline (
    drift_id TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (drift_id, sort_key)
);
CREATE TABLE IF NOT EXISTS reconciliations (
    id TEXT PRIMARY KEY,
    drift_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
);
"""


def _dump(model: Any) -> str:
    return json.dumps(model.model_dump(mode="json"), separators=(",", ":"))


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


class _SqliteStore:
    def __init__(self, path: str):
        self._path = path
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn


class SqliteDriftRepository(_SqliteStore):
    def _rows(self, where: str = "", params: tuple = ()) -> list[DriftEvent]:
        sql = "SELECT data FROM drifts" + (f" WHERE {where}" if where else "")
        with self._conn() as conn:
            return [DriftEvent.model_validate(json.loads(r[0]))
                    for r in conn.execute(sql, params)]

    def save(self, event: DriftEvent) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO drifts VALUES (?,?,?,?,?,?,?)",
                (event.id, event.fingerprint, event.environment,
                 event.resource_address, event.status.value,
                 event.detected_at.isoformat(), _dump(event)))

    def get(self, drift_id: str) -> Optional[DriftEvent]:
        rows = self._rows("id = ?", (drift_id,))
        return rows[0] if rows else None

    def find_by_fingerprint(self, fingerprint: str) -> Optional[DriftEvent]:
        for e in self._rows("fingerprint = ?", (fingerprint,)):
            if e.status.value in _ACTIVE:
                return e
        return None

    def find_open_for_resource(self, environment: str, address: str) -> list[DriftEvent]:
        rows = self._rows("environment = ? AND resource_address = ?",
                          (environment, address))
        return [e for e in rows if e.status.value in _ACTIVE]

    def list_open(self, environment: str) -> list[DriftEvent]:
        return [e for e in self._rows("environment = ?", (environment,))
                if e.status.value in _ACTIVE]

    def list(self, filters, cursor, limit):
        items = sorted(
            (e for e in self._rows() if _matches(e, filters)),
            key=lambda e: e.detected_at, reverse=True)
        return _page(items, cursor, limit)


class SqliteScanRepository(_SqliteStore):
    def save(self, scan: Scan) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO scans VALUES (?,?,?,?)",
                (scan.id, scan.environment, scan.started_at.isoformat(),
                 _dump(scan)))

    def get(self, scan_id: str) -> Optional[Scan]:
        with self._conn() as conn:
            row = conn.execute("SELECT data FROM scans WHERE id = ?",
                               (scan_id,)).fetchone()
        return Scan.model_validate(json.loads(row[0])) if row else None

    def list(self, filters, cursor, limit):
        with self._conn() as conn:
            rows = [Scan.model_validate(json.loads(r[0]))
                    for r in conn.execute("SELECT data FROM scans")]
        items = sorted((s for s in rows if _matches(s, filters)),
                       key=lambda s: s.started_at, reverse=True)
        return _page(items, cursor, limit)


class SqliteTimelineRepository(_SqliteStore):
    def append(self, events: list[TimelineEvent]) -> None:
        with self._conn() as conn:
            for e in events:
                conn.execute(
                    "INSERT OR REPLACE INTO timeline VALUES (?,?,?)",
                    (e.drift_id,
                     f"{e.timestamp.isoformat()}#{e.type.value}#{id(e)}",
                     _dump(e)))

    def list(self, drift_id: str) -> list[TimelineEvent]:
        with self._conn() as conn:
            items = [TimelineEvent.model_validate(json.loads(r[0]))
                     for r in conn.execute(
                         "SELECT data FROM timeline WHERE drift_id = ?",
                         (drift_id,))]
        return sorted(items, key=lambda x: x.timestamp)


class SqliteReconciliationRepository(_SqliteStore):
    def save(self, proposal: ReconciliationProposal) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO reconciliations VALUES (?,?,?,?)",
                (proposal.id, proposal.drift_event_id,
                 proposal.created_at.isoformat(), _dump(proposal)))

    def get(self, proposal_id: str) -> Optional[ReconciliationProposal]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM reconciliations WHERE id = ?",
                (proposal_id,)).fetchone()
        return ReconciliationProposal.model_validate(json.loads(row[0])) \
            if row else None

    def list_for_drift(self, drift_id: str) -> list[ReconciliationProposal]:
        with self._conn() as conn:
            return [ReconciliationProposal.model_validate(json.loads(r[0]))
                    for r in conn.execute(
                        "SELECT data FROM reconciliations WHERE drift_event_id = ?",
                        (drift_id,))]

    def list(self, filters, cursor, limit):
        with self._conn() as conn:
            rows = [ReconciliationProposal.model_validate(json.loads(r[0]))
                    for r in conn.execute("SELECT data FROM reconciliations")]
        items = sorted((p for p in rows if _matches(p, filters)),
                       key=lambda p: p.created_at, reverse=True)
        return _page(items, cursor, limit)
