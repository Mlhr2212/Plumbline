"""Normalized domain model for PlumbLine drift detection.

These models are the shared contract between the ingestion pipeline, the risk
engine, persistence, and the REST API consumed by the frontend. Everything
here is deterministic — no model fields are ever produced by an LLM.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------

class Severity(str, enum.Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class DriftStatus(str, enum.Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    REMEDIATION_REQUESTED = "REMEDIATION_REQUESTED"
    RECONCILING = "RECONCILING"
    RESOLVED = "RESOLVED"
    ACCEPTED = "ACCEPTED"
    IGNORED = "IGNORED"
    SUPERSEDED = "SUPERSEDED"  # replaced by a materially different drift event


class ChangeType(str, enum.Enum):
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"


class TimelineEventType(str, enum.Enum):
    BASELINE_CONFIRMED = "BASELINE_CONFIRMED"
    CLOUD_CHANGE = "CLOUD_CHANGE"
    CLOUDTRAIL_EVENT = "CLOUDTRAIL_EVENT"
    SCAN_STARTED = "SCAN_STARTED"
    PLAN_GENERATED = "PLAN_GENERATED"
    DRIFT_CONFIRMED = "DRIFT_CONFIRMED"
    RISK_CLASSIFIED = "RISK_CLASSIFIED"
    INVESTIGATION_STARTED = "INVESTIGATION_STARTED"
    REMEDIATION_PREVIEWED = "REMEDIATION_PREVIEWED"
    PR_CREATED = "PR_CREATED"
    PR_MERGED = "PR_MERGED"
    REMEDIATION_STARTED = "REMEDIATION_STARTED"
    REMEDIATION_COMPLETED = "REMEDIATION_COMPLETED"
    DRIFT_ACCEPTED = "DRIFT_ACCEPTED"
    DRIFT_IGNORED = "DRIFT_IGNORED"
    DRIFT_RESOLVED = "DRIFT_RESOLVED"


class RecommendedAction(str, enum.Enum):
    INVESTIGATE = "INVESTIGATE"
    CREATE_PR = "CREATE_PR"
    MANUAL_RECONCILIATION = "MANUAL_RECONCILIATION"
    AUTO_REMEDIATE_ELIGIBLE = "AUTO_REMEDIATE_ELIGIBLE"
    ACCEPT_DRIFT = "ACCEPT_DRIFT"
    IGNORE = "IGNORE"


class DependencyEvidence(str, enum.Enum):
    EXPLICIT = "EXPLICIT"                # explicit depends_on in configuration
    TERRAFORM_REFERENCE = "TERRAFORM_REFERENCE"
    INFERRED = "INFERRED"


class AttributionSource(str, enum.Enum):
    CLOUDTRAIL = "cloudtrail"
    CONFIG = "config"
    NONE = "none"


class RemediationStrategy(str, enum.Enum):
    RESTORE_DESIRED = "RESTORE_DESIRED"   # terraform apply; bring reality back to config
    ACCEPT_DRIFT = "ACCEPT_DRIFT"          # update Terraform to match deployed reality
    MANUAL = "MANUAL"


class ScanStatus(str, enum.Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# --------------------------------------------------------------------------
# Value objects
# --------------------------------------------------------------------------

REDACTED = "<redacted>"

_AWS_SERVICE_MAP = {
    "aws_security_group": "vpc", "aws_default_security_group": "vpc",
    "aws_security_group_rule": "vpc",
    "aws_vpc_security_group_ingress_rule": "vpc",
    "aws_vpc_security_group_egress_rule": "vpc",
    "aws_vpc": "vpc", "aws_subnet": "vpc", "aws_route_table": "vpc",
    "aws_network_acl": "vpc", "aws_network_acl_rule": "vpc",
    "aws_instance": "ec2", "aws_launch_template": "ec2",
    "aws_ebs_volume": "ec2", "aws_ami": "ec2",
    "aws_db_instance": "rds", "aws_rds_cluster": "rds",
}


def aws_service_for(resource_type: str) -> str:
    """Map a Terraform resource type to an AWS service grouping."""
    if resource_type in _AWS_SERVICE_MAP:
        return _AWS_SERVICE_MAP[resource_type]
    for prefix in ("aws_iam_", "aws_s3_", "aws_lambda_", "aws_eks_",
                   "aws_kms_", "aws_cloudtrail_", "aws_ecs_"):
        if resource_type.startswith(prefix):
            return prefix[4:-1]
    if resource_type.startswith("aws_"):
        return resource_type.split("_")[1] if "_" in resource_type[4:] else "aws"
    return "other"


class AttributeDiff(BaseModel):
    path: str
    before: Any = None
    after: Any = None
    change_type: ChangeType
    sensitive: bool = False


class RiskFactor(BaseModel):
    rule_id: str
    score: int
    message: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class Attribution(BaseModel):
    actor: Optional[str] = None
    actor_type: Optional[str] = None
    event_name: Optional[str] = None
    event_time: Optional[datetime] = None
    source_ip: Optional[str] = None
    user_agent: Optional[str] = None
    event_id: Optional[str] = None
    confidence: float = 0.0
    source: AttributionSource = AttributionSource.NONE
    status: str = "unknown"  # "identified" | "candidate" | "unknown" | "disabled"
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class DependencyEdge(BaseModel):
    dependent: str          # resource that depends on the drifted resource
    dependency: str         # the drifted resource
    evidence: DependencyEvidence
    via: Optional[str] = None  # attribute/expression that produced the edge


class DependencySummary(BaseModel):
    direct_dependents: list[str] = Field(default_factory=list)
    transitive_dependents: list[str] = Field(default_factory=list)
    depth: int = 0
    affected_critical_resources: list[str] = Field(default_factory=list)
    edges: list[DependencyEdge] = Field(default_factory=list)
    label: str = "Known Dependency Impact"
    evidence_note: str = ("Terraform configuration references and depends_on only; "
                          "not a complete AWS blast-radius analysis.")


class TerraformMetadata(BaseModel):
    format_version: Optional[str] = None
    terraform_version: Optional[str] = None
    workspace: Optional[str] = None
    plan_hash: Optional[str] = None  # sha256 of canonical resource_changes+digest
    resource_changes: int = 0
    resources_drifted: int = 0
    actions: list[str] = Field(default_factory=list)
    # Actions Terraform plans for this resource in resource_changes (may be
    # empty when the plan contains no entry for the address).
    planned_actions: list[str] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    kind: str  # e.g. "terraform_plan", "cloudtrail", "policy"
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Aggregates
# --------------------------------------------------------------------------

class DriftEvent(BaseModel):
    id: str
    scan_id: str
    fingerprint: str
    resource_address: str
    resource_type: str
    resource_name: str
    provider: str = "aws"
    aws_service: str = ""     # derived from resource_type for filtering
    environment: str = "dev"
    region: str = ""
    aws_account_id: str = ""
    actions: list[str] = Field(default_factory=list)
    severity: Severity = Severity.INFO
    risk_score: int = 0
    status: DriftStatus = DriftStatus.OPEN
    detected_at: datetime = Field(default_factory=utcnow)
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)
    resolved_at: Optional[datetime] = None
    scan_count: int = 1
    attribute_diffs: list[AttributeDiff] = Field(default_factory=list)
    cloudtrail_attribution: Attribution = Field(default_factory=Attribution)
    risk_factors: list[RiskFactor] = Field(default_factory=list)
    dependency_context: DependencySummary = Field(default_factory=DependencySummary)
    recommended_action: RecommendedAction = RecommendedAction.INVESTIGATE
    remediation_eligibility: dict[str, Any] = Field(default_factory=dict)
    terraform_metadata: TerraformMetadata = Field(default_factory=TerraformMetadata)
    evidence: list[EvidenceItem] = Field(default_factory=list)


class Scan(BaseModel):
    id: str
    environment: str
    repository: str = ""
    commit_sha: str = ""
    workspace: str = "default"
    regions: list[str] = Field(default_factory=list)
    account_id: str = ""
    status: ScanStatus = ScanStatus.RUNNING
    terraform_exit_code: Optional[int] = None
    terraform_version: Optional[str] = None
    plan_format_version: Optional[str] = None
    plan_hash: Optional[str] = None
    drift_detected: int = 0
    drift_resolved: int = 0
    started_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class TimelineEvent(BaseModel):
    drift_id: str
    timestamp: datetime
    type: TimelineEventType
    title: str
    description: str = ""
    source: str = "plumbline"
    # certainty distinguishes confirmed evidence from inference — the UI
    # renders these differently and must never fabricate missing events.
    certainty: str = "confirmed"  # "confirmed" | "inferred"
    confidence: Optional[float] = None
    evidence_refs: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RemediationPreview(BaseModel):
    drift_event_id: str
    resources_modified: int = 0
    resources_destroyed: int = 0
    resources_replaced: int = 0
    known_dependents: int = 0
    downtime_expected: bool = False
    risk_before: Severity = Severity.INFO
    risk_after: Severity = Severity.INFO
    terraform_actions: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    eligible_for_auto: bool = False
    reasons: list[str] = Field(default_factory=list)


class ReconciliationProposal(BaseModel):
    id: str
    drift_event_id: str
    strategy: RemediationStrategy
    resource_address: str
    changed_attributes: list[AttributeDiff] = Field(default_factory=list)
    recommended_tf_changes: list[dict[str, Any]] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    risk: Severity = Severity.INFO
    status: str = "draft"  # draft | pr_created | merged | rejected | failed
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    reasons: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------------------------
# API payloads
# --------------------------------------------------------------------------

class ScanIngestRequest(BaseModel):
    environment: str
    repository: str = ""
    commit_sha: str = ""
    workspace: str = "default"
    regions: list[str] = Field(default_factory=list)
    account_id: str = ""
    terraform_exit_code: int = 0
    plan_json: Optional[dict[str, Any]] = None
    plan_artifact_uri: Optional[str] = None  # e.g. s3://bucket/key for large plans


class Page(BaseModel):
    items: list[Any] = Field(default_factory=list)
    next_cursor: Optional[str] = None
    total: Optional[int] = None


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class StaleDriftError(ApiError):
    def __init__(self, detail: str = "Drift state changed; a fresh scan is required."):
        super().__init__(409, detail)


class UnsupportedFormatError(ApiError):
    def __init__(self, detail: str):
        super().__init__(422, detail)
