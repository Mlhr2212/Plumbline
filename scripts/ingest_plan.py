#!/usr/bin/env python3
"""Upload a Terraform plan JSON to PlumbLine's ingestion endpoint.

Runs inside GitHub Actions (stdlib only — no pip installs needed).

Auth: HMAC-SHA256 signature of "<unix_ts>.<request body>" using
PLUMBLINE_INGEST_SECRET, sent as X-Plumbline-Signature / X-Plumbline-Timestamp.

Before upload, values flagged sensitive by Terraform's own *_sensitive masks
are redacted — plans can contain secrets and they must not leave the runner.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

REDACTED = "<redacted>"


def redact(value, mask):
    """Return a copy of ``value`` with sensitive-marked subtrees redacted."""
    if mask is True:
        return REDACTED
    if isinstance(value, dict) and isinstance(mask, dict):
        return {k: redact(v, mask.get(k)) for k, v in value.items()}
    if isinstance(value, list) and isinstance(mask, list):
        return [redact(v, mask[i] if i < len(mask) else None)
                for i, v in enumerate(value)]
    return value


def sanitize_plan(plan: dict) -> dict:
    """Redact before/after values wherever the *_sensitive mask is set."""
    for section in ("resource_drift", "resource_changes"):
        for res in plan.get(section) or []:
            change = res.get("change") or {}
            for side in ("before", "after"):
                mask = change.get(f"{side}_sensitive")
                if mask and change.get(side) is not None:
                    change[side] = redact(change[side], mask)
    return plan


def main() -> int:
    p = argparse.ArgumentParser(description="Ingest a Terraform plan into PlumbLine.")
    p.add_argument("--api-url", required=True, help="PlumbLine base URL")
    p.add_argument("--plan-file", default="tfplan.json")
    p.add_argument("--environment", required=True)
    p.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    p.add_argument("--commit-sha", default=os.environ.get("GITHUB_SHA", ""))
    p.add_argument("--workspace", default=os.environ.get("TF_WORKSPACE", "default"))
    p.add_argument("--region", action="append", default=[],
                   help="AWS region (repeatable)")
    p.add_argument("--account-id", default="")
    p.add_argument("--exit-code", type=int, required=True,
                   help="terraform plan -detailed-exitcode result (0/1/2)")
    args = p.parse_args()

    secret = os.environ.get("PLUMBLINE_INGEST_SECRET", "")
    if not secret:
        print("error: PLUMBLINE_INGEST_SECRET is not set", file=sys.stderr)
        return 2

    with open(args.plan_file, "rb") as fh:
        plan_bytes = fh.read()
    try:
        plan = json.loads(plan_bytes)
    except ValueError:
        print(f"error: {args.plan_file} is not valid JSON", file=sys.stderr)
        return 2

    plan = sanitize_plan(plan)

    payload = {
        "environment": args.environment,
        "repository": args.repository,
        "commit_sha": args.commit_sha,
        "workspace": args.workspace,
        "regions": args.region,
        "account_id": args.account_id,
        "terraform_exit_code": args.exit_code,
        "plan_json": plan,
    }
    body = json.dumps(payload, separators=(",", ":")).encode()

    ts = int(time.time())
    signature = hmac.new(secret.encode(), f"{ts}.".encode() + body,
                         hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        f"{args.api_url.rstrip('/')}/api/v1/scans/ingest",
        data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Plumbline-Timestamp": str(ts),
            "X-Plumbline-Signature": signature,
        })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"ingest ok ({resp.status}): {resp.read().decode()[:500]}")
            return 0
    except urllib.error.HTTPError as e:
        print(f"ingest failed ({e.code}): {e.read().decode()[:500]}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
