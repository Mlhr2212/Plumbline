"""PlumbLine backend application entrypoint."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import observability
from app.api.middleware import MaxBodySizeMiddleware
from app.api.routes import drifts, health, overview, reconciliations, scans
from app.config.settings import get_settings
from app.domain.models import ApiError


def create_app() -> FastAPI:
    settings = get_settings()
    observability.configure_logging(settings.log_level)
    log = logging.getLogger("plumbline")

    app = FastAPI(
        title="PlumbLine API",
        version="0.1.0",
        description="Deterministic Terraform/AWS drift detection, risk "
                    "analysis, and reconciliation.",
    )
    app.add_middleware(MaxBodySizeMiddleware)

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    app.include_router(health.router)
    app.include_router(scans.router)
    app.include_router(drifts.router)
    app.include_router(overview.router)
    app.include_router(reconciliations.router)

    log.info("plumbline backend ready",
             extra={"environment": settings.environment})
    return app


app = create_app()
