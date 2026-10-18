import type { DriftStatus, Severity } from "@/lib/types";

// Severity renders as a quiet colored dot + label — product convention,
// not a loud badge. Score sits muted beside it.
const SEVERITY_DOT: Record<Severity, string> = {
  CRITICAL: "bg-red-600",
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-sky-500",
  INFO: "bg-zinc-400",
};
const SEVERITY_TEXT: Record<Severity, string> = {
  CRITICAL: "text-red-700",
  HIGH: "text-red-600",
  MEDIUM: "text-amber-700",
  LOW: "text-sky-700",
  INFO: "text-zinc-500",
};

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
      title={`Risk score ${score ?? "—"}/100`}
    >
      <span
        className={`h-2 w-2 rounded-full ${SEVERITY_DOT[severity]}`}
        aria-hidden
      />
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
      {score !== undefined && (
        <span className="font-normal text-[#8a94a3]">{score}</span>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<DriftStatus, { text: string; dot: string }> = {
  OPEN: { text: "text-red-700", dot: "bg-red-500" },
  ACKNOWLEDGED: { text: "text-sky-700", dot: "bg-sky-500" },
  REMEDIATION_REQUESTED: { text: "text-violet-700", dot: "bg-violet-500" },
  RECONCILING: { text: "text-violet-700", dot: "bg-violet-500" },
  RESOLVED: { text: "text-emerald-700", dot: "bg-emerald-500" },
  ACCEPTED: { text: "text-zinc-600", dot: "bg-zinc-400" },
  IGNORED: { text: "text-zinc-500", dot: "bg-zinc-400" },
  SUPERSEDED: { text: "text-zinc-400", dot: "bg-zinc-300" },
};

export function StatusPill({ status }: { status: DriftStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#e5e8ec] bg-white px-2.5 py-0.5 text-xs font-medium ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#e5e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-3">
          <h3 className="text-[13px] font-semibold text-[#17202b]">{title}</h3>
          {action}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
