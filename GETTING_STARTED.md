# PlumbLine — What It Is and How to Use It (Plain English)

## What it does, in one paragraph

You manage AWS resources with Terraform — security groups, servers, buckets.
Sometimes someone logs into the AWS console and changes something by hand:
opens SSH to the world, attaches an admin policy, deletes a function.
Terraform will notice eventually, but it won't tell you **who** did it,
**how risky** it is, or **what might break** if you fix it.

PlumbLine watches for that. On a schedule it runs `terraform plan`, reads the
machine-readable result, and turns each surprise change into an incident you
can review: what changed, who probably did it (via CloudTrail logs), how
dangerous it is, what depends on it, and the safest way to fix it — usually a
GitHub pull request, never a silent auto-fix.

## The two features to show people

**Drift Replay** — a timeline for each incident, like a flight recorder:
baseline → someone changed AWS → CloudTrail recorded it → scheduled scan
caught it → risk scored → you reviewed → fixed. Entries marked `inferred`
are educated guesses; `confirmed` entries have evidence.

**Remediation Preview** — before fixing anything, see what the fix would do:
"1 resource modified, 0 destroyed, risk CRITICAL → LOW, no downtime
indicators detected" — with the reasoning spelled out.

## Try it locally (no AWS needed, ~5 minutes)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload
```

In another terminal, send it a sample drift scan (a security group where
someone opened SSH to the world):

```bash
cd backend
python3 -c '
import json, urllib.request
plan = json.load(open("tests/fixtures/plan_sg_ssh_open.json"))
body = json.dumps({"environment": "dev", "terraform_exit_code": 2,
                   "plan_json": plan}).encode()
urllib.request.urlopen(urllib.request.Request(
    "http://localhost:8000/api/v1/scans/ingest", data=body,
    headers={"Content-Type": "application/json"}))
'
```

Then explore:

```bash
curl localhost:8000/api/v1/drifts                              # the incident
curl localhost:8000/api/v1/drifts/<id>/timeline                # Drift Replay
curl localhost:8000/api/v1/drifts/<id>/remediation-preview     # what a fix would do
curl localhost:8000/api/v1/overview                            # dashboard summary
```

Interactive API docs: `http://localhost:8000/docs`

## Try the real thing on AWS (the demo)

Prereqs: an AWS sandbox account (NOT production), Terraform ≥1.5, AWS CLI.

1. **Create the PlumbLine infrastructure** — storage tables, the S3 buckets,
   and the IAM role GitHub Actions uses:

   ```bash
   cd terraform/plumbline
   terraform init && terraform apply -var "github_repository=YOUR_USER/Plumbline"
   ```

   Save the outputs — especially `drift_scanner_role_arn` and the table names.

2. **Create the demo environment** — a security group, an EC2 instance, a
   bucket, IAM roles, a Lambda:

   ```bash
   cd ../sandbox
   terraform init && terraform apply
   ```

3. **Run the backend on EC2** (or locally with AWS credentials): set
   `PLUMBLINE_STORAGE_BACKEND=dynamodb` plus the env vars in
   `backend/.env.example`.

4. **Wire up GitHub Actions** — set these on the repo:
   - Secret `AWS_DRIFT_SCAN_ROLE_ARN` → from step 1 output
   - Secret `PLUMBLINE_INGEST_SECRET` → any long random string (same value goes in the backend `.env`)
   - Variable `PLUMBLINE_API_URL` → where the backend is reachable

   The `drift-scan` workflow now runs hourly.

5. **Make a mess on purpose** — in the AWS console, edit the
   `plumbline-sandbox-web` security group and add inbound TCP 22 from
   `0.0.0.0/0`. Within the hour, PlumbLine reports a HIGH-severity drift
   incident with a Drift Replay timeline — and if CloudTrail is enabled, the
   IAM identity that made the change.

6. **Fix it** — open the incident, read the remediation preview, request
   reconciliation. Or just run `terraform apply` in `terraform/sandbox` and
   watch the incident resolve itself on the next scan.

## Safety notes

- PlumbLine **detects and explains**; it does not auto-change your
  infrastructure. Auto-remediation exists but is off by default and only
  covers a tiny allowlist (tag fixes, removing public SG rules).
- Use a sandbox account while learning it.
- Never commit AWS keys — GitHub Actions uses OIDC, the backend uses an
  instance role.
