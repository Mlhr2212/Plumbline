from app.domain.models import DependencyEvidence
from app.parsers.terraform_plan import parse_plan
from app.services.dependencies.graph import blast_radius, build_dependency_graph
from tests.conftest import load_fixture


def test_reference_edge_found():
    plan = parse_plan(load_fixture("plan_sg_ssh_open.json"))
    graph = build_dependency_graph(plan)
    edges = graph.get("aws_security_group.web", [])
    assert any(e.dependent == "aws_instance.app" for e in edges)
    assert all(e.evidence == DependencyEvidence.TERRAFORM_REFERENCE for e in edges)


def test_depends_on_is_explicit():
    plan_json = load_fixture("plan_sg_ssh_open.json")
    plan_json["configuration"]["root_module"]["resources"].append({
        "address": "aws_lambda_function.worker",
        "mode": "managed", "type": "aws_lambda_function", "name": "worker",
        "provider_config_key": "aws",
        "expressions": {},
        "depends_on": ["aws_security_group.web"],
        "schema_version": 1,
    })
    plan = parse_plan(plan_json)
    graph = build_dependency_graph(plan)
    edges = graph["aws_security_group.web"]
    assert any(e.evidence == DependencyEvidence.EXPLICIT and
               e.dependent == "aws_lambda_function.worker" for e in edges)


def test_blast_radius_transitive():
    plan = parse_plan(load_fixture("plan_sg_ssh_open.json"))
    summary = blast_radius("aws_security_group.web", plan)
    assert "aws_instance.app" in summary.direct_dependents
    assert summary.depth >= 1
    assert summary.label == "Known Dependency Impact"


def test_no_dependents():
    plan = parse_plan(load_fixture("plan_iam_wildcard.json"))
    summary = blast_radius("aws_iam_policy.app", plan)
    assert summary.direct_dependents == []
    assert summary.depth == 0
