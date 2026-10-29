"""Repository factory — selects the persistence backend from settings."""
from __future__ import annotations

from dataclasses import dataclass

from app.config.settings import Settings
from app.repositories import memory


@dataclass
class Repositories:
    drifts: object
    scans: object
    timeline: object
    reconciliations: object


def build_repositories(settings: Settings) -> Repositories:
    if settings.storage_backend == "sqlite":
        from app.repositories import sqlite
        return Repositories(
            drifts=sqlite.SqliteDriftRepository(settings.sqlite_path),
            scans=sqlite.SqliteScanRepository(settings.sqlite_path),
            timeline=sqlite.SqliteTimelineRepository(settings.sqlite_path),
            reconciliations=sqlite.SqliteReconciliationRepository(
                settings.sqlite_path),
        )
    if settings.storage_backend == "dynamodb":
        import boto3
        from app.repositories import dynamodb
        ddb = boto3.resource("dynamodb", region_name=settings.aws_region)
        return Repositories(
            drifts=dynamodb.DynamoDriftRepository(ddb.Table(settings.ddb_table_drifts)),
            scans=dynamodb.DynamoScanRepository(ddb.Table(settings.ddb_table_scans)),
            timeline=dynamodb.DynamoTimelineRepository(ddb.Table(settings.ddb_table_timeline)),
            reconciliations=dynamodb.DynamoReconciliationRepository(
                ddb.Table(settings.ddb_table_reconciliations)),
        )
    return Repositories(
        drifts=memory.MemoryDriftRepository(),
        scans=memory.MemoryScanRepository(),
        timeline=memory.MemoryTimelineRepository(),
        reconciliations=memory.MemoryReconciliationRepository(),
    )
