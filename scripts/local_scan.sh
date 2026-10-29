#!/usr/bin/env bash
# Local self-hosted scan: terraform plan -> show -json -> ingest into a
# locally-running PlumbLine. Nothing leaves your machine.
#
# Usage:
#   scripts/local_scan.sh <terraform-dir> [environment] [api-url]
#
#   terraform-dir   directory containing your .tf files (default: .)
#   environment     drift environment label      (default: dev)
#   api-url         local PlumbLine              (default: http://localhost:8000)
#
# Requires: terraform (or tofu — set TF_BIN=tofu), python3, and the backend
# running with PLUMBLINE_STORAGE_BACKEND=sqlite (or memory).
set -euo pipefail

TF_DIR="${1:-.}"
ENVIRONMENT="${2:-dev}"
API_URL="${3:-http://localhost:8000}"
TF_BIN="${TF_BIN:-terraform}"

cd "$TF_DIR"

echo "==> $TF_BIN init"
"$TF_BIN" init -input=false -no-color >/dev/null

echo "==> $TF_BIN plan"
set +e
"$TF_BIN" plan -detailed-exitcode -out=plumbline.tfplan -no-color -input=false
code=$?
set -e
if [ "$code" -eq 1 ]; then
    echo "error: terraform plan failed" >&2
    exit 1
fi

"$TF_BIN" show -json plumbline.tfplan > plumbline.tfplan.json
rm -f plumbline.tfplan

echo "==> ingesting into $API_URL"
python3 - "$API_URL" "$ENVIRONMENT" "$code" <<'PYEOF'
import json, sys, urllib.request

api_url, environment, exit_code = sys.argv[1], sys.argv[2], int(sys.argv[3])
plan = json.load(open("plumbline.tfplan.json"))

REDACTED = "<redacted>"
def redact(value, mask):
    if mask is True:
        return REDACTED
    if isinstance(value, dict) and isinstance(mask, dict):
        return {k: redact(v, mask.get(k)) for k, v in value.items()}
    if isinstance(value, list) and isinstance(mask, list):
        return [redact(v, mask[i] if i < len(mask) else None)
                for i, v in enumerate(value)]
    return value

for section in ("resource_drift", "resource_changes"):
    for res in plan.get(section) or []:
        change = res.get("change") or {}
        for side in ("before", "after"):
            mask = change.get(f"{side}_sensitive")
            if mask and change.get(side) is not None:
                change[side] = redact(change[side], mask)

body = json.dumps({"environment": environment,
                   "terraform_exit_code": exit_code,
                   "plan_json": plan}).encode()
try:
    with urllib.request.urlopen(urllib.request.Request(
            f"{api_url.rstrip('/')}/api/v1/scans/ingest", data=body,
            headers={"Content-Type": "application/json"}, timeout=60)) as resp:
        print(f"ingest ok ({resp.status}): {resp.read().decode()[:400]}")
except urllib.error.HTTPError as e:
    print(f"ingest failed ({e.code}): {e.read().decode()[:400]}", file=sys.stderr)
    sys.exit(1)
PYEOF

rm -f plumbline.tfplan.json
echo "==> done — view results at ${API_URL/8000/3000}"
