"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { Overview } from "@/lib/types";

const LABELS: Record<string, string> = {
  drifts: "Drift",
  timeline: "Timeline",
  scans: "Scans",
  reconciliations: "Reconciliations",
  infrastructure: "Infrastructure",
  settings: "Settings",
};

function scanTone(status: string | undefined) {
  if (status === "COMPLETED") return "text-healthy";
  if (status === "FAILED") return "text-critical";
  return "text-medium";
}

export default function TopBar({
  lastScan,
  onOpenPalette,
}: {
  lastScan: Overview["last_scan"];
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-20 flex h-11 items-center gap-3 border-b border-border bg-nav/95 px-4 backdrop-blur-sm">
      {/* Breadcrumb */}
      <nav
        className="flex min-w-0 items-center gap-1 text-[12px] text-faint"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="transition-colors hover:text-muted">
          PlumbLine
        </Link>
        {segs.map((s, i) => {
          const href = "/" + segs.slice(0, i + 1).join("/");
          const last = i === segs.length - 1;
          const label = LABELS[s] ?? (s.length > 12 ? s.slice(0, 8) : s);
          return (
            <span key={href} className="flex items-center gap-1">
              <ChevronRight size={11} className="text-faint" />
              {last ? (
                <span className="text-muted">{label}</span>
              ) : (
                <Link
                  href={href}
                  className="transition-colors hover:text-muted"
                >
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Last scan status */}
      {lastScan && (
        <span className="hidden items-center gap-1.5 text-[11px] text-faint sm:flex">
          <span className={scanTone(lastScan.status)}>
            last scan {lastScan.status.toLowerCase()}
          </span>
          <span>·</span>
          <span>{relativeTime(lastScan.completed_at)}</span>
        </span>
      )}

      {/* Search trigger — opens ⌘K palette */}
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded-md border border-border bg-panel px-2.5 py-1 text-[12px] text-faint transition-colors hover:border-border-strong hover:text-muted"
        aria-label="Search and commands (Cmd+K)"
      >
        <Search size={13} />
        <span className="hidden md:inline">Search or command</span>
        <kbd className="kbd">⌘K</kbd>
      </button>
    </header>
  );
}
