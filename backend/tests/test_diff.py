from app.domain.models import ChangeType, REDACTED
from app.services.drift.diff import diff


def test_scalar_modified():
    d = diff({"a": 1}, {"a": 2})
    assert len(d) == 1
    assert d[0].path == "a" and d[0].change_type == ChangeType.MODIFIED


def test_nested_path_notation():
    before = {"ingress": [{"cidr_blocks": ["10.0.0.0/8"]}]}
    after = {"ingress": [{"cidr_blocks": ["0.0.0.0/0"]}]}
    d = diff(before, after)
    assert d[0].path == "ingress[0].cidr_blocks[0]"
    assert d[0].before == "10.0.0.0/8" and d[0].after == "0.0.0.0/0"


def test_added_and_removed_keys():
    d = diff({"a": 1, "b": 2}, {"a": 1, "c": 3})
    by_path = {x.path: x for x in d}
    assert by_path["b"].change_type == ChangeType.REMOVED
    assert by_path["c"].change_type == ChangeType.ADDED


def test_list_element_added():
    d = diff({"ingress": [{"from_port": 443}]},
             {"ingress": [{"from_port": 443}, {"from_port": 22}]})
    paths = {x.path for x in d}
    assert "ingress[1].from_port" in paths


def test_sensitive_value_redacted():
    before = {"password": "old-secret"}
    after = {"password": "new-secret"}
    d = diff(before, after,
             before_sensitive={"password": True},
             after_sensitive={"password": True})
    assert len(d) == 1
    assert d[0].sensitive is True
    assert d[0].before == REDACTED and d[0].after == REDACTED
    assert "secret" not in repr(d)


def test_sensitive_children_never_inspected():
    """An entire sensitive object collapses to one redacted diff."""
    before = {"config": {"user": "u", "pass": "p"}}
    after = {"config": {"user": "u2", "pass": "p2"}}
    d = diff(before, after,
             before_sensitive={"config": True},
             after_sensitive={"config": True})
    assert len(d) == 1 and d[0].sensitive


def test_identical_values_no_diff():
    assert diff({"a": [1, 2]}, {"a": [1, 2]}) == []
