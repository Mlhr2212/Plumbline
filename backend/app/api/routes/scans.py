from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_pipeline, get_repositories, require_ingest_auth
from app.config.settings import Settings, get_settings
from app.domain.models import ApiError, Page, Scan, ScanIngestRequest
from app.repositories.factory import Repositories
from app.services.drift.pipeline import IngestionPipeline

router = APIRouter(prefix="/api/v1/scans", tags=["scans"])


@router.post("/ingest", response_model=Scan)
def ingest_scan(
    payload: ScanIngestRequest,
    pipeline: IngestionPipeline = Depends(get_pipeline),
    _: None = Depends(require_ingest_auth),
) -> Scan:
    """CI ingestion endpoint — HMAC-signed plan upload from GitHub Actions."""
    return pipeline.ingest(payload)


# POST /scans is intentionally equivalent to /scans/ingest; both are the
# authenticated CI entrypoint.
@router.post("", response_model=Scan)
def create_scan(payload: ScanIngestRequest,
                pipeline: IngestionPipeline = Depends(get_pipeline),
                _: None = Depends(require_ingest_auth)) -> Scan:
    return pipeline.ingest(payload)


@router.get("", response_model=Page)
def list_scans(
    environment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1),
    repos: Repositories = Depends(get_repositories),
    settings: Settings = Depends(get_settings),
) -> Page:
    items, nxt = repos.scans.list(
        {"environment": environment, "status": status},
        cursor, min(limit, settings.max_page_size))
    return Page(items=items, next_cursor=nxt)


@router.get("/{scan_id}", response_model=Scan)
def get_scan(scan_id: str, repos: Repositories = Depends(get_repositories)) -> Scan:
    scan = repos.scans.get(scan_id)
    if scan is None:
        raise ApiError(404, "scan not found")
    return scan
