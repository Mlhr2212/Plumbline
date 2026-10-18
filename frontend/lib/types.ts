// TypeScript mirror of backend/app/domain/models.py — the shared API contract.

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DriftStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "REMEDIATION_REQUESTED"
  | "RECONCILING"
  | "RESOLVED"
  | "ACCEPTED"
  | "IGNORED"
  | "SUPERSEDED";

export type ChangeType = "added" | "removed" | "modified";

export interface AttributeDiff {
  path: string;
  before: unknown;
  after: unknown;
  change_type: ChangeType;
  sensitive: boolean;
}

export interface RiskFactor {
  rule_id: string;
  score: number;
  message: string;
  evidence: Record<string, unknown>;
}

export interface Attribution {
  actor: string | null;
  actor_type: string | null;
  event_name: string | null;
  event_time: string | null;
  source_ip: string | null;
  user_agent: string | null;
  event_id: string | null;
  confidence: number;
  source: "cloudtrail" | "config" | "none";
  status: string; // "identified" | "candidate" | "unknown" | "disabled"
  candidates: Record<string, unknown>[];
}

export interface DependencyEdge {
  dependent: string;
  dependency: string;
  evidence: "EXPLICIT" | "TERRAFORM_REFERENCE" | "INFERRED";
  via: string | null;
}

export interface DependencySummary {
  direct_dependents: string[];
  transitive_dependents: string[];
  depth: number;
  affected_critical_resources: string[];
  edges: DependencyEdge[];
  label: string;
  evidence_note: string;
}

export interface TerraformMetadata {
  format_version: string | null;
  terraform_version: string | null;
  workspace: string | null;
  plan_hash: string | null;
  resource_changes: number;
  resources_drifted: number;
  actions: string[];
  planned_actions: string[];
}

export interface EvidenceItem {
  kind: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface DriftEvent {
  id: string;
  scan_id: string;
  fingerprint: string;
  resource_address: string;
  resource_type: string;
  resource_name: string;
  provider: string;
  aws_service: string;
  environment: string;
  region: string;
  aws_account_id: string;
  actions: string[];
  severity: Severity;
  risk_score: number;
  status: DriftStatus;
  detected_at: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  scan_count: number;
  attribute_diffs: AttributeDiff[];
  cloudtrail_attribution: Attribution;
  risk_factors: RiskFactor[];
  dependency_context: DependencySummary;
  recommended_action: string;
  remediation_eligibility: Record<string, unknown>;
  terraform_metadata: TerraformMetadata;
  evidence: EvidenceItem[];
}

export interface Scan {
  id: string;
  environment: string;
  repository: string;
  commit_sha: string;
  workspace: string;
  regions: string[];
  account_id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  terraform_exit_code: number | null;
  terraform_version: string | null;
  plan_format_version: string | null;
  plan_hash: string | null;
  drift_detected: number;
  drift_resolved: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface TimelineEvent {
  drift_id: string;
  timestamp: string;
  type: string;
  title: string;
  description: string;
  source: string;
  certainty: "confirmed" | "inferred" | string;
  confidence: number | null;
  evidence_refs: string[];
  metadata: Record<string, unknown>;
}

export interface RemediationPreview {
  drift_event_id: string;
  resources_modified: number;
  resources_destroyed: number;
  resources_replaced: number;
  known_dependents: number;
  downtime_expected: boolean;
  risk_before: Severity;
  risk_after: Severity;
  terraform_actions: string[];
  confidence: number;
  eligible_for_auto: boolean;
  reasons: string[];
}

export interface ReconciliationProposal {
  id: string;
  drift_event_id: string;
  strategy: string;
  resource_address: string;
  changed_attributes: AttributeDiff[];
  recommended_tf_changes: Record<string, unknown>[];
  evidence: EvidenceItem[];
  risk: Severity;
  status: string;
  pr_url: string | null;
  pr_number: number | null;
  reasons: string[];
  created_at: string;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  total: number | null;
}

export interface Overview {
  environment: string | null;
  active_drift: number;
  total_drift_events: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  last_scan: {
    id: string;
    status: string;
    completed_at: string | null;
    drift_detected: number;
    drift_resolved: number;
  } | null;
}
