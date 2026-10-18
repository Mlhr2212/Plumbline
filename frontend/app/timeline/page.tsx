import Link from "next/link";
import {
  CheckCircle2,
  Radar,
  ScanLine,
  AlertTriangle,
  GitPullRequest,
} from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime, shortTime } from "@/lib/format";
import { Section, severityDot } from "@/components/Badges";
import { EmptyState, ErrorState } from "@/components/States";
import type { DriftEvent, Scan, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

interface FeedItem {
  ts: string;
  kind: "drift" | "resolved" | "scan" | "scan_failed";
  title: string;
  detail: string;
  href: string;
  severity?: Severity;
}

function buildFeed(drifts: DriftEvent[], scans: Scan[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const d of drifts) {
    items.push({
      ts: d.first_seen_at,
      kind: "drift",
      title: `Drift detected — ${d.resource_address}`,
      detail: `${d.severity.toLowerCase()} · ${d.environment}/${d.region}`,
      href: `/drifts/${d.id}`,
      severity: d.severity,
    });
    if (d.resolved_at) {
      items.push({
        ts: d.resolved_at,
        kind: "resolved",
        title: `Drift resolved — ${d.resource_address}`,
        detail: "Terraform desired state restored",
        href: `/drifts/${d.id}`,
      });
    }
  }
  for (const s of scans) {
    items.push({
      ts: s.completed_at ?? s.started_at,
      kind: s.status === "FAILED" ? "scan_failed" : "scan",
      title:
        s.status === "FAILED"
          ? `Scan failed — ${s.id.slice(0, 8)}`
          : `Scan completed — ${s.drift_detected} drift detected`,
      detail: `${s.environment} · commit ${s.commit_sha.slice(0, 7)} · tf ${s.terraform_version ?? "?"}`,
      href: `/scans/${s.id}`,
    });
  }
  return items.sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
}

const KIND_ICON = {
  drift: Radar,
  resolved: CheckCircle2,
  scan: ScanLine,
  scan_failed: AlertTriangle,
  pr: GitPullRequest,
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fmt = (x: Date) => x.toDateString();
  if (fmt(d) === fmt(today)) return "Today";
  if (fmt(d) === fmt(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export default async function TimelinePage() {
  const [drifts, scans] = await Promise.all([
    api.drifts({ limit: "100" }).catch(() => null),
    api.scans().catch(() => null),
  ]);
  if (!drifts || !scans) {
    return <ErrorState detail="Couldn't load the event feed." />;
  }

  const feed = buildFeed(drifts.items, scans.items);
  let lastDay = "";

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Timeline</h1>
        <span className="text-[12px] text-faint">
          infrastructure events across all drift and scans
        </span>
      </div>

      {feed.length === 0 ? (
        <Section>
          <EmptyState
            title="No infrastructure events yet"
            hint="Scans and drift detections appear here as they happen."
          />
        </Section>
      ) : (
        <div>
          {feed.map((f, i) => {
            const day = dayLabel(f.ts);
            const header =
              day !== lastDay ? (
                <h2 className="pb-1 pt-4 text-[10px] font-medium uppercase tracking-widest text-faint">
                  {day}
                </h2>
              ) : null;
            lastDay = day;
            const Icon = KIND_ICON[f.kind];
            return (
              <div key={i}>
                {header}
                <Link
                  href={f.href}
                  className="group flex items-center gap-3 rounded-md border-b border-border px-2 py-2.5 transition-colors hover:bg-hover"
                >
                  {f.severity ? (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${severityDot(f.severity)}`}
                      aria-hidden
                    />
                  ) : (
                    <Icon
                      size={13}
                      className={`shrink-0 ${
                        f.kind === "resolved"
                          ? "text-resolved"
                          : f.kind === "scan_failed"
                            ? "text-critical"
                            : "text-faint"
                      }`}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text">
                    {f.title}
                  </span>
                  <span className="hidden truncate text-[11px] text-faint md:block">
                    {f.detail}
                  </span>
                  <span
                    className="w-[70px] shrink-0 text-right text-[11px] text-faint"
                    title={shortTime(f.ts)}
                  >
                    {relativeTime(f.ts)}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
