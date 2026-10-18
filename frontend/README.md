# PlumbLine Frontend

Next.js (App Router) + Tailwind UI for the PlumbLine drift-detection platform,
built against the backend contract in `backend/` (see the root README for the
endpoint list).

## What it shows

- **Overview** (`/`) — active drift count, severity breakdown, last-scan
  status, open incidents.
- **Drift Events** (`/drifts`) — filterable table (severity, status) with a
  generated plain-English summary per row.
- **Drift detail** (`/drifts/:id`) — the investigation page: plain-English
  summary, "who did it" CloudTrail attribution card, attribute diffs, known
  dependency impact, risk-factor breakdown, **Drift Replay** timeline, and
  Remediation Preview with lifecycle actions.
- **Scans** (`/scans`) — ingest audit trail.

### UI semantics

- Confirmed timeline events render as solid markers; **inferred** events are
  dashed/faded and marked `inferred` — the UI never presents inference as fact.
- "Known Dependency Impact" is labeled as Terraform-reference-derived only.
- Mutation endpoints (`reconcile`, `accept`, `ignore`, `acknowledge`) are
  proxied through `app/api/drifts/[id]/[action]/route.ts`, which attaches
  `x-api-key` server-side — the API key never reaches the browser.

## Run it

```bash
cp .env.example .env.local   # set PLUMBLINE_API_URL (+ PLUMBLINE_API_KEY for actions)
npm install
npm run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `PLUMBLINE_API_URL` | Backend base URL (default `http://localhost:8000`) |
| `PLUMBLINE_API_KEY` | Required only for drift lifecycle actions (reconcile/accept/ignore/acknowledge) |
