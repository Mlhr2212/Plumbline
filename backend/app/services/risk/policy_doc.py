"""Minimal IAM policy document analysis helpers.

Parses policy documents (JSON strings or dicts, including
``assume_role_policy`` trust documents) into normalized statement sets so IAM
drift rules can be evaluated deterministically.
"""
from __future__ import annotations

import json
from typing import Any, Optional


def _as_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    return [str(v)]


def load_policy(value: Any) -> Optional[dict[str, Any]]:
    """Accept a JSON string or dict; return a policy dict or None."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return None
    if not isinstance(value, dict):
        return None
    return value


def statements(policy: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize a policy into a list of statement dicts."""
    if not policy:
        return []
    raw = policy.get("Statement", [])
    if isinstance(raw, dict):
        raw = [raw]
    out = []
    for s in raw:
        if not isinstance(s, dict):
            continue
        principal = s.get("Principal") or {}
        principals: set[str] = set()
        if isinstance(principal, dict):
            for kind in ("AWS", "Service", "Federated"):
                principals.update(_as_list(principal.get(kind)))
        elif isinstance(principal, str):
            principals.add(principal)
        out.append({
            "sid": s.get("Sid"),
            "effect": s.get("Effect", "Allow"),
            "actions": set(_as_list(s.get("Action"))),
            "not_actions": set(_as_list(s.get("NotAction"))),
            "resources": set(_as_list(s.get("Resource"))),
            "not_resources": set(_as_list(s.get("NotResource"))),
            "principals": principals,
            "has_condition": bool(s.get("Condition")),
        })
    return out


def allowed_actions(policy: Optional[dict[str, Any]]) -> set[str]:
    return {a for s in statements(policy) if s["effect"] == "Allow" for a in s["actions"]}


def allowed_resources(policy: Optional[dict[str, Any]]) -> set[str]:
    return {r for s in statements(policy) if s["effect"] == "Allow" for r in s["resources"]}


def trusted_principals(policy: Optional[dict[str, Any]]) -> set[str]:
    return {p for s in statements(policy) if s["effect"] == "Allow" for p in s["principals"]}


def has_unanalyzable_notaction(policy: Optional[dict[str, Any]]) -> bool:
    return any(s["not_actions"] for s in statements(policy) if s["effect"] == "Allow")


def is_admin_like(actions: set[str], resources: set[str]) -> bool:
    """True when the allow set is effectively full administrative access."""
    action_admin = "*" in actions or "iam:*" in actions
    resource_any = "*" in resources
    return action_admin and resource_any
