import type { DriftStatus, Severity } from "@/lib/types";

// Severity = colored dot + word. Never color alone, never a loud badge.
const SEVERITY_DOT: Record<Severity, string> = {
  CRITICAL: "bg-critical",
  HIGH: "bg-high",
  MEDIUM: "bg-medium",
  LOW: "bg-low",
  INFO: "bg-info",
};
const SEVERITY_TEXT: Record<Severity, string> = {
  CRITICAL: "text-critical",
  HIGH: "text-high",
  MEDIUM: "text-medium",
  LOW: "text-low",
  INFO: "text-info",
};

export function severityDot(sev: Severity) {
  return SEVERITY_DOT[sev];
}
export function severityText(sev: Severity) {
  return SEVERITY_TEXT[sev];
}

export function SeverityBadge({
  severity,
  score,
}: {
  severity: Severity;
  score?: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${SEVERITY_TEXT[severity]}`}
      title={score !== undefined ? `Risk score ${score}/100` : undefined}
    >
      <span
        className={`h-2 w-2 rounded-full ${SEVERITY_DOT[severity]}`}
        aria-hidden
      />
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
      {score !== undefined && (
        <span className="font-normal text-faint">{score}</span>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<DriftStatus, { text: string; dot: string }> = {
  OPEN: { text: "text-critical", dot: "bg-critical" },
  ACKNOWLEDGED: { text: "text-low", dot: "bg-low" },
  REMEDIATION_REQUESTED: { text: "text-reconcile", dot: "bg-reconcile" },
  RECONCILING: { text: "text-reconcile", dot: "bg-reconcile" },
  RESOLVED: { text: "text-resolved", dot: "bg-resolved" },
  ACCEPTED: { text: "text-muted", dot: "bg-muted" },
  IGNORED: { text: "text-faint", dot: "bg-faint" },
  SUPERSEDED: { text: "text-faint", dot: "bg-border-strong" },
};

export function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

export function StatusPill({ status }: { status: DriftStatus }) {
  const s = STATUS_STYLES[status] ?? {
    text: "text-muted",
    dot: "bg-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] font-medium ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

// Section — a bordered surface, not a decorative card. Titles are quiet,
// uppercase micro-labels like GitHub/Datadog section headers.
export function Section({
  title,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-md border border-border bg-panel ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted">
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className={padded ? "px-4 py-3" : ""}>{children}</div>
    </section>
  );
}
