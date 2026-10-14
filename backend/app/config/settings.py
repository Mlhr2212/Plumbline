"""PlumbLine runtime configuration.

All values are sourced from environment variables (prefix ``PLUMBLINE_``).
No credentials are ever stored in source code; AWS access is expected to come
from the ambient identity chain (instance role, OIDC-assumed role, or
``aws sso`` locally).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PLUMBLINE_", env_file=".env", extra="ignore")

    # --- general ---
    environment: str = "dev"
    log_level: str = "INFO"

    # --- persistence ---
    # "memory" for local dev/tests, "dynamodb" for AWS deployments.
    storage_backend: str = "memory"
    aws_region: str = "us-east-1"
    ddb_table_drifts: str = "plumbline-drifts"
    ddb_table_scans: str = "plumbline-scans"
    ddb_table_timeline: str = "plumbline-timeline"
    ddb_table_reconciliations: str = "plumbline-reconciliations"

    # --- ingestion auth ---
    # Shared HMAC secret used by CI to sign plan uploads. Empty disables auth
    # ONLY when storage_backend == "memory" (local dev convenience).
    ingest_hmac_secret: str = ""
    ingest_max_plan_bytes: int = 20 * 1024 * 1024  # 20 MiB hard cap
    ingest_signature_window_seconds: int = 300

    # --- mutation auth ---
    # Optional API key for POST /reconcile|accept|ignore. Empty = open in
    # local dev; must be set in deployed environments.
    api_key: str = ""

    # --- remediation ---
    auto_remediation_enabled: bool = False  # global kill switch, OFF by default
    auto_remediation_allow_production: bool = False
    attribution_enabled: bool = True
    attribution_lookback_hours: int = 72

    # --- GitHub reconciliation ---
    github_token: str = ""  # injected via env/secret store, never committed
    github_repository: str = ""  # "org/repo"
    github_base_branch: str = "main"

    # --- IaC engine ---
    iac_engine: str = "terraform"  # "terraform" or "tofu" (OpenTofu untested)

    # --- supported terraform JSON ---
    supported_plan_format_major: int = 1

    max_page_size: int = 100


@lru_cache
def get_settings() -> Settings:
    return Settings()
