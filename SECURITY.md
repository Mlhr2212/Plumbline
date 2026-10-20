# Security Policy

PlumbLine is a **portfolio/demo deployment**, not a production system. Read
this before relying on it or reporting issues.

## Demo posture (honest)

- The reference deployment runs the API and UI on a single public EC2
  instance over **plain HTTP** — no TLS, no auth on read endpoints.
- The UI's server-side proxy attaches `x-api-key` for mutation endpoints;
  the key lives only in instance env files and SSM SecureString parameters.
- Drift attribution data may contain real CloudTrail metadata. The UI
  redacts source IPs server-side (`a.b.x.x`) before rendering; the raw API
  does not.
- Automatic remediation is off by design — reconciliations are human-reviewed
  proposals, never silent applies.

## What is genuinely hardened

- CI authenticates to AWS via **GitHub OIDC** (no long-lived AWS keys).
- Plan ingest is **HMAC-signed** with a timestamp window.
- Secrets live in SSM SecureString / GitHub secrets — never in the repo
  (verified: no secrets in git history).
- Runtime IAM is read-only for detection; remediation is a separate boundary.
- Terraform `*_sensitive` values are redacted before upload and at ingest.

## Reporting

This is a personal project — for security concerns, open a private advisory
on GitHub rather than a public issue. If you found a way to reach write
endpoints without the API key, or exposed secrets, that's a real bug: please
report it.
