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
    <Card title="What's at risk">
      {total === 0 ? (
        <p className="text-sm text-[#8b98a9]">
          No known Terraform dependents on this resource.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {deps.direct_dependents.map((r) => (
            <li key={r} className="mono text-xs text-[#c9d4e0]">
              ↳ {r}
            </li>
          ))}
          {deps.transitive_dependents.map((r) => (
            <li key={r} className="mono text-xs text-[#5f6f82]">
              ↳↳ {r}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-[#232c38] pt-2 text-[10px] leading-relaxed text-[#5f6f82]">
        {deps.label} — {deps.evidence_note}
      </p>
    </Card>
  );
}
