# PlumbLine architecture

Five views of the system: the ingest sequence, the drift lifecycle, the domain
model, the backend layering, and the deployed topology. All diagrams are
Mermaid — they render on GitHub and live in version control.

## System context

PlumbLine sits between a scheduled Terraform plan and the engineer who has to
explain what changed. Terraform does the detection; PlumbLine does the
investigation.

```mermaid
flowchart LR
    subgraph CI["GitHub Actions"]
        WF["drift-scan.yml<br/>hourly / dispatch / PR"]
    end
    subgraph AWS["AWS account"]
        OIDC["OIDC provider<br/>+ read-only scanner role"]
        SBX["sandbox env<br/>terraform/sandbox"]
        CT["CloudTrail"]
    end
    subgraph EC2["EC2 instance (Elastic IP)"]
        FE["plumbline-frontend<br/>Next.js :3000"]
        BE["plumbline<br/>FastAPI :8000"]
        FE -->|"server-side fetch<br/>localhost:8000 + x-api-key"| BE
    end
    subgraph DATA["Persistence"]
        DDB[("DynamoDB ×4")]
        S3[("S3 artifacts / tfstate")]
    end
    WF -->|"assume role (no keys)"| OIDC
    OIDC -->|"terraform plan<br/>(read-only)"| SBX
    WF -->|"HMAC-signed plan JSON<br/>POST /scans/ingest"| BE
    BE --> DDB
    BE -->|"LookupEvents"| CT
    USER(["engineer"]) -->|"http :3000"| FE
```

## Ingest sequence

The ordered stages of one scan — from scheduled trigger to persisted,
attributed drift event. Each stage is deterministic.

```mermaid
sequenceDiagram
    participant GHA as GitHub Actions
    participant AWS as AWS (OIDC · sandbox)
    participant API as FastAPI pipeline
    participant CT as CloudTrail
    participant DB as DynamoDB

    GHA->>AWS: OIDC token → assume read-only scanner role
    GHA->>AWS: terraform plan -detailed-exitcode
    AWS-->>GHA: exit 0 (clean) / 2 (changes) / 1 (error)
    GHA->>GHA: terraform show -json → tfplan.json
    GHA->>API: POST /api/v1/scans/ingest<br/>(HMAC-SHA256 signature)
    API->>API: verify signature + timestamp window
    API->>API: parse plan → resource_drift only<br/>(resource_changes never creates incidents)
    loop each drifted resource
        API->>API: attribute diff → fingerprint
        alt fingerprint matches active event
            API->>DB: last_seen_at++, scan_count++ (no new incident)
        else fingerprint differs on same resource
            API->>DB: old event → SUPERSEDED
            API->>API: continue as new drift ↓
        end
        API->>CT: LookupEvents (90-day window)
        CT-->>API: candidate events
        API->>API: confidence score → actor / unknown
        API->>API: risk rules → severity + score
        API->>API: dependency context (config refs only)
        API->>API: remediation policy → eligibility
        API->>DB: save DriftEvent + replay timeline
    end
    API->>DB: resolve pass — active drifts absent<br/>from this scan → RESOLVED
    API-->>GHA: Scan{status: COMPLETED, drift_detected}
```

PR-triggered runs stop before ingest: they generate a plan for review but
**never** create drift incidents — developer config changes are not drift.

## Drift lifecycle

The state machine every `DriftEvent` follows. Scan-driven transitions
(re-observe / supersede / resolve) apply to every non-terminal status; API
actions are guarded by a stale-drift check (`409 STALE_DRIFT`).

```mermaid
stateDiagram-v2
    [*] --> OPEN : scan detects drift
    state Active {
        OPEN --> OPEN : re-observed, same fingerprint
        OPEN --> ACKNOWLEDGED : acknowledge
        OPEN --> REMEDIATION_REQUESTED : reconcile
        ACKNOWLEDGED --> REMEDIATION_REQUESTED : reconcile
    }
    Active --> RESOLVED : drift absent in later scan
    Active --> SUPERSEDED : fingerprint changed → new event
    Active --> ACCEPTED : accept (ACCEPT_DRIFT)
    Active --> IGNORED : ignore
    note right of Active
        RECONCILING is declared but reserved.
        Terminal states are immutable —
        any action on them returns 409.
    end note
```

## Domain model

The aggregates and value objects in `backend/app/domain/models.py`. This is
the shared contract between ingestion, risk, persistence, and the REST API
the frontend consumes — nothing here is produced by an LLM.

