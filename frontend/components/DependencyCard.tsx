import { Network } from "lucide-react";
import type { DependencySummary } from "@/lib/types";
import { Card } from "./Badges";

export default function DependencyCard({
  deps,
}: {
  deps: DependencySummary;
}) {
  const total =
    deps.direct_dependents.length + deps.transitive_dependents.length;

  return (
    <Card title="Known dependency impact">
      {total === 0 ? (
        <p className="text-[13px] text-[#8a94a3]">
          Nothing in the Terraform configuration depends on this resource.
        </p>
      ) : (
        <ul className="space-y-2">
          {deps.direct_dependents.map((r) => (
            <li key={r} className="flex items-center gap-2">
              <Network size={13} className="shrink-0 text-[#8a94a3]" />
              <span className="mono text-[12px] font-medium text-[#17202b]">
                {r}
              </span>
            </li>
          ))}
          {deps.transitive_dependents.map((r) => (
            <li key={r} className="flex items-center gap-2 pl-5">
              <span className="mono text-[12px] text-[#8a94a3]">{r}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-[#eef0f3] pt-2 text-[11px] leading-relaxed text-[#8a94a3]">
        {deps.evidence_note}
      </p>
    </Card>
  );
}
