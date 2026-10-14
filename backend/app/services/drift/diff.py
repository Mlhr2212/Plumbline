"""Deterministic recursive attribute diff engine.

Produces leaf-level diffs with Terraform-style paths, e.g.::

    ingress[0].cidr_blocks[0]  10.0.0.0/8 -> 0.0.0.0/0  (modified)

Sensitivity is driven by Terraform's own ``*_sensitive`` masks carried in the
plan JSON. Any node whose mask is truthy is reported as a single redacted
diff — its children are never inspected, so sensitive values cannot leak into
logs, fingerprints, or the API.
"""
from __future__ import annotations

from typing import Any

from app.domain.models import AttributeDiff, ChangeType, REDACTED

MAX_DIFFS_PER_RESOURCE = 500


def _is_sensitive(mask: Any) -> bool:
    """True when the Terraform sensitivity mask marks this node sensitive."""
    return mask is True


def diff(
    before: Any,
    after: Any,
    before_sensitive: Any = None,
    after_sensitive: Any = None,
    path: str = "",
) -> list[AttributeDiff]:
    """Compute deterministic leaf diffs between two Terraform values."""
    out: list[AttributeDiff] = []
    _diff(before, after, before_sensitive, after_sensitive, path, out)
    if len(out) > MAX_DIFFS_PER_RESOURCE:
        kept = out[:MAX_DIFFS_PER_RESOURCE]
        kept.append(
            AttributeDiff(
                path="$truncated",
                before=None,
                after=None,
                change_type=ChangeType.MODIFIED,
                sensitive=False,
            )
        )
        return kept
    return out


def _mask_for(mask: Any, key: Any) -> Any:
    """Extract the sensitivity mask for a child node."""
    if isinstance(mask, dict):
        return mask.get(key)
    if isinstance(mask, list) and isinstance(key, int) and 0 <= key < len(mask):
        return mask[key]
    return None


def _diff(before: Any, after: Any, bmask: Any, amask: Any, path: str, out: list[AttributeDiff]) -> None:
    sensitive = _is_sensitive(bmask) or _is_sensitive(amask)
    if sensitive:
        if before != after:
            out.append(
                AttributeDiff(path=path or "$", before=REDACTED, after=REDACTED,
                              change_type=_change_type(before, after), sensitive=True)
            )
        return

    if before == after:
        return

    bdict, adict = isinstance(before, dict), isinstance(after, dict)
    blist, alist = isinstance(before, list), isinstance(after, list)

    if bdict and adict:
        keys: list[str] = []
        for k in list(before.keys()) + list(after.keys()):
            if k not in keys:
                keys.append(k)
        for k in keys:
            _diff(
                before.get(k), after.get(k),
                _mask_for(bmask, k), _mask_for(amask, k),
                f"{path}.{k}" if path else str(k), out,
            )
        return

    if blist and alist:
        for i in range(max(len(before), len(after))):
            b = before[i] if i < len(before) else None
            a = after[i] if i < len(after) else None
            exists_b, exists_a = i < len(before), i < len(after)
            if not exists_b:
                _diff(None, a, None, _mask_for(amask, i), f"{path}[{i}]", out)
            elif not exists_a:
                _diff(b, None, _mask_for(bmask, i), None, f"{path}[{i}]", out)
            else:
                _diff(b, a, _mask_for(bmask, i), _mask_for(amask, i), f"{path}[{i}]", out)
        return

    if bdict or adict or blist or alist:
        # Container added/removed or type change: descend so diffs stay leaf-level.
        _emit_leaves(before, after, bmask, amask, path, out)
        return

    out.append(
        AttributeDiff(path=path or "$", before=before, after=after,
                      change_type=_change_type(before, after), sensitive=False)
    )


def _emit_leaves(before: Any, after: Any, bmask: Any, amask: Any, path: str, out: list[AttributeDiff]) -> None:
    """Emit leaf diffs for an added/removed container subtree."""
    if _is_sensitive(bmask) or _is_sensitive(amask):
        out.append(
            AttributeDiff(path=path or "$", before=REDACTED, after=REDACTED,
                          change_type=_change_type(before, after), sensitive=True)
        )
        return
    if before == after:
        return
    if isinstance(before, dict) or isinstance(after, dict):
        keys: list[str] = []
        for k in list((before or {}).keys()) + list((after or {}).keys()):
            if k not in keys:
                keys.append(k)
        for k in keys:
            _emit_leaves(
                (before or {}).get(k) if isinstance(before, dict) else None,
                (after or {}).get(k) if isinstance(after, dict) else None,
                _mask_for(bmask, k), _mask_for(amask, k),
                f"{path}.{k}" if path else str(k), out,
            )
        return
    if isinstance(before, list) or isinstance(after, list):
        b = before if isinstance(before, list) else []
        a = after if isinstance(after, list) else []
        for i in range(max(len(b), len(a))):
            _emit_leaves(
                b[i] if i < len(b) else None,
                a[i] if i < len(a) else None,
                _mask_for(bmask, i), _mask_for(amask, i),
                f"{path}[{i}]", out,
            )
        return
    out.append(
        AttributeDiff(path=path or "$", before=before, after=after,
                      change_type=_change_type(before, after), sensitive=False)
    )


def _change_type(before: Any, after: Any) -> ChangeType:
    if before is None and after is not None:
        return ChangeType.ADDED
    if before is not None and after is None:
        return ChangeType.REMOVED
    return ChangeType.MODIFIED
