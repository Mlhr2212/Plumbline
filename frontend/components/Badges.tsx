import type { DriftStatus, Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "bg-red-900/60 text-red-300 border-red-700",
  HIGH: "bg-red-900/40 text-red-300 border-red-800",
  MEDIUM: "bg-amber-900/40 text-amber-300 border-amber-800",
  LOW: "bg-sky-900/40 text-sky-300 border-sky-800",
  INFO: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_STYLES: Record<DriftStatus, string> = {
  OPEN: "bg-red-900/40 text-red-300 border-red-800",
  ACKNOWLEDGED: "bg-sky-900/40 text-sky-300 border-sky-800",
  REMEDIATION_REQUESTED: "bg-violet-900/40 text-violet-300 border-violet-800",
  RECONCILING: "bg-violet-900/40 text-violet-300 border-violet-800",
  RESOLVED: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  ACCEPTED: "bg-zinc-800 text-zinc-300 border-zinc-700",
  IGNORED: "bg-zinc-800 text-zinc-400 border-zinc-700",
  SUPERSEDED: "bg-zinc-800 text-zinc-500 border-zinc-700",
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
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
      {score !== undefined && (
        <span className="font-normal opacity-80">{score}</span>
      )}
    </span>
  );
}

export function StatusPill({ status }: { status: DriftStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[#232c38] bg-[#11161d] ${className}`}
    >
      {title && (
        <h3 className="border-b border-[#232c38] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#8b98a9]">
          {title}
        </h3>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
