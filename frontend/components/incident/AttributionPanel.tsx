"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, UserX } from "lucide-react";
import type { Attribution } from "@/lib/types";
import CopyableValue from "@/components/CopyableValue";
import { shortTime } from "@/lib/format";

function band(confidence: number): { label: string; cls: string } {
  if (confidence >= 0.85)
    return { label: "High", cls: "bg-healthy/15 text-healthy" };
  if (confidence >= 0.5)
    return { label: "Medium", cls: "bg-medium/15 text-medium" };
  return { label: "Low", cls: "bg-faint/15 text-muted" };
}

function actorName(actor: string) {
  // arn:aws:iam::123:root → root; assumed-role/X/Y → X/Y
  const parts = actor.split("/");
  return parts.slice(-2).join("/");
}

export default function AttributionPanel({
  attribution,
}: {
  attribution: Attribution;
}) {
  const [showCandidates, setShowCandidates] = useState(false);
  const a = attribution;
  const known = a.status === "identified" && a.actor;
  const pct = Math.round((a.confidence ?? 0) * 100);
  const b = band(a.confidence ?? 0);

  if (!known) {
    return (
      <div className="flex items-start gap-3 text-[12px]">
        <UserX size={15} className="mt-0.5 shrink-0 text-faint" />
        <div>
          <p className="font-medium text-text">Actor unknown</p>
          <p className="mt-1 leading-relaxed text-muted">
            {a.status === "disabled"
              ? "CloudTrail lookup is not configured for this deployment."
              : "No CloudTrail event matched this change inside the drift window. Reported honestly — PlumbLine never guesses an actor."}
          </p>
          {a.candidates.length > 0 && (
            <p className="mt-1 text-faint">
              {a.candidates.length} nearby event
              {a.candidates.length === 1 ? "" : "s"} below the confidence
              threshold.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-faint">
          Likely actor
        </span>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${b.cls}`}
          title="Attribution confidence — backend-computed"
        >
          {b.label} · {pct}%
        </span>
      </div>
      <CopyableValue
        value={a.actor!}
        display={actorName(a.actor!)}
        className="mt-2"
      />
      <dl className="mt-3 space-y-1.5">
        {a.event_name && (
          <div className="flex justify-between gap-3">
            <dt className="text-faint">API call</dt>
            <dd className="mono text-text">{a.event_name}</dd>
          </div>
        )}
        {a.event_time && (
          <div className="flex justify-between gap-3">
            <dt className="text-faint">At</dt>
            <dd className="mono text-text">{shortTime(a.event_time)}</dd>
          </div>
        )}
        {a.source_ip && (
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Source IP</dt>
            <dd className="flex items-center gap-1.5">
              <CopyableValue value={a.source_ip} />
              {a.source_ip.endsWith(".x.x") && (
                <span
                  className="text-[9px] uppercase tracking-wide text-faint"
                  title="Redacted before reaching the browser"
                >
                  redacted
                </span>
              )}
            </dd>
          </div>
        )}
        {a.event_id && (
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Event</dt>
            <dd>
              <CopyableValue
                value={a.event_id}
                display={`${a.event_id.slice(0, 13)}…`}
              />
            </dd>
          </div>
        )}
      </dl>

      {/* Confidence evidence — expandable, honest */}
      <button
        onClick={() => setShowCandidates(!showCandidates)}
        aria-expanded={showCandidates}
        className="mt-3 flex w-full items-center gap-1.5 border-t border-border pt-2.5 text-[11px] text-muted transition-colors hover:text-text"
      >
        <HelpCircle size={12} />
        Why {pct}% confidence
        <ChevronDown
          size={12}
          className={`ml-auto transition-transform ${showCandidates ? "rotate-180" : ""}`}
        />
      </button>
      {showCandidates && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted">
            Source: <span className="mono">{a.source}</span>. PlumbLine
            selected the highest-confidence CloudTrail event inside the drift
            window.
          </p>
          {a.candidates.length > 0 && (
            <ul className="space-y-1.5">
              {a.candidates.map((c, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="mono text-[11px] text-text">
                      {String(c.event_name ?? "event")}
                    </span>
                    <span className="text-[10px] text-faint">
                      {Math.round(Number(c.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="mono mt-0.5 truncate text-[10px] text-faint">
                    {String(c.actor ?? "")}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {a.user_agent && (
            <p className="mono break-all text-[10px] text-faint">
              ua: {a.user_agent.slice(0, 80)}
              {a.user_agent.length > 80 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
