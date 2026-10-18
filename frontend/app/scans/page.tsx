import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function ScansPage() {
  const page = await api.scans();

  return (
    <div>
      <PageHeader
        title="Scans"
        description="Every terraform plan ingested by PlumbLine — the audit trail of when we checked reality."
      />

      <div className="overflow-hidden rounded-xl border border-[#e5e8ec] bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#eef0f3] text-[11px] font-medium uppercase tracking-wide text-[#8a94a3]">
              <th className="px-5 py-3">Scan</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Env</th>
              <th className="px-5 py-3 text-right">Detected</th>
              <th className="px-5 py-3 text-right">Resolved</th>
              <th className="px-5 py-3">Commit</th>
              <th className="px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef0f3]">
            {page.items.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-[#f8f9fb]">
                <td className="mono px-5 py-3 text-[13px] text-[#2563eb]">
                  {s.id.slice(0, 8)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      s.status === "COMPLETED"
                        ? "text-emerald-700"
                        : s.status === "FAILED"
                          ? "text-red-600"
                          : "text-amber-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.status === "COMPLETED"
                          ? "bg-emerald-500"
                          : s.status === "FAILED"
                            ? "bg-red-500"
                            : "bg-amber-500"
                      }`}
                    />
                    {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="mono px-5 py-3 text-[12px] text-[#8a94a3]">
                  {s.environment}
                </td>
                <td className="px-5 py-3 text-right text-[13px]">
                  {s.drift_detected}
                </td>
                <td className="px-5 py-3 text-right text-[13px]">
                  {s.drift_resolved}
                </td>
                <td className="mono px-5 py-3 text-[12px] text-[#8a94a3]">
                  {s.commit_sha ? s.commit_sha.slice(0, 7) : "—"}
                </td>
                <td className="px-5 py-3 text-[12px] text-[#8a94a3]">
                  {relativeTime(s.completed_at ?? s.started_at)}
                </td>
              </tr>
            ))}
            {page.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center">
                  <p className="text-[13px] font-medium text-[#5c6675]">
                    No scans yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#8a94a3]">
                    Trigger the drift-scan workflow in GitHub Actions.
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
