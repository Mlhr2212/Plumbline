import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { relativeTime, shortTime } from "@/lib/format";
import { Section, SeverityBadge, StatusPill } from "@/components/Badges";
import CopyableValue from "@/components/CopyableValue";
import { EmptyState } from "@/components/States";

export const dynamic = "force-dynamic";

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [scan, drifts] = await Promise.all([
    api.scan(id).catch(() => null),
    api.drifts({ limit: "100" }).catch(() => null),
  ]);
  if (!scan) notFound();

  const produced = (drifts?.items ?? []).filter((d) => d.scan_id === id);
  const dur = scan.completed_at
    ? `${((new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000).toFixed(1)}s`
    : "—";

  const fields: [string, React.ReactNode][] = [
    ["Status", <span key="s" className={scan.status === "COMPLETED" ? "text-healthy" : scan.status === "FAILED" ? "text-critical" : "text-medium"}>{scan.status.toLowerCase()}</span>],
    ["Environment", <span key="e" className="mono">{scan.environment}</span>],
    ["Repository", <span key="r" className="mono">{scan.repository || "—"}</span>],
    ["Commit", scan.commit_sha ? <CopyableValue key="c" value={scan.commit_sha} display={scan.commit_sha.slice(0, 10)} /> : "—"],
    ["Workspace", <span key="w" className="mono">{scan.workspace}</span>],
    ["Regions", <span key="rg" className="mono">{scan.regions.join(", ")}</span>],
    ["Account", <span key="a" className="mono">{scan.account_id}</span>],
    ["Terraform", <span key="t" className="mono">{scan.terraform_version ?? "—"} (plan fmt {scan.plan_format_version ?? "—"})</span>],
    ["Exit code", <span key="x" className="mono" title="0 = clean, 1 = error, 2 = changes present">{scan.terraform_exit_code ?? "—"}</span>],
    ["Started", shortTime(scan.started_at)],
    ["Duration", dur],
    ["Plan hash", scan.plan_hash ? <CopyableValue key="p" value={scan.plan_hash} display={`${scan.plan_hash.slice(0, 16)}…`} /> : "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="mono text-[15px] font-semibold tracking-tight">
          scan {scan.id.slice(0, 8)}
        </h1>
        <span className="text-[12px] text-faint">
          {relativeTime(scan.started_at)}
        </span>
      </div>

      {scan.error && (
        <div className="rounded-md border border-critical/30 bg-critical/5 px-4 py-3 text-[12px] text-critical">
          {scan.error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Scan metadata">
          <dl className="space-y-2 text-[12px]">
            {fields.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="text-faint">{k}</dt>
                <dd className="text-text">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          title={`Drift events from this scan (${produced.length})`}
          padded={false}
        >
          {produced.length === 0 ? (
            <EmptyState
              title="No drift detected by this scan"
              hint="The plan's resource_drift was empty — infrastructure matched the baseline."
            />
          ) : (
            <ul className="divide-y divide-border">
              {produced.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/drifts/${d.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover"
                  >
                    <SeverityBadge severity={d.severity} score={d.risk_score} />
                    <span className="mono min-w-0 flex-1 truncate text-[12px] text-text">
                      {d.resource_address}
                    </span>
                    <StatusPill status={d.status} />
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
