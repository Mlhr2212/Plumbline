import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { plainSummary, relativeTime, shortTime } from "@/lib/format";
import { Card, SeverityBadge, StatusPill } from "@/components/Badges";
import AttributionCard from "@/components/AttributionCard";
import DependencyCard from "@/components/DependencyCard";
import DiffTable from "@/components/DiffTable";
import RemediationCard from "@/components/RemediationCard";
import ReplayTimeline from "@/components/ReplayTimeline";
import ActionButtons from "@/components/ActionButtons";

export const dynamic = "force-dynamic";

export default async function DriftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, timeline, preview] = await Promise.all([
    api.drift(id).catch(() => null),
    api.timeline(id).catch(() => []),
    api.remediationPreview(id).catch(() => null),
  ]);
  if (!event) notFound();

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-[#8a94a3]">
        <Link href="/drifts" className="hover:text-[#17202b]">
          Drift events
        </Link>
        <ChevronRight size={12} />
        <span className="mono text-[#5c6675]">{event.resource_address}</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mono text-[18px] font-semibold tracking-tight">
            {event.resource_address}
          </h1>
          <SeverityBadge severity={event.severity} score={event.risk_score} />
          <StatusPill status={event.status} />
        </div>
        <p className="mt-1.5 text-[12px] text-[#8a94a3]">
          <span className="mono">{event.environment}</span> ·{" "}
          <span className="mono">{event.region || "—"}</span> · acct{" "}
          <span className="mono">{event.aws_account_id || "—"}</span> · first
          seen {relativeTime(event.first_seen_at)} · confirmed by{" "}
          {event.scan_count} scan{event.scan_count === 1 ? "" : "s"}
        </p>
      </div>

      {/* Plain-English summary */}
      <div className="rounded-xl border border-[#c7d7fb] bg-[#eff4ff] px-5 py-4">
        <p className="text-[14px] leading-relaxed text-[#1e3a6e]">
          {plainSummary(event)}
        </p>
      </div>

      {/* Two-column: main story + investigation rail */}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <DiffTable diffs={event.attribute_diffs} />

          <Card title="Drift Replay — what happened, in order">
            <ReplayTimeline events={timeline} />
          </Card>

          {event.risk_factors.length > 0 && (
            <Card title="Why this risk score">
              <ul className="space-y-2">
                {event.risk_factors.map((f) => (
                  <li key={f.rule_id} className="flex items-baseline gap-3">
                    <span className="mono w-10 shrink-0 text-right text-[12px] font-semibold text-amber-700">
                      +{f.score}
                    </span>
                    <span className="text-[13px] text-[#17202b]">
                      {f.message}{" "}
                      <span className="mono text-[10px] text-[#8a94a3]">
                        {f.rule_id}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right rail — the investigation panel */}
        <div className="space-y-5">
          <AttributionCard attribution={event.cloudtrail_attribution} />
          <DependencyCard deps={event.dependency_context} />
          {preview && <RemediationCard preview={preview} />}
          <Card title="Actions">
            <ActionButtons driftId={event.id} status={event.status} />
            <p className="mt-3 text-[11px] leading-relaxed text-[#8a94a3]">
              Reconciliation produces a reviewable proposal — PlumbLine never
              silently rewrites Terraform or applies changes. Last seen{" "}
              {shortTime(event.last_seen_at)}.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
