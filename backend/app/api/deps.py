"""FastAPI dependency wiring + auth dependencies."""
from __future__ import annotations

from fastapi import Depends, Request

from app.config.settings import Settings, get_settings
from app.domain.models import ApiError
from app.repositories.factory import Repositories, build_repositories
from app.security import signing
from app.services.attribution.enricher import CloudTrailEnricher
from app.services.drift.pipeline import IngestionPipeline

_repos: Repositories | None = None


def get_repositories(settings: Settings = Depends(get_settings)) -> Repositories:
    global _repos
    if _repos is None:
        _repos = build_repositories(settings)
    return _repos


def reset_repositories() -> None:
    """Test hook: drop the singleton so each test gets a clean store."""
    global _repos
    _repos = None


def get_enricher(settings: Settings = Depends(get_settings)) -> CloudTrailEnricher | None:
    if not settings.attribution_enabled:
        return None
    lookup = None
    # Any real deployment — or a self-hosted user with ambient AWS creds —
    # gets CloudTrail lookups; lookup failures degrade to "unknown".
    if settings.storage_backend != "memory":
        from app.integrations.aws.cloudtrail import CloudTrailLookupClient
        lookup = CloudTrailLookupClient(settings.aws_region)
    return CloudTrailEnricher(lookup, settings.attribution_lookback_hours)


def get_pipeline(
    settings: Settings = Depends(get_settings),
    repos: Repositories = Depends(get_repositories),
    enricher: CloudTrailEnricher | None = Depends(get_enricher),
) -> IngestionPipeline:
    return IngestionPipeline(settings, repos, enricher)


async def require_ingest_auth(request: Request,
                              settings: Settings = Depends(get_settings)) -> None:
    """HMAC-signature auth for plan ingestion.

    Local-dev escape hatch: if no secret is configured AND a local backend
    (memory/sqlite) is in use, requests are allowed — nothing leaves the
    machine, so there is nothing real at stake.
    """
    if not settings.ingest_hmac_secret:
        if settings.storage_backend in ("memory", "sqlite"):
            return
        raise ApiError(503, "ingestion endpoint is not configured (missing HMAC secret)")
    body = await request.body()
    ok = signing.verify(
        settings.ingest_hmac_secret,
        request.headers.get(signing.HEADER_TIMESTAMP, ""),
        request.headers.get(signing.HEADER_SIGNATURE, ""),
        body,
        settings.ingest_signature_window_seconds,
    )
    if not ok:
        raise ApiError(401, "invalid or expired ingestion signature")


def require_api_key(request: Request,
                    settings: Settings = Depends(get_settings)) -> None:
    """API-key auth for mutation endpoints when a key is configured."""
    if not settings.api_key:
        if settings.storage_backend in ("memory", "sqlite"):
            return
        raise ApiError(503, "mutation endpoints require PLUMBLINE_API_KEY")
    if request.headers.get("x-api-key") != settings.api_key:
        raise ApiError(401, "invalid API key")
