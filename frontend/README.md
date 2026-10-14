# PlumbLine Frontend

The frontend (Next.js/React) is owned and implemented separately against the
shared API contract exposed by `backend/` (see the root README for endpoints).

Key surfaces the backend guarantees:

- `GET /api/v1/overview` — dashboard aggregates
- `GET /api/v1/drifts` (+ filters) — drift event list
- `GET /api/v1/drifts/{id}` — full normalized drift event
- `GET /api/v1/drifts/{id}/timeline` — **Drift Replay** forensic timeline;
  each entry carries `certainty` (`confirmed` vs `inferred`) — render these
  differently and never fabricate missing events
- `GET /api/v1/drifts/{id}/dependencies` — "Known Dependency Impact"
  (Terraform-derived only — label it accordingly)
- `GET /api/v1/drifts/{id}/remediation-preview` — predicted actions, risk
  before/after, confidence, reasons
- `POST /api/v1/drifts/{id}/reconcile | accept | ignore | acknowledge`
- `GET /api/v1/scans`, `GET /api/v1/reconciliations`
