from fastapi import APIRouter

from app import observability

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "plumbline-backend", "version": "0.1.0"}


@router.get("/metrics")
def metrics() -> dict:
    return observability.snapshot()
