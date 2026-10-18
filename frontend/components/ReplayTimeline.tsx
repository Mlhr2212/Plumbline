"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/lib/types";
import { shortTime } from "@/lib/format";

// Events a human cares about in the story view; the rest collapse.
const HEADLINE_TYPES = new Set([
  "CLOUDTRAIL_EVENT",
  "CLOUD_CHANGE",
  "BASELINE_CONFIRMED",
  "DRIFT_CONFIRMED",
  "INVESTIGATION_STARTED",
  "PR_CREATED",
  "REMEDIATION_STARTED",
  "REMEDIATION_COMPLETED",
  "DRIFT_ACCEPTED",
  "DRIFT_IGNORED",
  "DRIFT_RESOLVED",
]);

function CertaintyDot({ certainty }: { certainty: string }) {
  if (certainty === "confirmed") {
    // Solid filled dot = verified fact.
    return (
      <span className="flex h-4 w-4 items-center justify-center">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
      </span>
    );
  }
  // Hollow dashed-style dot = inferred — never presented as fact.
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-amber-400" />
    </span>
  );
}

export default function ReplayTimeline({
  events,
}: {
  events: TimelineEvent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const headline = events.filter((e) => HEADLINE_TYPES.has(e.type));
  const hidden = events.length - headline.length;
  const shown = expanded ? events : headline;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-[#8b98a9]">
          <span className="mr-4">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />
            confirmed fact
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full border border-dashed border-amber-400 align-middle" />
            inferred estimate
          </span>
        </p>
        {hidden > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-sky-400 hover:underline"
          >
            {expanded ? "Show fewer" : `Show ${hidden} technical events`}
          </button>
        )}
      </div>

      <ol className="relative border-l-2 border-[#2a3542] pl-6">
        {shown.map((e, i) => {
          const confirmed = e.certainty === "confirmed";
          return (
            <li key={i} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[31px] top-1">
                <CertaintyDot certainty={e.certainty} />
              </span>
              <div className={confirmed ? "" : "opacity-70"}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span
                    className={`mono text-xs ${
                      confirmed ? "text-sky-300" : "text-amber-300"
                    }`}
                  >
                    {confirmed ? shortTime(e.timestamp) : `~${shortTime(e.timestamp)}`}
                  </span>
                  <span className="text-sm font-medium">{e.title}</span>
                  {!confirmed && (
                    <span className="rounded border border-amber-800 bg-amber-900/30 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                      inferred
                    </span>
                  )}
                  {e.confidence !== null && e.confidence !== undefined && (
                    <span className="text-[10px] text-[#8b98a9]">
                      confidence {Math.round(e.confidence * 100)}%
                    </span>
                  )}
                </div>
                {e.description && (
                  <p className="mt-1 text-xs leading-relaxed text-[#8b98a9]">
                    {e.description}
                  </p>
                )}
                {(typeof e.metadata?.actor === "string" ||
                  typeof e.metadata?.pr_url === "string") && (
                  <p className="mono mt-1 text-[11px] text-[#5f6f82]">
                    {typeof e.metadata.actor === "string"
                      ? e.metadata.actor
                      : ""}
                    {typeof e.metadata.pr_url === "string"
                      ? e.metadata.pr_url
                      : ""}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="text-sm text-[#8b98a9]">No timeline events yet.</li>
        )}
      </ol>
    </div>
  );
}
