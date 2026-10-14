from datetime import datetime, timedelta, timezone

from app.services.attribution.enricher import (
    CloudTrailEnricher, TrailEvent,
)


class FakeLookup:
    def __init__(self, events):
        self._events = events

    def lookup(self, identifiers, event_names, start, end, region):
        return self._events


def _ev(**kw):
    base = dict(event_name="AuthorizeSecurityGroupIngress",
                event_time=datetime.now(timezone.utc) - timedelta(minutes=30),
                actor="arn:aws:sts::123456789012:assumed-role/Admin/jane",
                actor_type="AssumedRole", event_id="evt-1",
                source_ip="203.0.113.10", user_agent="console.amazonaws.com",
                region="us-east-1", resources=["sg-0123456789abcdef0"],
                request_parameters={"groupId": "sg-0123456789abcdef0"})
    base.update(kw)
    return TrailEvent(**base)


def _sg_after():
    return {"id": "sg-0123456789abcdef0", "name": "web"}


def test_known_actor_high_confidence():
    e = CloudTrailEnricher(FakeLookup([_ev()]))
    a = e.enrich("aws_security_group", {}, _sg_after(),
                 datetime.now(timezone.utc),
                 account_id="123456789012", region="us-east-1")
    assert a.status == "identified"
    assert a.confidence >= 0.7
    assert a.actor == "arn:aws:sts::123456789012:assumed-role/Admin/jane"
    assert a.event_name == "AuthorizeSecurityGroupIngress"


def test_unknown_actor_no_fabrication():
    e = CloudTrailEnricher(FakeLookup([]))
    a = e.enrich("aws_security_group", {}, _sg_after(),
                 datetime.now(timezone.utc))
    assert a.actor is None
    assert a.confidence == 0
    assert a.status == "unknown"


def test_unrelated_event_low_confidence():
    e = CloudTrailEnricher(FakeLookup([_ev(
        event_name="ListBuckets", resources=["other-bucket"],
        request_parameters={}, region="eu-west-1",
        actor="arn:aws:iam::999999999999:user/someone",
        event_time=datetime.now(timezone.utc) - timedelta(days=60))]))
    a = e.enrich("aws_security_group", {}, _sg_after(),
                 datetime.now(timezone.utc), account_id="123456789012",
                 region="us-east-1")
    assert a.actor is None or a.status in ("unknown", "candidate")
    assert a.confidence < 0.7


def test_error_event_capped():
    e = CloudTrailEnricher(FakeLookup([_ev(error_code="AccessDenied")]))
    a = e.enrich("aws_security_group", {}, _sg_after(),
                 datetime.now(timezone.utc),
                 account_id="123456789012", region="us-east-1")
    assert a.confidence <= 0.35


def test_disabled_without_lookup():
    e = CloudTrailEnricher(None)
    a = e.enrich("aws_security_group", {}, _sg_after(),
                 datetime.now(timezone.utc))
    assert a.status == "disabled"
