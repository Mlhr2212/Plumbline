"use client";

import type { TimelineEvent } from "@/lib/types";
import CopyableValue from "@/components/CopyableValue";
import { shortTime } from "@/lib/format";

const SKIP_KEYS = new Set(["estimated"]);

/** Right-rail inspector for a selected Drift Replay event. */
export default function EvidencePanel({ event }: { event: TimelineEvent }) {
  const confirmed = event.certainty === "confirmed";
  const meta = Object.entries(event.metadata ?? {}).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v != null && v !== "",
  );

  return (
    <div className="text-[12px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
            confirmed
              ? "bg-accent-soft text-accent"
              : "bg-medium/15 text-medium"
          }`}
        >
          {confirmed ? "confirmed" : "inferred"}
        </span>
        <span className="mono text-[11px] text-faint">
          {shortTime(event.timestamp)}
        </span>
      </div>

      <p className="text-[13px] font-medium text-text">{event.title}</p>
      {event.description && (
        <p className="mt-1 leading-relaxed text-muted">{event.description}</p>
      )}

      <dl className="mt-4 space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-faint">Source</dt>
          <dd className="mono text-text">{event.source}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-faint">Type</dt>
          <dd className="mono text-text">{event.type}</dd>
        </div>
        {event.confidence != null && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-faint">Confidence</dt>
            <dd className="text-text">
              {Math.round(event.confidence * 100)}%
            </dd>
          </div>
        )}
      </dl>

      {meta.length > 0 && (
        <>
          <p className="mb-2 mt-4 border-t border-border pt-3 text-[10px] font-medium uppercase tracking-widest text-faint">
            Event fields
          </p>
          <dl className="space-y-2">
            {meta.map(([k, v]) => {
              const s =
                typeof v === "object" ? JSON.stringify(v) : String(v);
              const long = s.length > 24;
              return (
                <div
                  key={k}
                  className={long ? "space-y-1" : "flex items-center justify-between gap-3"}
                >
                  <dt className="text-faint">{k.replace(/_/g, " ")}</dt>
                  <dd className={long ? "block" : ""}>
                    <CopyableValue value={s} truncate className="max-w-full" />
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}

      {event.evidence_refs.length > 0 && (
        <>
          <p className="mb-2 mt-4 border-t border-border pt-3 text-[10px] font-medium uppercase tracking-widest text-faint">
            Evidence references
          </p>
          <ul className="space-y-1.5">
            {event.evidence_refs.map((r) => (
              <li key={r}>
                <CopyableValue value={r} truncate className="max-w-full" />
              </li>
            ))}
          </ul>
        </>
      )}

      {!confirmed && (
        <p className="mt-4 rounded-md border border-medium/30 bg-medium/5 px-3 py-2 text-[11px] leading-relaxed text-medium">
          This step is inferred, not directly observed — timing is estimated
          from surrounding confirmed evidence.
        </p>
      )}
    </div>
  );
}
