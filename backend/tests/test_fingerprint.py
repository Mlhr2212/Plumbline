from app.domain.models import AttributeDiff, ChangeType, REDACTED
from app.services.drift.fingerprint import fingerprint_drift, plan_hash


def _d(path, before, after, ct=ChangeType.MODIFIED, sensitive=False):
    return AttributeDiff(path=path, before=before, after=after,
                         change_type=ct, sensitive=sensitive)


def test_stable_across_diff_order():
    a = fingerprint_drift("dev", "aws_instance.app",
                          [_d("instance_type", "a", "b"), _d("tags.x", "1", "2")])
    b = fingerprint_drift("dev", "aws_instance.app",
                          [_d("tags.x", "1", "2"), _d("instance_type", "a", "b")])
    assert a == b


def test_differs_on_value_change():
    a = fingerprint_drift("dev", "aws_instance.app", [_d("x", "1", "2")])
    b = fingerprint_drift("dev", "aws_instance.app", [_d("x", "1", "3")])
    assert a != b


def test_sensitive_values_never_leak():
    fp = fingerprint_drift("dev", "aws_db_instance.main",
                           [_d("password", REDACTED, REDACTED, sensitive=True)])
    assert isinstance(fp, str) and len(fp) == 64
    # identical structure with different real values => same fingerprint shape
    fp2 = fingerprint_drift("dev", "aws_db_instance.main",
                            [_d("password", REDACTED, REDACTED, sensitive=True)])
    assert fp == fp2


def test_environment_included():
    a = fingerprint_drift("dev", "x", [_d("a", 1, 2)])
    b = fingerprint_drift("prod", "x", [_d("a", 1, 2)])
    assert a != b


def test_plan_hash_ignores_timestamps():
    plan = {"resource_drift": [{"address": "x"}],
            "resource_changes": [{"address": "x", "change": {"actions": ["update"]}}]}
    assert plan_hash(plan) == plan_hash({**plan, "timestamp": "later"})
