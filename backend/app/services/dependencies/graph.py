"""Dependency / blast-radius analysis.

Deliberately scoped: edges come ONLY from what the Terraform configuration
declares — expression ``references`` and explicit ``depends_on``. This is not
a live AWS dependency graph; inferred edges are labeled INFERRED and never
presented as guaranteed.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.domain.models import DependencyEdge, DependencyEvidence, DependencySummary
from app.parsers.terraform_plan import TerraformPlan

# Reference prefixes that never resolve to managed resources.
_SKIP_PREFIXES = ("var.", "local.", "each.", "self.", "count.", "path.", "terraform.")


@dataclass
class ConfigResource:
    address: str
    type: str
    references: list[tuple[str, str]] = field(default_factory=list)  # (ref, via_attr)
    depends_on: list[str] = field(default_factory=list)


def _walk_module(module: dict[str, Any], out: list[ConfigResource]) -> None:
    for res in module.get("resources") or []:
        refs: list[tuple[str, str]] = []
        for attr, expr in (res.get("expressions") or {}).items():
            if not isinstance(expr, dict):
                continue
            for ref in expr.get("references") or []:
                if isinstance(ref, str) and not ref.startswith(_SKIP_PREFIXES):
                    refs.append((ref, attr))
        out.append(ConfigResource(
            address=res.get("address", ""),
            type=res.get("type", ""),
            references=refs,
            depends_on=list(res.get("depends_on") or []),
        ))
    for call in (module.get("module_calls") or {}).values():
        child = call.get("module")
        if isinstance(child, dict):
            _walk_module(child, out)


def _collect_addresses(plan: TerraformPlan) -> dict[str, str]:
    """address -> resource_type, from every plan section that has them."""
    known: dict[str, str] = {}
    for res in plan.resource_drift + plan.resource_changes:
        known[res.address] = res.type
    return known


def _resolve(ref: str, known: set[str]) -> Optional[str]:
    """Resolve a reference expression to a managed resource address.

    Longest-prefix match handles attribute access ("aws_sg.web.id") and
    instance keys ("aws_instance.web[0].id").
    """
    candidates = [a for a in known
                  if ref == a or ref.startswith(a + ".") or ref.startswith(a + "[")]
    if not candidates:
        return None
    return max(candidates, key=len)


def build_dependency_graph(plan: TerraformPlan) -> dict[str, list[DependencyEdge]]:
    """Return adjacency: drifted_address -> [edges to dependents]."""
    root = plan.configuration.get("root_module") or {}
    resources: list[ConfigResource] = []
    _walk_module(root, resources)

    known = _collect_addresses(plan)
    known.update({r.address: r.type for r in resources})

    graph: dict[str, list[DependencyEdge]] = {}
    for res in resources:
        for ref, via in res.references:
            target = _resolve(ref, set(known))
            if target and target != res.address:
                graph.setdefault(target, []).append(DependencyEdge(
                    dependent=res.address, dependency=target,
                    evidence=DependencyEvidence.TERRAFORM_REFERENCE, via=via,
                ))
        for dep in res.depends_on:
            target = _resolve(dep, set(known)) or dep
            if target != res.address:
                graph.setdefault(target, []).append(DependencyEdge(
                    dependent=res.address, dependency=target,
                    evidence=DependencyEvidence.EXPLICIT, via="depends_on",
                ))
    return graph


_CRITICAL_TYPES = {
    "aws_db_instance", "aws_rds_cluster", "aws_eks_cluster",
    "aws_elasticache_cluster", "aws_lb", "aws_alb", "aws_iam_role",
    "aws_kms_key", "aws_vpc",
}


def blast_radius(
    drifted_address: str,
    plan: TerraformPlan,
    max_depth: int = 6,
) -> DependencySummary:
    """BFS over dependents of the drifted resource."""
    graph = build_dependency_graph(plan)
    known = _collect_addresses(plan)

    direct = sorted({e.dependent for e in graph.get(drifted_address, [])})
    visited: set[str] = set(direct)
    frontier = list(direct)
    depth = 0
    edges: list[DependencyEdge] = list(graph.get(drifted_address, []))

    while frontier and depth < max_depth:
        depth += 1
        nxt: list[str] = []
        for node in frontier:
            for e in graph.get(node, []):
                edges.append(e)
                if e.dependent not in visited:
                    visited.add(e.dependent)
                    nxt.append(e.dependent)
        frontier = nxt

    transitive = sorted(visited - set(direct))
    critical = sorted(a for a in visited if known.get(a) in _CRITICAL_TYPES)
    return DependencySummary(
        direct_dependents=direct,
        transitive_dependents=transitive,
        depth=depth,
        affected_critical_resources=critical,
        edges=edges,
    )
