import type { RemediationPreview } from "@/lib/types";
import { Card, SeverityBadge } from "./Badges";

export default function RemediationCard({
  preview,
}: {
  preview: RemediationPreview;
}) {
  const p = preview;
  return (
    <Card title="Remediation preview">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <span className="text-[#8b98a9]">Terraform would: </span>
            <span className="mono font-medium">
              {p.terraform_actions.length > 0
                ? p.terraform_actions.join(" + ")
                : "no planned action"}
            </span>
          </div>
          <div>
            <span className="text-[#8b98a9]">Risk: </span>
            <SeverityBadge severity={p.risk_before} />
            <span className="mx-1 text-[#8b98a9]">→</span>
            <SeverityBadge severity={p.risk_after} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
          <div>
            <dt className="text-[#8b98a9]">Modified</dt>
            <dd className="text-lg font-semibold">{p.resources_modified}</dd>
          </div>
          <div>
            <dt className="text-[#8b98a9]">Replaced</dt>
            <dd className="text-lg font-semibold">{p.resources_replaced}</dd>
          </div>
          <div>
            <dt className="text-[#8b98a9]">Dependents</dt>
            <dd className="text-lg font-semibold">{p.known_dependents}</dd>
          </div>
          <div>
            <dt className="text-[#8b98a9]">Downtime</dt>
            <dd className="text-lg font-semibold">
              {p.downtime_expected ? (
                <span className="text-amber-400">possible</span>
              ) : (
                <span className="text-emerald-400">none detected*</span>
              )}
            </dd>
          </div>
        </dl>

        <ul className="space-y-1 border-t border-[#232c38] pt-3 text-xs text-[#8b98a9]">
          {p.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
        <p className="text-[10px] text-[#5f6f82]">
          Confidence {Math.round(p.confidence * 100)}% · *no downtime-inducing
          actions detected — not a guarantee of zero downtime.
        </p>
      </div>
    </Card>
  );
}
