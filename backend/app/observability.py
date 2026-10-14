"""Structured logging + lightweight in-process metrics.

Correlation fields (scan_id, drift_event_id, resource_address, environment)
are attached via ``bind``. Metrics are simple counters/gauges suitable for a
portfolio deployment; a real deployment would export to CloudWatch/Prometheus.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

_METRICS: dict[str, float] = {
    "scans_total": 0,
    "scan_failures_total": 0,
    "drift_detected_total": 0,
    "drift_resolved_total": 0,
    "active_drift": 0,
    "auto_remediation_total": 0,
    "reconciliation_pr_total": 0,
    "drift_resolution_time_seconds": 0,
}


def incr(name: str, amount: float = 1.0) -> None:
    _METRICS[name] = _METRICS.get(name, 0) + amount


def set_gauge(name: str, value: float) -> None:
    _METRICS[name] = value


def snapshot() -> dict[str, float]:
    return dict(_METRICS)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("scan_id", "drift_event_id", "resource_address",
                    "environment", "correlation_id"):
            val = getattr(record, key, None)
            if val is not None:
                payload[key] = val
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
