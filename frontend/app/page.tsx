import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { listSummary, relativeTime } from "@/lib/format";
import { Card, SeverityBadge, StatusPill } from "@/components/Badges";
import PageHeader from "@/components/PageHeader";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];
const ACTIVE_STATUSES = new Set([
  "OPEN",
  "ACKNOWLEDGED",
  "REMEDIATION_REQUESTED",
  "RECONCILING",
]);

export default async function OverviewPage() {
  const [overview, drifts] = await Promise.all([
    api.overview(),
    api.drifts({ limit: "50" }),
  ]);
  const open = drifts.items.filter((d) => ACTIVE_STATUSES.has(d.status));
  const healthy = overview.active_drift === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Drift detection for your Terraform-managed sandbox."
      />

      {/* Status banner — the 2-second answer */}
      <div
        className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${
          healthy
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        {healthy ? (
          <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
        ) : (
          <ShieldAlert size={20} className="shrink-0 text-red-600" />
        )}
        <div>
          <p
            className={`text-[14px] font-semibold ${
              healthy ? "text-emerald-800" : "text-red-800"
            }`}
          >
            {healthy
              ? "Infrastructure matches your Terraform configuration"
              : `${overview.active_drift} active drift event${overview.active_drift === 1 ? "" : "s"} need${overview.active_drift === 1 ? "s" : ""} attention`}
          </p>
          <p
            className={`text-[12px] ${
              healthy ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {overview.last_scan
              ? `Last scan ${relativeTime(overview.last_scan.completed_at)} — ${overview.last_scan.drift_detected} detected, ${overview.last_scan.drift_resolved} resolved`
              : "No scans recorded yet"}
          </p>
        </div>
        {!healthy && (
          <Link
            href="/drifts"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#17202b] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#2a3542]"
          >
            Review <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* Quiet stat row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "Active drift",
            value: overview.active_drift,
            tone: overview.active_drift > 0 ? "text-red-600" : "",
          },
          { label: "Total events", value: overview.total_drift_events },
          {
            label: "Resolved",
            value: overview.by_status["RESOLVED"] ?? 0,
          },
          {
            label: "Last scan",
            value: overview.last_scan
              ? relativeTime(overview.last_scan.completed_at)
              : "—",
          },
        ].map((s) => (
          <Card key={s.label}>
            <div className={`text-2xl font-semibold tracking-tight ${s.tone ?? ""}`}>
              {s.value}
            </div>
            <div className="mt-0.5 text-[12px] text-[#8a94a3]">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Severity mix */}
      <Card title="Severity mix">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-1">
          {SEVERITY_ORDER.filter((s) => overview.by_severity[s]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <SeverityBadge severity={s} />
              <span className="text-[13px] font-semibold text-[#5c6675]">
                ×{overview.by_severity[s]}
              </span>
            </div>
          ))}
          {Object.keys(overview.by_severity).length === 0 && (
            <span className="text-[13px] text-[#8a94a3]">
              Nothing recorded yet — run a scan to populate this.
            </span>
          )}
        </div>
      </Card>

      {/* Open incidents */}
      <Card
        title="Open incidents"
        action={
          <Link
            href="/drifts"
            className="text-[12px] font-medium text-[#2563eb] hover:underline"
          >
            View all
          </Link>
        }
      >
        {open.length === 0 ? (
          <p className="py-3 text-[13px] text-[#8a94a3]">
            No open drift. When something changes out-of-band, it will appear
            here with who did it and what fixing it looks like.
          </p>
        ) : (
          <ul className="-mx-5 divide-y divide-[#eef0f3]">
            {open.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/drifts/${d.id}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[#f8f9fb]"
                >
                  <SeverityBadge severity={d.severity} score={d.risk_score} />
                  <span className="mono min-w-0 flex-1 truncate text-[13px]">
                    {d.resource_address}
                  </span>
                  <span className="hidden max-w-[280px] truncate text-[12px] text-[#5c6675] md:block">
                    {listSummary(d)}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#8a94a3]">
                    {relativeTime(d.first_seen_at)}
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
