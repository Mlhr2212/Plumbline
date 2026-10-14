import pytest

from app.domain.models import UnsupportedFormatError
from app.parsers.terraform_plan import parse_plan
from tests.conftest import load_fixture


def test_parse_valid_plan():
    plan = parse_plan(load_fixture("plan_sg_ssh_open.json"))
    assert plan.format_version == "1.2"
    assert len(plan.resource_drift) == 1
    assert plan.resource_drift[0].address == "aws_security_group.web"
    assert plan.has_drift


def test_no_drift_plan():
    plan = parse_plan(load_fixture("plan_no_drift.json"))
    assert not plan.has_drift


def test_rejects_unsupported_major_version():
    bad = {"format_version": "2.0", "resource_drift": []}
    with pytest.raises(UnsupportedFormatError):
        parse_plan(bad)


def test_rejects_missing_version():
    with pytest.raises(UnsupportedFormatError):
        parse_plan({"resource_drift": []})


def test_unknown_fields_are_ignored():
    plan_json = {"format_version": "1.9", "future_field": {"x": 1},
                 "resource_drift": []}
    plan = parse_plan(plan_json)
    assert plan.format_version == "1.9"


def test_drift_vs_change_distinction():
    """resource_changes alone (config change) must not count as drift."""
    plan = parse_plan(load_fixture("plan_config_change_only.json"))
    assert len(plan.resource_changes) == 1
    assert not plan.has_drift
    assert plan.resource_drift == []
