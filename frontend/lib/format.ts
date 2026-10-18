// Presentation helpers: turn machine-shaped drift data into sentences.
import type { AttributeDiff, DriftEvent } from "./types";

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Collect every scalar leaf under a value, e.g. find "0.0.0.0/0" in a rule. */
function flattenLeaves(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap(flattenLeaves);
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).flatMap(flattenLeaves);
  }
  return [String(v)];
}

const PORT_NAMES: Record<number, string> = {
  22: "SSH (port 22)", 3389: "RDP (port 3389)", 3306: "MySQL (port 3306)",
  5432: "PostgreSQL (port 5432)", 80: "HTTP (port 80)", 443: "HTTPS (port 443)",
};

/**
 * Generate one honest, plain-English sentence describing a drift event.
 * Derived from real diff data — never invented. Falls back to a neutral
 * description when no known pattern matches.
 */
export function plainSummary(event: DriftEvent): string {
  const diffs = event.attribute_diffs;
  const added = diffs.filter((d) => d.change_type === "added");
  const removed = diffs.filter((d) => d.change_type === "removed");
  const modified = diffs.filter((d) => d.change_type === "modified");

  // Security-group ingress opened to the world — the headline scenario.
  // Covers both added rules and modified rules (leaf diffs put the CIDR and
  // the port in separate entries, so scan all non-removed ingress values).
  const isSG = event.resource_type === "aws_security_group";
  if (isSG) {
    const ingressValues = diffs
      .filter((d) => d.change_type !== "removed" && /ingress/.test(d.path))
      .flatMap((d) => flattenLeaves(d.after));
    const isPublic = ingressValues.some(
      (l) => l === "0.0.0.0/0" || l === "::/0",
    );
    const port = ingressValues
      .map((l) => Number(l))
      .find((n) => Number.isInteger(n) && n > 0 && n < 65536);
    if (isPublic) {
      const svc = port ? PORT_NAMES[port] ?? `port ${port}` : "traffic";
      return `Someone opened ${svc} inbound access to the entire internet on this security group.`;
    }
  }
  const newRules = added.filter((d) => /ingress/.test(d.path));

  if (isSG && newRules.length > 0) {
    return `A firewall rule was added to this security group outside of Terraform.`;
  }
  if (isSG && removed.filter((d) => /ingress|egress/.test(d.path)).length > 0) {
    return `A firewall rule was removed from this security group outside of Terraform.`;
  }
  if (event.resource_type.startsWith("aws_iam")) {
    return `IAM permissions or trust on ${event.resource_name} were changed outside of Terraform.`;
  }
  if (event.actions.includes("delete")) {
    return `This resource was deleted outside of Terraform.`;
  }
  const n = diffs.length;
  const verb =
    added.length === n ? "added" : removed.length === n ? "removed" : "changed";
  return `${n || "Some"} attribute${n === 1 ? "" : "s"} ${verb} on this resource outside of Terraform.`;
}

/** One-line descriptor for list views. */
export function listSummary(event: DriftEvent): string {
  const s = plainSummary(event);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}
