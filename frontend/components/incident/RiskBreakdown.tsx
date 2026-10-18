"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RiskFactor, Severity } from "@/lib/types";
import { severityText } from "@/components/Badges";

/** Explainable risk — click the score to see exactly how it was computed. */
export default function RiskBreakdown({
  score,
  severity,
  factors,
}: {
  score: number;
  severity: Severity;
  factors: RiskFactor[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md border border-border bg-panel px-4 py-3 text-left transition-colors hover:border-border-strong"
      >
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted">
          Risk score
        </span>
        <span
          className={`text-[18px] font-semibold tabular-nums ${severityText(severity)}`}
        >
          {score}
        </span>
        <span className="text-[11px] text-faint">/ 100</span>
        <span className={`ml-1 capitalize ${severityText(severity)} text-[12px] font-medium`}>
          {severity.toLowerCase()}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
          {open ? "hide breakdown" : `how it's calculated · ${factors.length} signals`}
          <ChevronDown
            size={13}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-border bg-panel px-4 py-3">
          <ul className="space-y-2">
            {factors.map((f) => (
              <li key={f.rule_id} className="flex items-baseline gap-3">
                <span className="mono w-10 shrink-0 text-right text-[12px] font-medium tabular-nums text-medium">
                  +{f.score}
                </span>
                <span className="flex-1 text-[12px] leading-relaxed text-text">
                  {f.message}
                </span>
                <span className="mono shrink-0 text-[10px] text-faint">
                  {f.rule_id}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2.5 text-[10px] leading-relaxed text-faint">
            Deterministic rules, not ML — every point above comes from a named
            rule evaluated against the diff and resource type.
          </p>
        </div>
      )}
    </div>
  );
}
