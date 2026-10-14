"""Request guards: payload size cap before parsing."""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config.settings import get_settings


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        limit = get_settings().ingest_max_plan_bytes
        length = request.headers.get("content-length")
        if length is not None:
            try:
                if int(length) > limit:
                    return JSONResponse({"detail": "request body too large"}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "invalid content-length"}, status_code=400)
        return await call_next(request)
