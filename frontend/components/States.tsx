import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox } from "lucide-react";

/** Understated empty state — says what, why, and what to do. No confetti. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Icon size={18} className="text-faint" strokeWidth={1.6} />
      <p className="mt-3 text-[13px] font-medium text-muted">{title}</p>
      {hint && (
        <p className="mt-1 max-w-[380px] text-[12px] leading-relaxed text-faint">
          {hint}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-4 rounded-md border border-border bg-elevated px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:border-border-strong"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Operational failure state — specific, not "something went wrong". */
export function ErrorState({
  title = "Backend unavailable",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-critical/30 bg-critical/5 px-4 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />
        <div>
          <p className="text-[13px] font-medium text-text">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {detail ??
              "The PlumbLine API did not respond. Check that the backend is running and reachable, then retry."}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Skeleton block matching real content dimensions. */
export function Skeleton({
  className = "",
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={`animate-pulse space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 rounded bg-elevated"
          style={{ width: `${88 - i * 14}%` }}
        />
      ))}
    </div>
  );
}
