from app.domain.models import AttributeDiff, ChangeType, DriftEvent, TerraformMetadata
from app.services.remediation.policy import evaluate


def _event(resource_type="aws_s3_bucket", actions=("update",),
           environment="dev", diffs=None, plan_hash="h"):
    return DriftEvent(
        id="e1", scan_id="s1", fingerprint="fp",
        resource_address=f"{resource_type}.x", resource_type=resource_type,
        resource_name="x", environment=environment,
        actions=list(actions),
        attribute_diffs=diffs or [],
        terraform_metadata=TerraformMetadata(plan_hash=plan_hash),
    )


def test_disabled_by_default():
    e = evaluate(_event(diffs=[AttributeDiff(
        path="tags.x", before="a", after="b", change_type=ChangeType.MODIFIED)]),
        enabled=False, allow_production=False)
    assert not e.eligible and e.path == "disabled"


def test_tags_only_eligible_when_enabled():
    e = evaluate(_event(diffs=[AttributeDiff(
        path="tags.Owner", before=None, after="ops",
        change_type=ChangeType.ADDED)]),
        enabled=True, allow_production=False)
    assert e.eligible and e.path == "auto" and e.rule_id == "TAG_ONLY_DRIFT"


def test_production_requires_pr():
    e = evaluate(_event(environment="prod",
                        diffs=[AttributeDiff(path="tags.x", before="a",
                                             after="b",
                                             change_type=ChangeType.MODIFIED)]),
                 enabled=True, allow_production=False)
    assert not e.eligible and e.path == "pr" and e.rule_id == "PROD_REQUIRES_PR"


def test_destructive_action_never_auto():
    e = evaluate(_event(actions=("delete",)),
                 enabled=True, allow_production=True)
    assert not e.eligible and e.rule_id == "DESTRUCTIVE_ACTION"


def test_stale_plan_blocks_auto():
    e = evaluate(_event(plan_hash="old"),
                 enabled=True, allow_production=True,
                 plan_hash_current="different")
    assert not e.eligible and e.rule_id == "STALE_PLAN"


def test_public_sg_revoke_eligible():
    diffs = [
        AttributeDiff(path="ingress[1].cidr_blocks[0]", before=None,
                      after="0.0.0.0/0", change_type=ChangeType.ADDED),
        AttributeDiff(path="ingress[1].from_port", before=None, after=22,
                      change_type=ChangeType.ADDED),
        AttributeDiff(path="ingress[1].to_port", before=None, after=22,
                      change_type=ChangeType.ADDED),
        AttributeDiff(path="ingress[1].protocol", before=None, after="tcp",
                      change_type=ChangeType.ADDED),
    ]
    e = evaluate(_event(resource_type="aws_security_group", diffs=diffs),
                 enabled=True, allow_production=False)
    assert e.eligible and e.rule_id == "SG_PUBLIC_RULE_REVOKE"


def test_nontrivial_drift_requires_pr():
    diffs = [AttributeDiff(path="instance_type", before="t3.micro",
                           after="t3.large", change_type=ChangeType.MODIFIED)]
    e = evaluate(_event(resource_type="aws_instance", diffs=diffs),
                 enabled=True, allow_production=True)
    assert not e.eligible and e.path == "pr"
