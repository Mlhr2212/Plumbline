"""DynamoDB-backed repositories.

Table layout (provisioned by terraform/plumbline):
  plumbline-drifts          PK id (S)   GSI fingerprint-index (fingerprint)
  plumbline-scans           PK id (S)
  plumbline-timeline        PK drift_id (S)  SK sort_key (S: iso_ts#type)
  plumbline-reconciliations PK id (S)   GSI drift-index (drift_event_id)

Serialization: pydantic ``model_dump(mode="json")`` -> DynamoDB-safe values
(floats become Decimal). Reads go through ``model_validate`` so schema
evolution stays in the domain layer.
"""
from __future__ import annotations

import base64
import json
from decimal import Decimal
from typing import Any, Optional

from boto3.dynamodb.conditions import Attr, Key

from app.domain.models import (
    DriftEvent, DriftStatus, ReconciliationProposal, Scan, TimelineEvent,
)

_ACTIVE = {DriftStatus.OPEN.value, DriftStatus.ACKNOWLEDGED.value,
           DriftStatus.REMEDIATION_REQUESTED.value, DriftStatus.RECONCILING.value}


def _to_ddb(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_ddb(v) for v in value]
    return value


def _from_ddb(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


def _encode_key(key: Optional[dict]) -> Optional[str]:
    if not key:
        return None
    return base64.b64encode(json.dumps(key, default=str).encode()).decode()


def _decode_key(cursor: Optional[str]) -> Optional[dict]:
    if not cursor:
        return None
    try:
        return json.loads(base64.b64decode(cursor).decode())
    except ValueError:
        return None


def _scan(table, model, filters, cursor, limit, sort_attr=None):
    expr = None
    for k, v in filters.items():
        if v is None:
            continue
        cond = Attr(k).eq(v.value if hasattr(v, "value") else v)
        expr = cond if expr is None else expr & cond

    if sort_attr:
        # Scan order is arbitrary, so ordering requires reading the full
        # filtered set and sorting in memory — same semantics as the
        # in-memory repositories. Tables are small (hundreds of items); a
        # time-keyed GSI would be needed to order at scale.
        kwargs: dict[str, Any] = {}
        if expr is not None:
            kwargs["FilterExpression"] = expr
        items = []
        while True:
            resp = table.scan(**kwargs)
            items.extend(model.model_validate(_from_ddb(i))
                         for i in resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        items.sort(key=lambda i: getattr(i, sort_attr), reverse=True)
        start = int(base64.b64decode(cursor).decode()) if cursor else 0
        chunk = items[start:start + limit]
        nxt = start + limit
        token = base64.b64encode(str(nxt).encode()).decode() \
            if nxt < len(items) else None
        return chunk, token

    kwargs = {"Limit": limit}
    if expr is not None:
        kwargs["FilterExpression"] = expr
    start_key = _decode_key(cursor)
    if start_key:
        kwargs["ExclusiveStartKey"] = start_key
    resp = table.scan(**kwargs)
    return [model.model_validate(_from_ddb(i)) for i in resp.get("Items", [])], \
        _encode_key(resp.get("LastEvaluatedKey"))


class DynamoDriftRepository:
    def __init__(self, table):
        self._t = table

    def save(self, event: DriftEvent) -> None:
        self._t.put_item(Item=_to_ddb(event.model_dump(mode="json")))

    def get(self, drift_id: str) -> Optional[DriftEvent]:
        r = self._t.get_item(Key={"id": drift_id})
        item = r.get("Item")
        return DriftEvent.model_validate(_from_ddb(item)) if item else None

    def find_by_fingerprint(self, fingerprint: str) -> Optional[DriftEvent]:
        resp = self._t.query(
            IndexName="fingerprint-index",
            KeyConditionExpression=Key("fingerprint").eq(fingerprint),
        )
        for item in resp.get("Items", []):
            e = DriftEvent.model_validate(_from_ddb(item))
            if e.status.value in _ACTIVE:
                return e
        return None

    def find_open_for_resource(self, environment: str, address: str) -> list[DriftEvent]:
        resp = self._t.scan(FilterExpression=(
            Attr("environment").eq(environment) &
            Attr("resource_address").eq(address) &
            Attr("status").is_in(list(_ACTIVE))))
        return [DriftEvent.model_validate(_from_ddb(i)) for i in resp.get("Items", [])]

    def list_open(self, environment: str) -> list[DriftEvent]:
        resp = self._t.scan(FilterExpression=(
            Attr("environment").eq(environment) & Attr("status").is_in(list(_ACTIVE))))
        return [DriftEvent.model_validate(_from_ddb(i)) for i in resp.get("Items", [])]

    def list(self, filters, cursor, limit):
        return _scan(self._t, DriftEvent, filters, cursor, limit,
                     sort_attr="detected_at")


class DynamoScanRepository:
    def __init__(self, table):
        self._t = table

    def save(self, scan: Scan) -> None:
        self._t.put_item(Item=_to_ddb(scan.model_dump(mode="json")))

    def get(self, scan_id: str) -> Optional[Scan]:
        r = self._t.get_item(Key={"id": scan_id})
        item = r.get("Item")
        return Scan.model_validate(_from_ddb(item)) if item else None

    def list(self, filters, cursor, limit):
        return _scan(self._t, Scan, filters, cursor, limit,
                     sort_attr="started_at")


class DynamoTimelineRepository:
    def __init__(self, table):
        self._t = table

    def append(self, events: list[TimelineEvent]) -> None:
        with self._t.batch_writer() as batch:
            for e in events:
                item = e.model_dump(mode="json")
                item["sort_key"] = f"{e.timestamp.isoformat()}#{e.type.value}#{id(e)}"
                batch.put_item(Item=_to_ddb(item))

    def list(self, drift_id: str) -> list[TimelineEvent]:
        resp = self._t.query(KeyConditionExpression=Key("drift_id").eq(drift_id))
        items = [TimelineEvent.model_validate(_from_ddb(i)) for i in resp.get("Items", [])]
        return sorted(items, key=lambda x: x.timestamp)


class DynamoReconciliationRepository:
    def __init__(self, table):
        self._t = table

    def save(self, proposal: ReconciliationProposal) -> None:
        self._t.put_item(Item=_to_ddb(proposal.model_dump(mode="json")))

    def get(self, proposal_id: str) -> Optional[ReconciliationProposal]:
        r = self._t.get_item(Key={"id": proposal_id})
        item = r.get("Item")
        return ReconciliationProposal.model_validate(_from_ddb(item)) if item else None

    def list_for_drift(self, drift_id: str) -> list[ReconciliationProposal]:
        resp = self._t.query(
            IndexName="drift-index",
            KeyConditionExpression=Key("drift_event_id").eq(drift_id))
        return [ReconciliationProposal.model_validate(_from_ddb(i))
                for i in resp.get("Items", [])]

    def list(self, filters, cursor, limit):
        return _scan(self._t, ReconciliationProposal, filters, cursor, limit,
                     sort_attr="created_at")
