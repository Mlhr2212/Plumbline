import Link from "next/link";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Section } from "@/components/Badges";
import { EmptyState, ErrorState } from "@/components/States";

export const dynamic = "force-dynamic";

export default async function ReconciliationsPage() {
  const page = await api.reconciliations().catch(() => null);
  if (!page) {
    return <ErrorState detail="Couldn't load reconciliations." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">
          Reconciliations
        </h1>
        <span className="text-[12px] text-faint">
          reviewable proposals — nothing applies automatically
        </span>
      </div>

      <Section padded={false}>
        {page.items.length === 0 ? (
          <EmptyState
            icon={GitPullRequest}
            title="No reconciliations yet"
            hint="When you request remediation on a drift event, a reviewable proposal lands here with its PR link."
          />
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-widest text-faint">
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">PR</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.items.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-hover">
                  <td className="px-3 py-2">
                    <Link
                      href={`/drifts/${r.drift_event_id}`}
                      className="mono text-[12px] text-text hover:text-accent"
                    >
                      {r.resource_address}
                    </Link>
                  </td>
                  <td className="mono px-3 py-2 text-[11px] text-muted">
                    {r.strategy}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted">
                    {r.risk.toLowerCase()}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted">
                    {r.status.toLowerCase().replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2">
                    {r.pr_url ? (
                      <a
                        href={r.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                      >
                        #{r.pr_number ?? "PR"} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-[11px] text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-faint">
                    {relativeTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
