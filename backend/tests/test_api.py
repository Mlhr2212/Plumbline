import json

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_pipeline, get_repositories
from app.config.settings import Settings, get_settings
from app.main import create_app
from app.security import signing
from app.services.drift.pipeline import IngestionPipeline
from tests.conftest import ingest_payload, load_fixture


@pytest.fixture
def client(settings, repos):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_repositories] = lambda: repos
    app.dependency_overrides[get_pipeline] = (
        lambda: IngestionPipeline(settings, repos))
    return TestClient(app)


@pytest.fixture
def drifted_client(client):
    """Client with the SSH-open SG drift already ingested."""
    r = client.post("/api/v1/scans/ingest",
                    json=ingest_payload(load_fixture("plan_sg_ssh_open.json")))
    assert r.status_code == 200
    return client


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_ingest_no_drift_creates_no_events(client):
    r = client.post("/api/v1/scans/ingest",
                    json=ingest_payload(load_fixture("plan_no_drift.json"),
                                        exit_code=0))
    assert r.status_code == 200
    assert r.json()["drift_detected"] == 0
    assert client.get("/api/v1/drifts").json()["items"] == []


def test_config_change_is_not_drift(client):
    """A developer's intended Terraform change must NOT create a drift event."""
    r = client.post("/api/v1/scans/ingest",
                    json=ingest_payload(
                        load_fixture("plan_config_change_only.json")))
    assert r.json()["drift_detected"] == 0
    assert client.get("/api/v1/drifts").json()["items"] == []


def test_sg_ssh_drift_detected_and_scored(drifted_client):
    items = drifted_client.get("/api/v1/drifts").json()["items"]
    assert len(items) == 1
    d = items[0]
    assert d["resource_address"] == "aws_security_group.web"
    assert d["severity"] in ("MEDIUM", "HIGH", "CRITICAL")
    assert "SG_PUBLIC_SSH" in {f["rule_id"] for f in d["risk_factors"]}
    assert d["recommended_action"] in ("CREATE_PR", "MANUAL_RECONCILIATION",
                                       "AUTO_REMEDIATE_ELIGIBLE")


def test_repeated_identical_scan_dedupes(drifted_client):
    first = drifted_client.get("/api/v1/drifts").json()["items"][0]
    drifted_client.post("/api/v1/scans/ingest",
                        json=ingest_payload(load_fixture("plan_sg_ssh_open.json")))
    items = drifted_client.get("/api/v1/drifts").json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == first["id"]
    assert items[0]["scan_count"] == 2


def test_drift_resolves_when_clean(drifted_client):
    drifted_client.post("/api/v1/scans/ingest",
                        json=ingest_payload(load_fixture("plan_no_drift.json"),
                                            exit_code=0))
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    assert d["status"] == "RESOLVED"
    timeline = drifted_client.get(f"/api/v1/drifts/{d['id']}/timeline").json()
    assert any(e["type"] == "DRIFT_RESOLVED" for e in timeline)


def test_sensitive_values_never_surface(client):
    r = client.post("/api/v1/scans/ingest",
                    json=ingest_payload(
                        load_fixture("plan_sensitive_attr.json")))
    assert r.status_code == 200
    body = client.get("/api/v1/drifts").text
    assert "super-secret" not in body
    item = client.get("/api/v1/drifts").json()["items"][0]
    assert all(d["sensitive"] for d in item["attribute_diffs"]
               if d["path"] == "password")


def test_timeline_contains_replay_events(drifted_client):
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    timeline = drifted_client.get(f"/api/v1/drifts/{d['id']}/timeline").json()
    types = {e["type"] for e in timeline}
    assert {"SCAN_STARTED", "BASELINE_CONFIRMED", "CLOUD_CHANGE",
            "DRIFT_CONFIRMED", "RISK_CLASSIFIED"} <= types
    cloud = next(e for e in timeline if e["type"] == "CLOUD_CHANGE")
    assert cloud["certainty"] == "inferred"


def test_dependencies_endpoint(drifted_client):
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    deps = drifted_client.get(f"/api/v1/drifts/{d['id']}/dependencies").json()
    assert "aws_instance.app" in deps["direct_dependents"]
    assert deps["label"] == "Known Dependency Impact"


def test_remediation_preview(drifted_client):
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    p = drifted_client.get(
        f"/api/v1/drifts/{d['id']}/remediation-preview").json()
    assert p["resources_modified"] == 1
    assert p["resources_destroyed"] == 0
    assert p["terraform_actions"] == ["update"]
    assert p["risk_before"] in ("MEDIUM", "HIGH", "CRITICAL")
    assert p["risk_after"] == "LOW"
    assert p["confidence"] > 0


def test_reconcile_restore_desired(drifted_client):
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    r = drifted_client.post(f"/api/v1/drifts/{d['id']}/reconcile",
                            json={"strategy": "RESTORE_DESIRED"})
    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    after = drifted_client.get(f"/api/v1/drifts/{d['id']}").json()
    assert after["status"] == "REMEDIATION_REQUESTED"


def test_stale_drift_rejected(client):
    """Superseded drift must reject remediation with a stale error."""
    client.post("/api/v1/scans/ingest",
                json=ingest_payload(load_fixture("plan_sg_ssh_open.json")))
    old = client.get("/api/v1/drifts").json()["items"][0]

    changed = load_fixture("plan_sg_ssh_open.json")
    changed["resource_drift"][0]["change"]["after"]["ingress"][1]["from_port"] = 2222
    changed["resource_drift"][0]["change"]["after"]["ingress"][1]["to_port"] = 2222
    client.post("/api/v1/scans/ingest", json=ingest_payload(changed))

    r = client.post(f"/api/v1/drifts/{old['id']}/reconcile",
                    json={"strategy": "RESTORE_DESIRED"})
    assert r.status_code == 409
    assert "stale" in r.json()["detail"].lower() or \
           "superseded" in r.json()["detail"].lower()


def test_ignore_flow(drifted_client):
    d = drifted_client.get("/api/v1/drifts").json()["items"][0]
    r = drifted_client.post(f"/api/v1/drifts/{d['id']}/ignore",
                            json={"reason": "expected change"})
    assert r.status_code == 200
    assert r.json()["status"] == "IGNORED"


def test_overview(drifted_client):
    o = drifted_client.get("/api/v1/overview?environment=dev").json()
    assert o["active_drift"] == 1
    assert o["last_scan"]["drift_detected"] == 1


def test_ingest_auth_rejects_unsigned(settings, repos):
    secured = Settings(storage_backend="memory",
                       ingest_hmac_secret="test-secret")
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: secured
    app.dependency_overrides[get_repositories] = lambda: repos
    c = TestClient(app)
    r = c.post("/api/v1/scans/ingest",
               json=ingest_payload(load_fixture("plan_no_drift.json"), 0))
    assert r.status_code == 401


def test_ingest_auth_accepts_valid_signature(repos):
    secret = "test-secret"
    secured = Settings(storage_backend="memory", ingest_hmac_secret=secret)
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: secured
    app.dependency_overrides[get_repositories] = lambda: repos
    c = TestClient(app)

    import time
    body = json.dumps(ingest_payload(
        load_fixture("plan_no_drift.json"), exit_code=0)).encode()
    ts = str(int(time.time()))
    sig = signing.sign(secret, int(ts), body)
    r = c.post("/api/v1/scans/ingest", content=body,
               headers={"content-type": "application/json",
                        "x-plumbline-timestamp": ts,
                        "x-plumbline-signature": sig})
    assert r.status_code == 200
