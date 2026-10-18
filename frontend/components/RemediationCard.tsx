import { ArrowRight } from "lucide-react";
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <div>
            <span className="text-[#8a94a3]">Terraform would </span>
            <span className="mono font-medium text-[#17202b]">
              {p.terraform_actions.length > 0
                ? p.terraform_actions.join(" + ")
                : "take no planned action"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#8a94a3]">Risk</span>
            <SeverityBadge severity={p.risk_before} />
            <ArrowRight size={12} className="text-[#8a94a3]" />
            <SeverityBadge severity={p.risk_after} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            ["Modified", p.resources_modified],
            ["Replaced", p.resources_replaced],
            ["Dependents", p.known_dependents],
          ].map(([label, v]) => (
            <div
              key={label as string}
              className="rounded-lg border border-[#eef0f3] bg-[#f8f9fb] px-3 py-2 text-center"
            >
              <div className="text-lg font-semibold">{v}</div>
              <div className="text-[10px] uppercase tracking-wide text-[#8a94a3]">
                {label}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-[#eef0f3] bg-[#f8f9fb] px-3 py-2 text-center">
            <div className="text-lg font-semibold">
              {p.downtime_expected ? (
                <span className="text-amber-600">Possible</span>
              ) : (
                <span className="text-emerald-600">None*</span>
              )}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[#8a94a3]">
              Downtime
            </div>
          </div>
        </div>

        <ul className="space-y-1 text-[12px] text-[#5c6675]">
          {p.reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[#c3cad4]">—</span>
              {r}
            </li>
          ))}
        </ul>

        <p className="border-t border-[#eef0f3] pt-3 text-[11px] text-[#8a94a3]">
          Confidence {Math.round(p.confidence * 100)}% · *No downtime-inducing
          actions detected — not a guarantee of zero downtime.
        </p>
      </div>
    </Card>
  );
}
