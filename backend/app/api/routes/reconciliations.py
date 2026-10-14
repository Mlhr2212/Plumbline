from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_repositories
from app.config.settings import Settings, get_settings
from app.domain.models import Page
from app.repositories.factory import Repositories

router = APIRouter(prefix="/api/v1/reconciliations", tags=["reconciliations"])


@router.get("", response_model=Page)
def list_reconciliations(
    status: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1),
    repos: Repositories = Depends(get_repositories),
    settings: Settings = Depends(get_settings),
) -> Page:
    items, nxt = repos.reconciliations.list(
        {"status": status}, cursor, min(limit, settings.max_page_size))
    return Page(items=items, next_cursor=nxt)
