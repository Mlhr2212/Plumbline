"""Parser for ``terraform show -json <plan>`` output.

The plan JSON is the authoritative machine-readable source of drift evidence.
Key invariants enforced here:

* ``resource_drift`` (out-of-band change observed during refresh) is kept
  strictly separate from ``resource_changes`` (planned config reconciliation).
  A plan that only contains ``resource_changes`` produced **no** drift.
* ``format_version`` major versions other than the supported one are rejected
  cleanly; unknown minor-version fields are ignored.
* Sensitive values are never inspected by the parser — the ``*_sensitive``
  masks are carried through so downstream stages can redact.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from app.domain.models import UnsupportedFormatError

SUPPORTED_MAJOR_VERSION = 1


class Change(BaseModel):
    actions: list[str] = Field(default_factory=list)
    before: Any = None
    after: Any = None
    before_sensitive: Any = None
    after_sensitive: Any = None
    action_reason: Optional[str] = None


class PlanResource(BaseModel):
    """A single entry in resource_drift or resource_changes."""
    address: str
    mode: str = "managed"
    type: str = ""
    name: str = ""
    provider_name: str = ""
    index: Any = None
    deposed: Optional[str] = None
    change: Change = Field(default_factory=Change)

    @property
    def is_managed(self) -> bool:
        return self.mode == "managed"

    @property
    def provider_short(self) -> str:
        # "registry.terraform.io/hashicorp/aws" -> "aws"
        return self.provider_name.rsplit("/", 1)[-1] if self.provider_name else ""


class TerraformPlan(BaseModel):
    format_version: Optional[str] = None
    terraform_version: Optional[str] = None
    resource_drift: list[PlanResource] = Field(default_factory=list)
    resource_changes: list[PlanResource] = Field(default_factory=list)
    configuration: dict[str, Any] = Field(default_factory=dict)
    prior_state: dict[str, Any] = Field(default_factory=dict)
    relevant_attributes: list[dict[str, Any]] = Field(default_factory=list)
    output_changes: dict[str, Any] = Field(default_factory=dict)

    def change_for(self, address: str) -> Optional[PlanResource]:
        """Return the planned resource_change entry for an address, if any."""
        for rc in self.resource_changes:
            if rc.address == address:
                return rc
        return None

    @property
    def has_drift(self) -> bool:
        return any(r.is_managed and r.change.actions != ["no-op"] for r in self.resource_drift)


def _parse_version(v: Any) -> str:
    if v is None:
        raise UnsupportedFormatError("plan JSON is missing format_version")
    return str(v)


def _check_supported(format_version: str, supported_major: int = SUPPORTED_MAJOR_VERSION) -> None:
    try:
        major = int(str(format_version).split(".", 1)[0])
    except ValueError:
        raise UnsupportedFormatError(f"unparseable plan format_version: {format_version!r}")
    if major != supported_major:
        raise UnsupportedFormatError(
            f"unsupported plan format_version {format_version!r}: "
            f"PlumbLine supports major version {supported_major}.x"
        )


def parse_plan(plan_json: dict[str, Any], supported_major: int = SUPPORTED_MAJOR_VERSION) -> TerraformPlan:
    """Parse raw ``terraform show -json`` output into a TerraformPlan.

    Raises UnsupportedFormatError (HTTP 422) for missing/unsupported format
    versions. Unknown fields are ignored for forward compatibility.
    """
    if not isinstance(plan_json, dict):
        raise UnsupportedFormatError("plan payload is not a JSON object")

    format_version = _parse_version(plan_json.get("format_version"))
    _check_supported(format_version, supported_major)

    def resources(key: str) -> list[PlanResource]:
        out = []
        for raw in plan_json.get(key) or []:
            out.append(PlanResource.model_validate(raw, strict=False))
        return out

    return TerraformPlan(
        format_version=format_version,
        terraform_version=plan_json.get("terraform_version"),
        resource_drift=resources("resource_drift"),
        resource_changes=resources("resource_changes"),
        configuration=plan_json.get("configuration") or {},
        prior_state=plan_json.get("prior_state") or {},
        relevant_attributes=plan_json.get("relevant_attributes") or [],
        output_changes=plan_json.get("output_changes") or {},
    )
