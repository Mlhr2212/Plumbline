import Link from "next/link";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Card, SeverityBadge } from "@/components/Badges";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

export default async function OverviewPage() {
  const [overview, drifts] = await Promise.all([
    api.overview(),
    api.drifts({ limit: "50" }),
  ]);
  const open = drifts.items.filter(
    (d) =>
      d.status === "OPEN" ||
      d.status === "ACKNOWLEDGED" ||
      d.status === "REMEDIATION_REQUESTED" ||
      d.status === "RECONCILING",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-[#8b98a9]">
          Is anything wrong? This page answers that in two seconds.
        </p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="text-center">
          <div
            className={`text-3xl font-bold ${
              overview.active_drift > 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {overview.active_drift}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-[#8b98a9]">
            Active drift
          </div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold">
            {overview.total_drift_events}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-[#8b98a9]">
            Total events
          </div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold">
            {overview.by_status["RESOLVED"] ?? 0}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-[#8b98a9]">
            Resolved
          </div>
        </Card>
        <Card className="text-center">
          <div className="text-lg font-semibold">
            {overview.last_scan ? (
              <span
                className={
                  overview.last_scan.status === "COMPLETED"
                    ? "text-emerald-400"
                    : overview.last_scan.status === "FAILED"
                      ? "text-red-400"
                      : "text-amber-400"
                }
              >
                {overview.last_scan.status}
              </span>
            ) : (
              "—"
            )}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-[#8b98a9]">
            Last scan{" "}
            {overview.last_scan?.completed_at
              ? `· ${relativeTime(overview.last_scan.completed_at)}`
              : ""}
          </div>
        </Card>
      </div>

      {/* Severity breakdown */}
      <Card title="Drift by severity">
        <div className="flex flex-wrap items-center gap-3">
          {SEVERITY_ORDER.filter((s) => overview.by_severity[s]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <SeverityBadge severity={s} />
              <span className="text-lg font-semibold">
                ×{overview.by_severity[s]}
              </span>
            </div>
          ))}
          {Object.keys(overview.by_severity).length === 0 && (
            <span className="text-sm text-[#8b98a9]">
              No drift events recorded yet.
            </span>
          )}
        </div>
      </Card>

      {/* Open incidents */}
      <Card title="Open incidents">
        {open.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#8b98a9]">
            No open drift — infrastructure matches Terraform.{" "}
            <span className="text-emerald-400">All clear.</span>
          </p>
        ) : (
          <ul className="divide-y divide-[#232c38]">
            {open.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/drifts/${d.id}`}
                  className="flex items-center gap-4 py-3 hover:bg-[#161d27] -mx-4 px-4 transition-colors"
                >
                  <SeverityBadge severity={d.severity} score={d.risk_score} />
                  <span className="mono text-sm">{d.resource_address}</span>
                  <span className="ml-auto text-xs text-[#8b98a9]">
                    {relativeTime(d.first_seen_at)} · {d.scan_count} scan
                    {d.scan_count === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
