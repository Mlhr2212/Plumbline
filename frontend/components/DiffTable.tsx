"use client";

import { useState } from "react";
import type { AttributeDiff } from "@/lib/types";
import { fmtValue } from "@/lib/format";
import { Card } from "./Badges";

const MARK = {
  added: { sign: "+", cls: "text-emerald-600" },
  removed: { sign: "−", cls: "text-red-500" },
  modified: { sign: "±", cls: "text-amber-600" },
} as const;

export default function DiffTable({ diffs }: { diffs: AttributeDiff[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? diffs : diffs.slice(0, 6);

  return (
    <Card
      title="Attribute diffs"
      action={
        <span className="text-[11px] text-[#8a94a3]">
          {diffs.length} change{diffs.length === 1 ? "" : "s"}
        </span>
      }
    >
      {diffs.length === 0 ? (
        <p className="text-[13px] text-[#8a94a3]">
          No leaf-level diffs (e.g. a whole-resource change).
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#eef0f3]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#f8f9fb] text-[10px] font-medium uppercase tracking-wider text-[#8a94a3]">
                <th className="w-6 px-3 py-2" />
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Before</th>
                <th className="px-3 py-2">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f3]">
              {shown.map((d, i) => {
                const m = MARK[d.change_type];
                return (
                  <tr key={i}>
                    <td className={`mono px-3 py-2 font-bold ${m.cls}`}>
                      {m.sign}
                    </td>
                    <td className="mono max-w-[220px] truncate px-3 py-2 text-[11px] text-[#17202b]">
                      {d.path}
                    </td>
                    <td className="mono max-w-[140px] truncate px-3 py-2 text-[11px] text-[#8a94a3]">
                      {d.sensitive ? (
                        <span className="italic">redacted</span>
                      ) : d.change_type === "added" ? (
                        <span className="text-[#c3cad4]">—</span>
                      ) : (
                        fmtValue(d.before)
                      )}
                    </td>
                    <td className="mono max-w-[140px] truncate px-3 py-2 text-[11px] text-[#17202b]">
                      {d.sensitive ? (
                        <span className="italic">redacted</span>
                      ) : d.change_type === "removed" ? (
                        <span className="text-[#c3cad4]">—</span>
                      ) : (
                        fmtValue(d.after)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {diffs.length > 6 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full border-t border-[#eef0f3] py-2 text-[12px] font-medium text-[#2563eb] hover:bg-[#f8f9fb]"
            >
              {expanded ? "Show fewer" : `Show all ${diffs.length} diffs`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
