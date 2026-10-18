"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CloudLightning,
  FileSearch,
  GitPullRequest,
  PlayCircle,
  Radar,
  ScanLine,
  ShieldCheck,
  Wrench,
  EyeOff,
  Undo2,
  CircleDashed,
} from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { shortTime } from "@/lib/format";

const TYPE_ICON: Record<string, typeof Radar> = {
  BASELINE_CONFIRMED: ShieldCheck,
  CLOUD_CHANGE: CloudLightning,
  CLOUDTRAIL_EVENT: FileSearch,
  SCAN_STARTED: PlayCircle,
  PLAN_GENERATED: ScanLine,
  DRIFT_CONFIRMED: Radar,
  RISK_CLASSIFIED: CircleDashed,
  INVESTIGATION_STARTED: FileSearch,
  REMEDIATION_PREVIEWED: CircleDashed,
  PR_CREATED: GitPullRequest,
  REMEDIATION_STARTED: Wrench,
  REMEDIATION_COMPLETED: CheckCircle2,
  DRIFT_ACCEPTED: Undo2,
  DRIFT_IGNORED: EyeOff,
  DRIFT_RESOLVED: CheckCircle2,
};

// The story beats a human cares about; the rest collapse.
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
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[11px] text-[#8a94a3]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2563eb]" /> confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-dashed border-amber-500" />
            inferred
          </span>
        </div>
        {hidden > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] font-medium text-[#2563eb] hover:underline"
          >
            {expanded
              ? "Show fewer"
              : `Show ${hidden} technical event${hidden === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      <ol className="relative space-y-0">
        {shown.map((e, i) => {
          const confirmed = e.certainty === "confirmed";
          const Icon = TYPE_ICON[e.type] ?? CircleDashed;
          const last = i === shown.length - 1;
          return (
            <li key={i} className="relative flex gap-4">
              {/* connector line */}
              {!last && (
                <span
                  className={`absolute left-[15px] top-9 h-[calc(100%-28px)] w-px ${
                    confirmed ? "bg-[#e5e8ec]" : "border-l border-dashed border-[#e5e8ec]"
                  }`}
                  aria-hidden
                />
              )}
              {/* marker */}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  confirmed
                    ? "border-[#c7d7fb] bg-[#eff4ff] text-[#2563eb]"
                    : "border-dashed border-amber-300 bg-amber-50 text-amber-600"
                }`}
              >
                <Icon size={14} strokeWidth={1.9} />
              </span>
              <div className={`min-w-0 flex-1 pb-7 ${confirmed ? "" : "opacity-80"}`}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span
                    className={`mono text-[11px] ${
                      confirmed ? "text-[#8a94a3]" : "text-amber-600"
                    }`}
                  >
                    {confirmed
                      ? shortTime(e.timestamp)
                      : `~${shortTime(e.timestamp)}`}
                  </span>
                  <span className="text-[13px] font-medium text-[#17202b]">
                    {e.title}
                  </span>
                  {!confirmed && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      inferred
                    </span>
                  )}
                  {e.confidence != null && (
                    <span className="text-[11px] text-[#8a94a3]">
                      {Math.round(e.confidence * 100)}% confident
                    </span>
                  )}
                </div>
                {e.description && (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#5c6675]">
                    {e.description}
                  </p>
                )}
                {(typeof e.metadata?.actor === "string" ||
                  typeof e.metadata?.pr_url === "string") && (
                  <p className="mono mt-1 text-[11px] text-[#8a94a3]">
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
          <li className="text-[13px] text-[#8a94a3]">No timeline events yet.</li>
        )}
      </ol>
    </div>
  );
}
