from app.services.risk.engine import RiskContext, evaluate, severity_for
from app.domain.models import Severity


def _ctx(resource_type, before, after, environment="dev", actions=("update",)):
    return RiskContext(resource_type=resource_type, environment=environment,
                       actions=list(actions), before=before, after=after)


def _sg(ingress):
    return {"id": "sg-1", "ingress": ingress}


def _rule(from_port, to_port, protocol, cidrs, ipv6=None):
    return {"from_port": from_port, "to_port": to_port, "protocol": protocol,
            "cidr_blocks": cidrs, "ipv6_cidr_blocks": ipv6 or []}


def _ids(result):
    return {f.rule_id for f in result.factors}


# -- security groups -------------------------------------------------------

def test_sg_public_ssh():
    before = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8"])])
    after = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8"]),
                 _rule(22, 22, "tcp", ["0.0.0.0/0"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_PUBLIC_SSH" in _ids(r)
    assert r.severity in (Severity.HIGH, Severity.MEDIUM)


def test_sg_public_rdp():
    before = _sg([])
    after = _sg([_rule(3389, 3389, "tcp", ["::/0"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_PUBLIC_RDP" in _ids(r)


def test_sg_all_protocol_public():
    before = _sg([])
    after = _sg([_rule(0, 0, "-1", ["0.0.0.0/0"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_ALL_PROTOCOL_PUBLIC" in _ids(r)


def test_sg_database_port_public():
    before = _sg([])
    after = _sg([_rule(5432, 5432, "tcp", ["0.0.0.0/0"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_PUBLIC_DATABASE" in _ids(r)


def test_sg_rule_removed_is_low_score():
    before = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8"])])
    after = _sg([])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_RULE_REMOVED" in _ids(r)
    assert r.severity in (Severity.LOW, Severity.MEDIUM)


def test_sg_boundary_widened():
    before = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8"])])
    after = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8", "192.168.0.0/16"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_BOUNDARY_WIDENED" in _ids(r)


def test_sg_internal_rule_not_critical():
    before = _sg([])
    after = _sg([_rule(443, 443, "tcp", ["10.0.0.0/8"])])
    r = evaluate(_ctx("aws_security_group", before, after))
    assert "SG_PUBLIC_INGRESS" not in _ids(r)
    assert r.severity in (Severity.INFO, Severity.LOW)


# -- IAM --------------------------------------------------------------------

_ADMIN_AFTER = ("{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\","
                "\"Action\":\"*\",\"Resource\":\"*\"}]}")
_SAFE_POLICY = ("{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\","
                "\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::b/*\"}]}")


def test_iam_wildcard_admin():
    ctx = _ctx("aws_iam_policy", {"policy": _SAFE_POLICY}, {"policy": _ADMIN_AFTER})
    r = evaluate(ctx)
    assert "IAM_ADMIN_LIKE" in _ids(r)
    assert r.severity in (Severity.HIGH, Severity.CRITICAL)


def test_iam_admin_attachment():
    ctx = _ctx("aws_iam_role_policy_attachment",
               {"policy_arn": "arn:aws:iam::aws:policy/ReadOnlyAccess", "role": "r"},
               {"policy_arn": "arn:aws:iam::aws:policy/AdministratorAccess",
                "role": "r"})
    r = evaluate(ctx)
    assert "IAM_ADMIN_ATTACHMENT" in _ids(r)


def test_iam_trust_widened():
    trust_before = ("{\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":"
                    "{\"Service\":\"ec2.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}")
    trust_after = ("{\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},"
                   "\"Action\":\"sts:AssumeRole\"}]}")
    ctx = _ctx("aws_iam_role", {"assume_role_policy": trust_before},
               {"assume_role_policy": trust_after})
    r = evaluate(ctx)
    assert "IAM_TRUST_PUBLIC" in _ids(r)


def test_iam_policy_removed():
    ctx = _ctx("aws_iam_policy", {"policy": _SAFE_POLICY}, {"policy": None})
    r = evaluate(ctx)
    assert "IAM_POLICY_REMOVED" in _ids(r)


# -- generic ---------------------------------------------------------------

def test_prod_environment_bump():
    before = {"instance_type": "t3.micro"}
    after = {"instance_type": "t3.large"}
    r = evaluate(_ctx("aws_instance", before, after, environment="prod"))
    assert "GEN_PROD_ENVIRONMENT" in _ids(r)


def test_resource_deleted():
    r = evaluate(_ctx("aws_s3_bucket", {"id": "b"}, None, actions=("delete",)))
    assert "GEN_RESOURCE_DELETED" in _ids(r)


def test_replacement_flag():
    r = evaluate(_ctx("aws_instance", {"id": "i-1"}, {"id": "i-1"},
                      actions=("delete", "create")))
    assert "GEN_RESOURCE_REPLACED" in _ids(r)


def test_severity_bands():
    assert severity_for(0) == Severity.INFO
    assert severity_for(10) == Severity.LOW
    assert severity_for(30) == Severity.MEDIUM
    assert severity_for(60) == Severity.HIGH
    assert severity_for(90) == Severity.CRITICAL
