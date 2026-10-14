import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config.settings import Settings
from app.repositories.factory import Repositories, build_repositories
from app.services.drift.pipeline import IngestionPipeline

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def settings() -> Settings:
    return Settings(storage_backend="memory", attribution_enabled=False)


@pytest.fixture
def repos(settings) -> Repositories:
    return build_repositories(settings)


@pytest.fixture
def pipeline(settings, repos) -> IngestionPipeline:
    return IngestionPipeline(settings, repos)


def ingest_payload(plan: dict, environment: str = "dev", exit_code: int = 2) -> dict:
    return {
        "environment": environment,
        "repository": "org/plumbline",
        "commit_sha": "abc1234",
        "workspace": "default",
        "regions": ["us-east-1"],
        "account_id": "123456789012",
        "terraform_exit_code": exit_code,
        "plan_json": plan,
    }
