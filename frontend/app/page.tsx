import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { listSummary, relativeTime } from "@/lib/format";
import { Section, SeverityBadge, StatusPill, severityDot } from "@/components/Badges";
import { EmptyState } from "@/components/States";
import type { DriftEvent, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const ACTIVE_STATUSES = new Set([
  "OPEN",
  "ACKNOWLEDGED",
  "REMEDIATION_REQUESTED",
  "RECONCILING",
]);
const SEV_WEIGHT: Record<Severity, number> = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 8,
  LOW: 3,
  INFO: 1,
};

export default async function OverviewPage() {
  const [overview, drifts, scans] = await Promise.all([
    api.overview().catch(() => null),
    api.drifts({ limit: "100" }).catch(() => null),
    api.scans().catch(() => null),
  ]);
  if (!overview || !drifts) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Can't reach the PlumbLine API"
        hint="The backend didn't respond. Check that the service is up, then refresh."
      />
    );
  }

  const active = drifts.items.filter((d) => ACTIVE_STATUSES.has(d.status));
  const resolved = drifts.items.filter((d) => d.status === "RESOLVED");
  const top: DriftEvent | undefined = [...active].sort(
    (a, b) => b.risk_score - a.risk_score,
  )[0];
  const healthy = active.length === 0;
  const critHigh = active.filter(
    (d) => d.severity === "CRITICAL" || d.severity === "HIGH",
  ).length;

  // PlumbLine derived health — weighted penalty per active severity.
  const penalty = active.reduce((s, d) => s + SEV_WEIGHT[d.severity], 0);
  const health = Math.max(0, 100 - penalty);
  const recentScans = (scans?.items ?? []).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* ── Top line: environment + headline status ─────────── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[15px] font-semibold tracking-tight">
          {overview.environment ?? "sandbox"}
        </h1>
        <span className="text-[12px] text-faint">infrastructure health</span>
        <div className="ml-auto flex items-center gap-4 text-[12px] text-muted">
          <span>
            Active drift:{" "}
            <span className={active.length ? "font-medium text-critical" : "font-medium text-text"}>
              {active.length}
            </span>
          </span>
          {critHigh > 0 && (
            <span className="text-critical">
              High+Critical: {critHigh}
            </span>
          )}
          <span className="text-faint">
            last scan {relativeTime(overview.last_scan?.completed_at)}
          </span>
        </div>
      </div>

      {/* ── Needs attention — the most important unresolved drift ── */}
      {top ? (
        <Section className="border-l-2 border-l-critical">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <ShieldAlert size={15} className="shrink-0 text-critical" />
                <span className="text-[11px] font-medium uppercase tracking-widest text-critical">
                  Needs attention
                </span>
                <SeverityBadge severity={top.severity} score={top.risk_score} />
              </div>
              <p className="mono mt-2 truncate text-[15px] font-medium text-text">
                {top.resource_address}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {listSummary(top)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
                <span>detected {relativeTime(top.first_seen_at)}</span>
                {top.cloudtrail_attribution?.actor && (
                  <span>
                    likely actor{" "}
                    <span className="mono text-muted">
                      {top.cloudtrail_attribution.actor.split("/").pop()}
                    </span>
                    {" · "}
                    {Math.round(
                      (top.cloudtrail_attribution.confidence ?? 0) * 100,
                    )}
                    % confidence
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/drifts/${top.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90"
            >
              Investigate <ArrowRight size={13} />
            </Link>
          </div>
          {active.length > 1 && (
            <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-faint">
              + {active.length - 1} more unresolved —{" "}
              <Link href="/drifts" className="text-accent hover:underline">
                open the explorer
              </Link>
            </p>
          )}
        </Section>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-healthy/25 bg-healthy/5 px-4 py-3.5">
          <CheckCircle2 size={16} className="shrink-0 text-healthy" />
          <p className="text-[13px] text-text">
            Infrastructure matches your Terraform configuration
            <span className="ml-2 text-[12px] text-muted">
              last scan {relativeTime(overview.last_scan?.completed_at)} —{" "}
              {overview.last_scan?.drift_detected ?? 0} detected
            </span>
          </p>
        </div>
      )}

      {/* ── Drift health — derived, restrained, labeled ─────── */}
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Section title="Drift health">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[28px] font-semibold tabular-nums tracking-tight ${
                health >= 90
                  ? "text-healthy"
                  : health >= 70
                    ? "text-medium"
                    : "text-critical"
              }`}
            >
              {health}
            </span>
            <span className="text-[12px] text-faint">/ 100</span>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-elevated"
            role="meter"
            aria-valuenow={health}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Derived drift health"
          >
            <div
              className={`h-full rounded-full ${
                health >= 90
                  ? "bg-healthy"
                  : health >= 70
                    ? "bg-medium"
                    : "bg-critical"
              }`}
              style={{ width: `${health}%` }}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            PlumbLine derived score — weighted penalty per active drift
            (critical 40, high 20, medium 8, low 3, info 1). Not an AWS metric.
          </p>
        </Section>

        {/* Severity mix */}
        <Section title="Active drift by severity">
          {active.length === 0 ? (
            <p className="py-1 text-[12px] text-faint">
              Nothing active — all detected drift has been resolved.
            </p>
          ) : (
            <div className="space-y-2">
              {SEVERITY_ORDER.filter((s) =>
                active.some((d) => d.severity === s),
              ).map((s) => {
                const n = active.filter((d) => d.severity === s).length;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${severityDot(s)}`}
                      aria-hidden
                    />
                    <span className="w-[70px] text-[12px] capitalize text-muted">
                      {s.toLowerCase()}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                      <div
                        className={`h-full ${severityDot(s)}`}
                        style={{
                          width: `${Math.max(8, (n / active.length) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-[12px] tabular-nums text-text">
                      {n}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* ── Secondary: recent scans + recently resolved ─────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Recent scans"
          action={
            <Link
              href="/scans"
              className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-text"
            >
              all scans <ArrowUpRight size={11} />
            </Link>
          }
          padded={false}
        >
          {recentScans.length === 0 ? (
            <EmptyState title="No scans recorded yet" />
          ) : (
            <ul className="divide-y divide-border">
              {recentScans.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/scans/${s.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.status === "COMPLETED"
                          ? "bg-healthy"
                          : s.status === "FAILED"
                            ? "bg-critical"
                            : "bg-medium"
                      }`}
                      aria-hidden
                    />
                    <span className="mono flex-1 truncate text-[12px] text-text">
                      {s.id.slice(0, 8)}
                    </span>
                    <span className="text-[11px] text-faint">
                      {s.drift_detected} detected · {s.drift_resolved} resolved
                    </span>
                    <span className="w-[64px] text-right text-[11px] text-faint">
                      {relativeTime(s.started_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Recently resolved"
          action={
            <Link
              href="/drifts?status=RESOLVED"
              className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-text"
            >
              all resolved <ArrowUpRight size={11} />
            </Link>
          }
          padded={false}
        >
          {resolved.length === 0 ? (
            <EmptyState
              title="Nothing resolved yet"
              hint="Resolved incidents land here once Terraform restores the desired state."
            />
          ) : (
            <ul className="divide-y divide-border">
              {resolved.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/drifts/${d.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
                  >
                    <CheckCircle2 size={13} className="shrink-0 text-resolved" />
                    <span className="mono flex-1 truncate text-[12px] text-text">
                      {d.resource_address}
                    </span>
                    <StatusPill status={d.status} />
                    <span className="w-[64px] text-right text-[11px] text-faint">
                      {relativeTime(d.resolved_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
