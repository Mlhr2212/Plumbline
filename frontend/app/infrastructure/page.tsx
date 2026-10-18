import Link from "next/link";
import { Layers } from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Section, severityDot } from "@/components/Badges";
import { EmptyState, ErrorState } from "@/components/States";

export const dynamic = "force-dynamic";

const ACTIVE = new Set([
  "OPEN",
  "ACKNOWLEDGED",
  "REMEDIATION_REQUESTED",
  "RECONCILING",
]);

export default async function InfrastructurePage() {
  const drifts = await api.drifts({ limit: "100" }).catch(() => null);
  if (!drifts) {
    return <ErrorState detail="Couldn't load resource data." />;
  }

  // Honest scope: this is what PlumbLine has *observed* through plans and
  // drift — not a complete account inventory.
  const byResource = new Map<
    string,
    { type: string; service: string; env: string; region: string; events: typeof drifts.items }
  >();
  for (const d of drifts.items) {
    const cur = byResource.get(d.resource_address) ?? {
      type: d.resource_type,
      service: d.aws_service,
      env: d.environment,
      region: d.region,
      events: [],
    };
    cur.events.push(d);
    byResource.set(d.resource_address, cur);
  }
  const resources = [...byResource.entries()].sort(
    (a, b) => b[1].events.length - a[1].events.length,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">
          Infrastructure
        </h1>
        <span className="text-[12px] text-faint">
          resources PlumbLine has observed through Terraform plans — not a
          full account inventory
        </span>
      </div>

      <Section padded={false}>
        {resources.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No resources observed yet"
            hint="Resources appear here once a plan reports drift on them."
          />
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-widest text-faint">
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Env / Region</th>
                <th className="px-3 py-2 text-right">Drift events</th>
                <th className="px-3 py-2">Worst severity</th>
                <th className="px-3 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resources.map(([addr, r]) => {
                const worst = r.events.reduce(
                  (w, d) =>
                    ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].indexOf(
                      d.severity,
                    ) <
                    ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].indexOf(w)
                      ? d.severity
                      : w,
                  "INFO" as (typeof r.events)[0]["severity"],
                );
                const last = r.events.reduce((a, b) =>
                  new Date(a.last_seen_at) > new Date(b.last_seen_at) ? a : b,
                );
                const hasActive = r.events.some((d) => ACTIVE.has(d.status));
                return (
                  <tr key={addr} className="transition-colors hover:bg-hover">
                    <td className="px-3 py-2">
                      <Link
                        href={`/drifts/${last.id}`}
                        className="mono text-[12px] text-text hover:text-accent"
                      >
                        {addr}
                      </Link>
                    </td>
                    <td className="mono px-3 py-2 text-[11px] text-muted">
                      {r.type}
                    </td>
                    <td className="mono px-3 py-2 text-[11px] text-muted">
                      {r.service}
                    </td>
                    <td className="mono px-3 py-2 text-[11px] text-faint">
                      {r.env} / {r.region}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-text">
                      {r.events.length}
                      {hasActive && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-critical align-middle" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5 text-[11px] capitalize text-muted">
                        <span
                          className={`h-2 w-2 rounded-full ${severityDot(worst)}`}
                        />
                        {worst.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-faint">
                      {relativeTime(last.last_seen_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
