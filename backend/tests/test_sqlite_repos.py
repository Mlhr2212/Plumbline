"""SQLite repository parity — same contract as the in-memory backend."""
import json
from datetime import datetime, timezone

import pytest

from app.domain.models import (
    AttributeDiff, ChangeType, DriftEvent, DriftStatus, ReconciliationProposal,
    RemediationStrategy, Scan, ScanStatus, Severity, TimelineEvent,
    TimelineEventType,
)
from app.repositories.sqlite import (
    SqliteDriftRepository, SqliteReconciliationRepository,
    SqliteScanRepository, SqliteTimelineRepository,
)


def _event(**kw):
    return DriftEvent(
        id=kw.get("id", "d1"), scan_id=kw.get("scan_id", "s1"),
        fingerprint=kw.get("fingerprint", "fp1"),
        resource_address=kw.get("addr", "aws_security_group.web"),
        resource_type="aws_security_group", resource_name="web",
        severity=kw.get("severity", Severity.HIGH),
        status=kw.get("status", DriftStatus.OPEN),
        environment=kw.get("env", "dev"),
        attribute_diffs=[AttributeDiff(path="ingress", before=None,
                                       after=[22], change_type=ChangeType.ADDED)])


@pytest.fixture()
def db(tmp_path):
    return str(tmp_path / "plumbline.db")


def test_drift_roundtrip_and_active_lookups(db):
    repo = SqliteDriftRepository(db)
    repo.save(_event())
    got = repo.get("d1")
    assert got is not None and got.resource_address == "aws_security_group.web"
    assert got.attribute_diffs[0].change_type == ChangeType.ADDED
    assert repo.find_by_fingerprint("fp1").id == "d1"
    assert repo.find_open_for_resource("dev", "aws_security_group.web")
    assert repo.list_open("dev")


def test_fingerprint_ignores_terminal(db):
    repo = SqliteDriftRepository(db)
    repo.save(_event(status=DriftStatus.RESOLVED))
    assert repo.find_by_fingerprint("fp1") is None
    assert repo.list_open("dev") == []


def test_drift_list_sorted_filtered(db):
    repo = SqliteDriftRepository(db)
    repo.save(_event(id="d1", detected_at=datetime(2026, 1, 1, tzinfo=timezone.utc)))
    repo.save(_event(id="d2", fingerprint="fp2", severity=Severity.LOW,
                     detected_at=datetime(2026, 2, 1, tzinfo=timezone.utc)))
    items, _ = repo.list({}, None, 10)
    assert [i.id for i in items] == ["d2", "d1"]
    items, _ = repo.list({"severity": "HIGH"}, None, 10)
    assert [i.id for i in items] == ["d1"]


def test_scan_roundtrip_sorted(db):
    repo = SqliteScanRepository(db)
    repo.save(Scan(id="s1", environment="dev", status=ScanStatus.COMPLETED,
                   started_at=datetime(2026, 1, 1, tzinfo=timezone.utc)))
    repo.save(Scan(id="s2", environment="dev", status=ScanStatus.COMPLETED,
                   started_at=datetime(2026, 3, 1, tzinfo=timezone.utc)))
    assert repo.get("s2").environment == "dev"
    items, _ = repo.list({}, None, 10)
    assert [s.id for s in items] == ["s2", "s1"]


def test_timeline_sorted(db):
    repo = SqliteTimelineRepository(db)
    later = TimelineEvent(drift_id="d1",
                          timestamp=datetime(2026, 1, 2, tzinfo=timezone.utc),
                          type=TimelineEventType.DRIFT_CONFIRMED, title="b")
    earlier = TimelineEvent(drift_id="d1",
                            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
                            type=TimelineEventType.SCAN_STARTED, title="a")
    repo.append([later, earlier])
    assert [e.title for e in repo.list("d1")] == ["a", "b"]


def test_reconciliation_roundtrip(db):
    repo = SqliteReconciliationRepository(db)
    repo.save(ReconciliationProposal(
        id="r1", drift_event_id="d1", strategy=RemediationStrategy.ACCEPT_DRIFT,
        resource_address="aws_security_group.web"))
    assert repo.get("r1").strategy == RemediationStrategy.ACCEPT_DRIFT
    assert [p.id for p in repo.list_for_drift("d1")] == ["r1"]


def test_persists_across_connections(db):
    """A new repository instance over the same file sees prior data."""
    SqliteDriftRepository(db).save(_event())
    fresh = SqliteDriftRepository(db)
    assert fresh.get("d1") is not None
    assert fresh.list_open("dev")
