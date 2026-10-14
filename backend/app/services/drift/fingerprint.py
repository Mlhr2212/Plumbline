"""Deterministic drift fingerprinting.

The fingerprint identifies "the same drift" across repeated scheduled scans.
It is derived only from stable, normalized fields — never timestamps — and
sensitive values are substituted with a constant marker so they cannot leak
into logs, fingerprints, or dedup keys.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.domain.models import AttributeDiff

_SENSITIVE_MARKER = "SENSITIVE_VALUE"


def _canonical(value: Any) -> Any:
    """Normalize a value into a JSON-stable canonical form."""
    if isinstance(value, dict):
        return {k: _canonical(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))}
    if isinstance(value, (list, tuple)):
        return [_canonical(v) for v in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def fingerprint_drift(
    environment: str,
    resource_address: str,
    diffs: list[AttributeDiff],
) -> str:
    """SHA-256 over the canonical drift signature."""
    items = []
    for d in diffs:
        items.append({
            "path": d.path,
            "change_type": d.change_type.value,
            "before": _SENSITIVE_MARKER if d.sensitive else _canonical(d.before),
            "after": _SENSITIVE_MARKER if d.sensitive else _canonical(d.after),
        })
    items.sort(key=lambda x: x["path"])
    payload = {
        "environment": environment,
        "resource_address": resource_address,
        "diffs": items,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def plan_hash(plan_json: dict[str, Any]) -> str:
    """Stable hash of the reconciliation-relevant parts of a plan.

    Used to detect stale remediation attempts: if a new plan produces a
    different hash, previously queued remediations must not proceed.
    """
    relevant = {
        "resource_drift": plan_json.get("resource_drift") or [],
        "resource_changes": [
            {"address": r.get("address"), "actions": (r.get("change") or {}).get("actions")}
            for r in (plan_json.get("resource_changes") or [])
        ],
    }
    blob = json.dumps(_canonical(relevant), sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
