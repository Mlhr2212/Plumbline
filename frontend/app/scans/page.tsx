import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Card } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function ScansPage() {
  const page = await api.scans();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scans</h1>
        <p className="mt-1 text-sm text-[#8b98a9]">
          Every `terraform plan` ingested by PlumbLine — the audit trail of
          when we checked reality.
        </p>
      </div>

      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[#8b98a9]">
            <tr>
              <th className="pb-3">Scan</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Env</th>
              <th className="pb-3">Detected</th>
              <th className="pb-3">Resolved</th>
              <th className="pb-3">Commit</th>
              <th className="pb-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#232c38]">
            {page.items.map((s) => (
              <tr key={s.id}>
                <td className="mono py-2.5 text-sky-300">
                  {s.id.slice(0, 8)}
                </td>
                <td className="py-2.5">
                  <span
                    className={
                      s.status === "COMPLETED"
                        ? "text-emerald-400"
                        : s.status === "FAILED"
                          ? "text-red-400"
                          : "text-amber-400"
                    }
                  >
                    {s.status}
                  </span>
                </td>
                <td className="mono py-2.5 text-[#8b98a9]">{s.environment}</td>
                <td className="py-2.5">{s.drift_detected}</td>
                <td className="py-2.5">{s.drift_resolved}</td>
                <td className="mono py-2.5 text-[#8b98a9]">
                  {s.commit_sha ? s.commit_sha.slice(0, 7) : "—"}
                </td>
                <td className="py-2.5 text-[#8b98a9]">
                  {relativeTime(s.completed_at ?? s.started_at)}
                </td>
              </tr>
            ))}
            {page.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[#8b98a9]">
                  No scans yet — trigger the drift-scan workflow.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
