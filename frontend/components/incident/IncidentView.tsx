"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MousePointerClick,
} from "lucide-react";
import type {
  DependencySummary,
  DriftEvent,
  RemediationPreview,
  TimelineEvent,
} from "@/lib/types";
import { plainSummary, relativeTime } from "@/lib/format";
import { Section, SeverityBadge, StatusPill } from "@/components/Badges";
import CopyableValue from "@/components/CopyableValue";
import { useShell } from "@/components/AppShell";
import DriftReplay from "./DriftReplay";
import EvidencePanel from "./EvidencePanel";
import ResourceDiff from "./ResourceDiff";
import RiskBreakdown from "./RiskBreakdown";
import AttributionPanel from "./AttributionPanel";
import DependencyPanel from "./DependencyPanel";
import RemediationPanel from "./RemediationPanel";
import IncidentActions from "./IncidentActions";

export default function IncidentView({
  event,
  timeline,
  preview,
  deps,
  prevId,
  nextId,
}: {
  event: DriftEvent;
  timeline: TimelineEvent[];
  preview: RemediationPreview | null;
  deps: DependencySummary | null;
  prevId: string | null;
  nextId: string | null;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [remOpen, setRemOpen] = useState(false);
  const { focusMode, setFocusMode } = useShell();
  const selectedEvent = selectedIdx != null ? timeline[selectedIdx] : null;

  return (
    <div className="space-y-4">
      {/* ── Incident header ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <SeverityBadge severity={event.severity} score={event.risk_score} />
            <StatusPill status={event.status} />
            <span className="mono text-[11px] text-faint">
              DRIFT-{event.id.slice(0, 8)}
            </span>
            {/* quick switcher */}
            <span className="flex items-center gap-0.5">
              <Link
                href={prevId ? `/drifts/${prevId}` : "#"}
                aria-disabled={!prevId}
                title="Newer incident"
                className={`rounded p-1 transition-colors ${
                  prevId
                    ? "text-muted hover:bg-hover hover:text-text"
                    : "pointer-events-none text-border-strong"
                }`}
              >
                <ChevronLeft size={14} />
              </Link>
              <Link
                href={nextId ? `/drifts/${nextId}` : "#"}
                aria-disabled={!nextId}
                title="Older incident"
                className={`rounded p-1 transition-colors ${
                  nextId
                    ? "text-muted hover:bg-hover hover:text-text"
                    : "pointer-events-none text-border-strong"
                }`}
              >
                <ChevronRight size={14} />
              </Link>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <h1 className="mono truncate text-[17px] font-semibold tracking-tight text-text">
              {event.resource_address}
            </h1>
            <CopyableValue
              value={event.resource_address}
              display=""
              className="[&>span:first-child]:hidden"
            />
          </div>
          <p className="mt-1 text-[12px] text-faint">
            <span className="mono">{event.environment}</span> ·{" "}
            <span className="mono">{event.region || "—"}</span> · acct{" "}
            <span className="mono">{event.aws_account_id}</span> · detected{" "}
            {relativeTime(event.first_seen_at)} · confirmed by{" "}
            {event.scan_count} scan{event.scan_count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setFocusMode(!focusMode)}
            title="Focus mode — hide navigation (esc to exit)"
            aria-pressed={focusMode}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
              focusMode
                ? "border-accent-border bg-accent-soft text-accent"
                : "border-border bg-panel text-muted hover:text-text"
            }`}
          >
            <Crosshair size={13} /> Focus
          </button>
          <IncidentActions
            driftId={event.id}
            status={event.status}
            onOpenRemediation={() => setRemOpen(true)}
          />
        </div>
      </div>

      {/* ── Plain-English statement ─────────────────────────── */}
      <p className="border-l-2 border-l-accent-border py-0.5 pl-3 text-[13px] leading-relaxed text-muted">
        {plainSummary(event)}
      </p>

      {/* ── Investigation workspace ─────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_330px]">
        {/* Left: replay + diff + risk */}
        <div className="min-w-0 space-y-4">
          <Section title="Drift replay">
            <DriftReplay
              events={timeline}
              selectedIdx={selectedIdx}
              onSelect={setSelectedIdx}
            />
          </Section>

          <Section title="What changed">
            <ResourceDiff
              diffs={event.attribute_diffs}
              resourceType={event.resource_type}
            />
          </Section>

          <RiskBreakdown
            score={event.risk_score}
            severity={event.severity}
            factors={event.risk_factors}
          />
        </div>

        {/* Right rail — context inspector */}
        <div className="space-y-4">
          {selectedEvent ? (
            <Section
              title="Selected evidence"
              action={
                <button
                  onClick={() => setSelectedIdx(null)}
                  className="text-[11px] text-faint transition-colors hover:text-text"
                >
                  clear
                </button>
              }
            >
              <EvidencePanel event={selectedEvent} />
            </Section>
          ) : (
            <div className="rounded-md border border-dashed border-border px-4 py-3 text-[11px] leading-relaxed text-faint">
              <MousePointerClick size={13} className="mb-1 text-faint" />
              Select an event in Drift Replay to inspect its evidence here.
            </div>
          )}

          <Section title="Attribution">
            <AttributionPanel attribution={event.cloudtrail_attribution} />
          </Section>

          {deps && (
            <Section title="Known dependencies">
              <DependencyPanel deps={deps} />
            </Section>
          )}

          {preview && (
            <Section title="Remediation">
              <button
                onClick={() => setRemOpen(true)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-faint">Risk after reconcile</span>
                  <span className="font-medium text-healthy">
                    {preview.risk_after.toLowerCase()}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px]">
                  <span className="text-faint">Terraform action</span>
                  <span className="mono text-text">
                    {preview.terraform_actions.join(", ") || "—"}
                  </span>
                </div>
                <span className="mt-2.5 block text-center text-[12px] font-medium text-accent">
                  Open preview →
                </span>
              </button>
            </Section>
          )}
        </div>
      </div>

      {/* Focus-mode exit affordance */}
      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border-strong bg-elevated px-3 py-1.5 text-[11px] text-muted shadow-xl transition-colors hover:text-text"
        >
          Exit focus · esc
        </button>
      )}

      {remOpen && preview && (
        <RemediationPanel
          drift={event}
          preview={preview}
          onClose={() => setRemOpen(false)}
        />
      )}
    </div>
  );
}
