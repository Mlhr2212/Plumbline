# PlumbLine Frontend

Investigation UI for the PlumbLine drift platform. Next.js 15 (App Router) +
TypeScript + Tailwind v4. Dark-first "operational control plane" — dense,
quiet, evidence-driven.

## Run

```bash
cp .env.example .env.local   # set PLUMBLINE_API_URL + PLUMBLINE_API_KEY
npm install
npm run dev                  # dev on :3000
npm run build && npm start   # production
```

The API key is only ever attached server-side (route handlers in `app/api/`),
never shipped to the browser.

## Map

| Route | Purpose |
|---|---|
| `/` | Health banner → "Needs attention" → derived drift health → secondary panels |
| `/drifts` | Drift Explorer — filter bar, sortable/dense table, right-side row inspector |
| `/drifts/[id]` | Flagship incident workspace: selectable Drift Replay → evidence inspector, specialized SG/IAM diffs, explainable risk, attribution confidence, remediation slide-over |
| `/timeline` | Global infrastructure event feed (composed from scans + drift lifecycle) |
| `/scans`, `/scans/[id]` | Ingest audit trail + scan metadata |
| `/reconciliations` | Reviewable reconciliation proposals + PR links |
| `/infrastructure` | Resources observed through plans (explicitly not a full inventory) |
| `/settings` | Connection/env info + keyboard reference |

## Conventions

- **⌘K** opens the command palette (lazy search index via `/api/search-index`).
- Server components fetch data; client components handle interaction.
- Severity = colored dot + word (never color alone); inferred timeline events
  render dashed/faded vs. solid confirmed.
- All decisions (drift, risk, confidence, eligibility) come from the backend —
  the UI displays, filters, navigates, and requests actions.
- Tokens in `app/globals.css` `@theme` — light mode is a token override away.
