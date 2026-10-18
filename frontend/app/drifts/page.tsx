import Link from "next/link";
import { api } from "@/lib/api";
import { listSummary, relativeTime } from "@/lib/format";
import { SeverityBadge, StatusPill } from "@/components/Badges";
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

function FilterLink({
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
      className={`rounded border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-sky-500 bg-sky-900/40 text-sky-300"
          : "border-[#232c38] text-[#8b98a9] hover:border-[#3a4656] hover:text-white"
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drift Events</h1>
        <p className="mt-1 text-sm text-[#8b98a9]">
          Every out-of-band change Terraform observed — the work queue.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[#8b98a9]">
            Severity
          </span>
          <FilterLink label="All" active={!sev} href={hrefFor({ severity: undefined })} />
          {SEVERITIES.map((s) => (
            <FilterLink key={s} label={s} active={sev === s} href={hrefFor({ severity: s })} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[#8b98a9]">
            Status
          </span>
          <FilterLink label="All" active={!status} href={hrefFor({ status: undefined })} />
          {STATUSES.map((s) => (
            <FilterLink key={s} label={s} active={status === s} href={hrefFor({ status: s })} />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#232c38]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#11161d] text-xs uppercase tracking-wide text-[#8b98a9]">
            <tr>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">What changed</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">First seen</th>
              <th className="px-4 py-3">Scans</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#232c38]">
            {page.items.map((d) => (
              <tr key={d.id} className="bg-[#0d1218] hover:bg-[#161d27]">
                <td className="px-4 py-3">
                  <SeverityBadge severity={d.severity} score={d.risk_score} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/drifts/${d.id}`}
                    className="mono text-sky-300 hover:underline"
                  >
                    {d.resource_address}
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-3 text-[#c9d4e0]">
                  {listSummary(d)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-4 py-3 text-[#8b98a9]">
                  {relativeTime(d.first_seen_at)}
                </td>
                <td className="px-4 py-3 text-[#8b98a9]">{d.scan_count}</td>
              </tr>
            ))}
            {page.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[#8b98a9]"
                >
                  No drift events match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
