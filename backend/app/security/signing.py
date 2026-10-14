"""HMAC request signing for the CI ingestion endpoint.

CI signs ``<timestamp>.<body>`` with a shared secret; PlumbLine verifies the
signature and rejects stale timestamps. This avoids long-lived bearer tokens
on GitHub runners while keeping the endpoint from accepting arbitrary plans.
"""
from __future__ import annotations

import hashlib
import hmac
import time

HEADER_SIGNATURE = "x-plumbline-signature"
HEADER_TIMESTAMP = "x-plumbline-timestamp"


def sign(secret: str, timestamp: int, body: bytes) -> str:
    msg = f"{timestamp}.".encode() + body
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify(secret: str, timestamp: str, signature: str, body: bytes,
           window_seconds: int = 300) -> bool:
    if not secret or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - ts) > window_seconds:
        return False
    expected = sign(secret, ts, body)
    return hmac.compare_digest(expected, signature)
