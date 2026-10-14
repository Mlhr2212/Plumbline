"""Aggregate overview for the frontend dashboard."""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_repositories
from app.config.settings import Settings, get_settings
from app.domain.models import DriftStatus
from app.repositories.factory import Repositories

router = APIRouter(prefix="/api/v1", tags=["overview"])

_ACTIVE = {DriftStatus.OPEN.value, DriftStatus.ACKNOWLEDGED.value,
           DriftStatus.REMEDIATION_REQUESTED.value, DriftStatus.RECONCILING.value}


@router.get("/overview")
def overview(environment: Optional[str] = Query(None),
             repos: Repositories = Depends(get_repositories),
             settings: Settings = Depends(get_settings)) -> dict:
    drifts, _ = repos.drifts.list({"environment": environment}, None,
                                  settings.max_page_size)
    scans, _ = repos.scans.list({"environment": environment}, None, 1)

    by_severity = Counter(d.severity.value for d in drifts)
    by_status = Counter(d.status.value for d in drifts)
    active = sum(1 for d in drifts if d.status.value in _ACTIVE)

    last = scans[0] if scans else None
    return {
        "environment": environment,
        "active_drift": active,
        "total_drift_events": len(drifts),
        "by_severity": dict(by_severity),
        "by_status": dict(by_status),
        "last_scan": {
            "id": last.id, "status": last.status.value,
            "completed_at": last.completed_at,
            "drift_detected": last.drift_detected,
            "drift_resolved": last.drift_resolved,
        } if last else None,
    }
