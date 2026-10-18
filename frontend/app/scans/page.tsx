import Link from "next/link";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Section } from "@/components/Badges";
import { EmptyState, ErrorState } from "@/components/States";

export const dynamic = "force-dynamic";

function duration(s: { started_at: string; completed_at: string | null }) {
  if (!s.completed_at) return "—";
  const ms =
    new Date(s.completed_at).getTime() - new Date(s.started_at).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "text-healthy";
  if (status === "FAILED") return "text-critical";
  return "text-medium";
}

export default async function ScansPage() {
  const scans = await api.scans().catch(() => null);
  if (!scans) {
    return <ErrorState detail="Couldn't load scan history." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Scans</h1>
        <span className="text-[12px] text-faint">
          every Terraform plan PlumbLine ingested
        </span>
      </div>

      <Section padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-widest text-faint">
                <th className="px-3 py-2">Scan</th>
                <th className="px-3 py-2">Env</th>
                <th className="px-3 py-2">Commit</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2 text-right">Detected</th>
                <th className="px-3 py-2 text-right">Resolved</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scans.items.map((s) => (
                <tr
                  key={s.id}
                  className="transition-colors hover:bg-hover"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/scans/${s.id}`}
                      className="mono text-[12px] text-text hover:text-accent"
                    >
                      {s.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="mono px-3 py-2 text-[11px] text-muted">
                    {s.environment}
                  </td>
                  <td className="mono px-3 py-2 text-[11px] text-muted">
                    {s.commit_sha.slice(0, 7)}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-faint">
                    {relativeTime(s.started_at)}
                  </td>
                  <td className="mono px-3 py-2 text-[11px] text-muted">
                    {duration(s)}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">
                    <span className={s.drift_detected ? "text-text" : "text-faint"}>
                      {s.drift_detected}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums text-faint">
                    {s.drift_resolved}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[11px] font-medium ${statusTone(s.status)}`}
                    >
                      {s.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scans.items.length === 0 && (
            <EmptyState
              title="No scans yet"
              hint="The hourly GitHub Actions workflow ingests plans here."
            />
          )}
        </div>
      </Section>
    </div>
  );
}
