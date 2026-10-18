import Link from "next/link";
import { api } from "@/lib/api";
import { listSummary, relativeTime } from "@/lib/format";
import { SeverityBadge, StatusPill } from "@/components/Badges";
import PageHeader from "@/components/PageHeader";
import type { DriftStatus, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEVERITIES: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];
const STATUSES: DriftStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "ACCEPTED",
  "IGNORED",
  "SUPERSEDED",
];

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active
          ? "bg-[#17202b] text-white"
          : "text-[#5c6675] hover:bg-[#eef0f3] hover:text-[#17202b]"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function DriftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const sev = params.severity;
  const status = params.status;
  const page = await api.drifts({ severity: sev, status, limit: "100" });

  const hrefFor = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { severity: sev, status, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/drifts${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Drift events"
        description="Every out-of-band change Terraform observed, as an incident."
      />

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-1">
          <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-[#8a94a3]">
            Severity
          </span>
          <FilterChip label="All" active={!sev} href={hrefFor({ severity: undefined })} />
          {SEVERITIES.map((s) => (
            <FilterChip
              key={s}
              label={s.charAt(0) + s.slice(1).toLowerCase()}
              active={sev === s}
              href={hrefFor({ severity: s })}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-[#8a94a3]">
            Status
          </span>
          <FilterChip label="All" active={!status} href={hrefFor({ status: undefined })} />
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")}
              active={status === s}
              href={hrefFor({ status: s })}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#e5e8ec] bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#eef0f3] text-[11px] font-medium uppercase tracking-wide text-[#8a94a3]">
              <th className="px-5 py-3">Severity</th>
              <th className="px-5 py-3">Resource</th>
              <th className="px-5 py-3">What changed</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">First seen</th>
              <th className="px-5 py-3 text-right">Scans</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef0f3]">
            {page.items.map((d) => (
              <tr key={d.id} className="group transition-colors hover:bg-[#f8f9fb]">
                <td className="px-5 py-3">
                  <SeverityBadge severity={d.severity} score={d.risk_score} />
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/drifts/${d.id}`}
                    className="mono text-[13px] font-medium text-[#17202b] group-hover:text-[#2563eb]"
                  >
                    {d.resource_address}
                  </Link>
                </td>
                <td className="max-w-[300px] truncate px-5 py-3 text-[13px] text-[#5c6675]">
                  {listSummary(d)}
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-5 py-3 text-[12px] text-[#8a94a3]">
                  {relativeTime(d.first_seen_at)}
                </td>
                <td className="px-5 py-3 text-right text-[12px] text-[#8a94a3]">
                  {d.scan_count}
                </td>
              </tr>
            ))}
            {page.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center">
                  <p className="text-[13px] font-medium text-[#5c6675]">
                    No drift events match
                  </p>
                  <p className="mt-1 text-[12px] text-[#8a94a3]">
                    Try clearing the filters, or wait for the next scheduled
                    scan.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