```mermaid
classDiagram
    class Scan {
        +id
        +environment
        +status: ScanStatus
        +terraform_exit_code
        +plan_hash
        +drift_detected
        +drift_resolved
    }
    class DriftEvent {
        +id
        +scan_id
        +fingerprint
        +resource_address
        +severity: Severity
        +risk_score
        +status: DriftStatus
        +scan_count
    }
    class AttributeDiff {
        +path
        +before
        +after
        +change_type: ChangeType
        +sensitive
    }
    class Attribution {
        +actor
        +event_name
        +source_ip
        +confidence
        +status
        +candidates
    }
    class RiskFactor {
        +rule_id
        +score
        +message
        +evidence
    }
    class DependencySummary {
        +direct_dependents
        +transitive_dependents
        +depth
        +edges
    }
    class TimelineEvent {
        +drift_id
        +type: TimelineEventType
        +certainty
        +confidence
    }
    class ReconciliationProposal {
        +id
        +drift_event_id
        +strategy: RemediationStrategy
        +status
        +pr_url
        +changed_attributes
    }
    class RemediationPreview {
        +drift_event_id
        +terraform_actions
        +risk_before
        +risk_after
        +eligible_for_auto
    }
    Scan "1" --> "*" DriftEvent : detects
    DriftEvent *-- "*" AttributeDiff : what changed
    DriftEvent *-- "1" Attribution : who did it
    DriftEvent *-- "*" RiskFactor : why it matters
    DriftEvent *-- "1" DependencySummary : what it affects
    DriftEvent *-- "1" TerraformMetadata : plan provenance
    DriftEvent "1" --> "*" TimelineEvent : Drift Replay
    DriftEvent "1" --> "0..1" ReconciliationProposal : reconcile()
    DriftEvent "1" --> "0..1" RemediationPreview : preview()
```

## Backend layering

Ports-and-adapters: the domain is storage- and provider-agnostic. `memory.py`
and `dynamodb.py` implement the same `Repositories` interface; `IaCRunner`
keeps the Terraform/OpenTofu engine swappable.

```mermaid
flowchart TB
    subgraph API["api/ — FastAPI routes"]
        R["scans · drifts · overview<br/>reconciliations · health"]
    end
    subgraph SVC["services/ — domain logic"]
        P["drift.pipeline<br/>parse→diff→fp→risk→attr→deps→policy"]
        RISK["risk.engine<br/>deterministic rules"]
        RPL["drift.replay<br/>timeline generation"]
        REM["remediation.preview<br/>remediation.reconciliation"]
        POL["remediation.policy<br/>auto-remediation allowlist"]
    end
    subgraph INT["integrations/"]
        CTR["aws.cloudtrail"]
        GH["github.client"]
        IAC["iac.runner<br/>(Terraform / OpenTofu)"]
    end
    subgraph REPO["repositories/ — ports"]
        IF["interfaces.Repositories"]
        MEM["memory.py"]
        DYN["dynamodb.py"]
    end
    PARS["parsers/terraform_plan.py"] --> P
    API --> SVC
    SVC --> INT
    SVC --> IF
    IF --> MEM & DYN
```

## Deployment topology

One `t3.micro` co-hosts both services behind a single Elastic IP; the UI's
server-side fetches never leave the box. CI authentication is OIDC — there
are no long-lived AWS keys anywhere.

```mermaid
flowchart TB
    subgraph GH["GitHub"]
        ACT["Actions runner<br/>drift-scan.yml"]
    end
    subgraph ACCT["AWS account 376634957118 · us-east-2"]
        EIP["Elastic IP<br/>13.59.128.63"]
        subgraph HOST["t3.micro — plumbline"]
            UNIT1["plumbline.service<br/>uvicorn :8000"]
            UNIT2["plumbline-frontend.service<br/>node server.js :3000"]
        end
        DDB[("DynamoDB<br/>drifts·scans·timeline·reconc·lock")]
        ART[("S3<br/>plan artifacts")]
        ST[("S3<br/>tfstate")]
        OIDCP["OIDC provider<br/>scanner role (read-only)"]
        CTL["CloudTrail"]
        SBX["terraform/sandbox<br/>demo resources"]
    end
    ACT -->|"id-token → assume role"| OIDCP
    OIDCP -->|"terraform plan"| SBX
    ACT -->|"HMAC POST :8000"| EIP
    EIP --> UNIT1
    EIP --> UNIT2
    UNIT2 -->|"localhost:8000<br/>x-api-key"| UNIT1
    UNIT1 --> DDB & ART
    UNIT1 -->|"LookupEvents"| CTL
    SBX -.->|"state lock/state"| ST
    ACT -.->|"put/get"| ST
```

`user_data_replace_on_change` replaces the instance on every deploy; the EIP
re-associates automatically so public URLs are stable. Secrets arrive via SSM
SecureString at bootstrap — never in user data, state, or the repo.

## Reading order for a new engineer

1. `backend/app/domain/models.py` — the shared vocabulary
2. `backend/app/parsers/terraform_plan.py` — `resource_drift` extraction
3. `backend/app/services/drift/pipeline.py` — the ordered ingest stages
4. `backend/app/services/risk/` + `services/drift/replay.py` — scoring + timeline
5. `backend/app/services/remediation/` — preview, proposal, policy
6. `frontend/lib/types.ts` — the mirror of the domain the UI trusts
