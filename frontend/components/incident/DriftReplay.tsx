"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  CloudLightning,
  EyeOff,
  FileSearch,
  GitPullRequest,
  PlayCircle,
  Radar,
  ScanLine,
  ShieldCheck,
  Undo2,
  Wrench,
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
  RISK_CLASSIFIED: ShieldCheck,
  INVESTIGATION_STARTED: FileSearch,
  REMEDIATION_PREVIEWED: Wrench,
  PR_CREATED: GitPullRequest,
  REMEDIATION_STARTED: Wrench,
  REMEDIATION_COMPLETED: CheckCircle2,
  DRIFT_ACCEPTED: Undo2,
  DRIFT_IGNORED: EyeOff,
  DRIFT_RESOLVED: CheckCircle2,
};

// Story beats first; technical plumbing collapses behind a toggle.
const HEADLINE = new Set([
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

const STEP_LABEL: Record<string, string> = {
  BASELINE_CONFIRMED: "baseline",
  CLOUD_CHANGE: "aws change",
  CLOUDTRAIL_EVENT: "cloudtrail",
  SCAN_STARTED: "scan",
  PLAN_GENERATED: "plan",
  DRIFT_CONFIRMED: "drift found",
  RISK_CLASSIFIED: "risk",
  INVESTIGATION_STARTED: "attribution",
  PR_CREATED: "pr opened",
  REMEDIATION_STARTED: "remediating",
  REMEDIATION_COMPLETED: "remediated",
  DRIFT_RESOLVED: "resolved",
  DRIFT_ACCEPTED: "accepted",
  DRIFT_IGNORED: "ignored",
};

export default function DriftReplay({
  events,
  selectedIdx,
  onSelect,
}: {
  events: TimelineEvent[];
  selectedIdx: number | null;
  onSelect: (i: number | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const headline = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => HEADLINE.has(e.type));
  const shown = showAll
    ? events.map((e, i) => ({ e, i }))
    : headline;
  const hidden = events.length - headline.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-dashed border-medium" />
            inferred
          </span>
        </div>
        {hidden > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] text-muted transition-colors hover:text-text"
          >
            {showAll ? "headline events only" : `+ ${hidden} technical events`}
          </button>
        )}
      </div>

      <ol className="relative">
        {shown.map(({ e, i: origIdx }, pos) => {
          const confirmed = e.certainty === "confirmed";
          const Icon = TYPE_ICON[e.type] ?? CircleDashed;
          const last = pos === shown.length - 1;
          const sel = selectedIdx === origIdx;
          return (
            <li key={origIdx} className="relative flex gap-3">
              {!last && (
                <span
                  className={`absolute left-[13px] top-8 h-[calc(100%-24px)] w-px ${
                    confirmed ? "bg-border" : "border-l border-dashed border-border-strong"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  sel
                    ? "border-accent bg-accent-soft text-accent"
                    : confirmed
                      ? "border-border-strong bg-elevated text-muted"
                      : "border-dashed border-medium/60 bg-medium/10 text-medium"
                }`}
              >
                <Icon size={13} strokeWidth={1.9} />
              </span>
              <button
                onClick={() => onSelect(sel ? null : origIdx)}
                aria-pressed={sel}
                className={`mb-5 min-w-0 flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                  sel
                    ? "border-accent-border bg-accent-soft"
                    : "border-transparent hover:border-border hover:bg-elevated"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span
                    className={`mono text-[10px] uppercase tracking-wider ${
                      confirmed ? "text-faint" : "text-medium"
                    }`}
                  >
                    {STEP_LABEL[e.type] ?? "event"}
                  </span>
                  <span
                    className={`mono text-[10px] ${
                      confirmed ? "text-faint" : "text-medium"
                    }`}
                  >
                    {confirmed ? shortTime(e.timestamp) : `~${shortTime(e.timestamp)}`}
                  </span>
                  {e.confidence != null && (
                    <span className="text-[10px] text-faint">
                      {Math.round(e.confidence * 100)}% conf
                    </span>
                  )}
                </div>
                <p
                  className={`mt-0.5 text-[13px] font-medium ${
                    sel ? "text-text" : "text-text"
                  }`}
                >
                  {e.title}
                </p>
                {e.description && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    {e.description}
                  </p>
                )}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="text-[12px] text-faint">No timeline events yet.</li>
        )}
      </ol>
    </div>
  );
}
