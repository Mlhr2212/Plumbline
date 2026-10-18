import Link from "next/link";
import { notFound } from "next/navigation";
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/drifts"
          className="text-xs text-[#8b98a9] hover:text-white"
        >
          ← Drift events
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="mono text-xl font-bold">{event.resource_address}</h1>
          <SeverityBadge severity={event.severity} score={event.risk_score} />
          <StatusPill status={event.status} />
        </div>
        <p className="mt-1 text-xs text-[#8b98a9]">
          env <span className="mono">{event.environment}</span> · region{" "}
          <span className="mono">{event.region || "—"}</span> · account{" "}
          <span className="mono">{event.aws_account_id || "—"}</span> · first
          seen {relativeTime(event.first_seen_at)} · seen by{" "}
          {event.scan_count} scan{event.scan_count === 1 ? "" : "s"}
        </p>
      </div>

      {/* Plain-English summary */}
      <Card className="border-sky-900 bg-[#0f1a24]">
        <p className="text-base leading-relaxed">{plainSummary(event)}</p>
      </Card>

      {/* The three investigation columns */}
      <div className="grid gap-4 md:grid-cols-3">
        <AttributionCard attribution={event.cloudtrail_attribution} />
        <DiffTable diffs={event.attribute_diffs} />
        <DependencyCard deps={event.dependency_context} />
      </div>

      {/* Risk factors */}
      {event.risk_factors.length > 0 && (
        <Card title="Why this score">
          <ul className="space-y-1.5">
            {event.risk_factors.map((f) => (
              <li
                key={f.rule_id}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="mono w-24 shrink-0 text-right font-semibold text-amber-300">
                  +{f.score}
                </span>
                <span>
                  <span className="mono text-xs text-[#5f6f82]">
                    {f.rule_id}
                  </span>{" "}
                  {f.message}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Drift Replay */}
      <Card title="Drift Replay — the story of this incident">
        <ReplayTimeline events={timeline} />
      </Card>

      {/* Remediation preview + actions */}
      {preview && <RemediationCard preview={preview} />}
      <Card title="Actions">
        <ActionButtons driftId={event.id} status={event.status} />
        <p className="mt-3 text-[10px] leading-relaxed text-[#5f6f82]">
          Reconciliation produces a reviewable proposal — PlumbLine never
          silently rewrites Terraform or applies changes. Last checked:{" "}
          {shortTime(event.last_seen_at)}.
        </p>
      </Card>
    </div>
  );
}
