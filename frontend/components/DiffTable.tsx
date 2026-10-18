"use client";

import { useState } from "react";
import type { AttributeDiff } from "@/lib/types";
import { fmtValue } from "@/lib/format";
import { Card } from "./Badges";

const ARROW = {
  added: { sign: "+", cls: "text-emerald-400" },
  removed: { sign: "−", cls: "text-red-400" },
  modified: { sign: "~", cls: "text-amber-400" },
} as const;

export default function DiffTable({ diffs }: { diffs: AttributeDiff[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? diffs : diffs.slice(0, 5);

  return (
    <Card title={`What changed (${diffs.length} diff${diffs.length === 1 ? "" : "s"})`}>
      {diffs.length === 0 ? (
        <p className="text-sm text-[#8b98a9]">
          No attribute-level diffs (e.g. a whole-resource change).
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((d, i) => {
              const a = ARROW[d.change_type];
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mono font-bold ${a.cls}`}>{a.sign}</span>
                  <span className="mono break-all text-[#c9d4e0]">
                    {d.path}
                  </span>
                  <span className="ml-auto shrink-0 text-right text-[#5f6f82]">
                    {d.sensitive ? (
                      <span className="italic">redacted</span>
                    ) : d.change_type === "modified" ? (
                      <span className="mono">
                        {fmtValue(d.before)} → {fmtValue(d.after)}
                      </span>
                    ) : d.change_type === "added" ? (
                      <span className="mono">{fmtValue(d.after)}</span>
                    ) : (
                      <span className="mono line-through">
                        {fmtValue(d.before)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {diffs.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 text-xs text-sky-400 hover:underline"
            >
              {expanded ? "Show fewer" : `Show all ${diffs.length} diffs`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
