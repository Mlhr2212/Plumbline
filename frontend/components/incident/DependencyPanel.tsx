"use client";

import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import type { DependencySummary } from "@/lib/types";
import CopyableValue from "@/components/CopyableValue";

/** Compact dependency view — Terraform references only, honestly labeled. */
export default function DependencyPanel({
  deps,
}: {
  deps: DependencySummary;
}) {
  const [showEdges, setShowEdges] = useState(false);
  const count = deps.direct_dependents.length;

  if (count === 0 && deps.transitive_dependents.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-faint">
        No Terraform-declared dependents — nothing in the configuration
        references this resource.
      </p>
    );
  }

  return (
    <div className="text-[12px]">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-faint">
        Used by — {count} dependent{count === 1 ? "" : "s"}
      </p>
      <ul className="space-y-1.5">
        {deps.direct_dependents.map((d) => (
          <li
            key={d}
            className="flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5"
          >
            <Layers size={11} className="shrink-0 text-faint" />
            <CopyableValue value={d} truncate className="min-w-0 flex-1" />
          </li>
        ))}
      </ul>

      {deps.edges.length > 0 && (
        <>
          <button
            onClick={() => setShowEdges(!showEdges)}
            aria-expanded={showEdges}
            className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            Relationship evidence
            <ChevronDown
              size={12}
              className={`transition-transform ${showEdges ? "rotate-180" : ""}`}
            />
          </button>
          {showEdges && (
            <ul className="mt-2 space-y-1.5">
              {deps.edges.map((e, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5"
                >
                  <span className="mono text-[10px] text-muted">
                    {e.dependent}
                  </span>
                  <span className="mx-1.5 text-[10px] text-faint">→</span>
                  <span className="mono text-[10px] text-muted">
                    {e.dependency}
                  </span>
                  <div className="mt-0.5 text-[10px] text-faint">
                    via <span className="mono">{e.via ?? "reference"}</span> ·{" "}
                    {e.evidence === "TERRAFORM_REFERENCE"
                      ? "terraform reference"
                      : e.evidence.toLowerCase()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-faint">
        {deps.evidence_note}
      </p>
    </div>
  );
}
