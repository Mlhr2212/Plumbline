"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ExternalLink,
  FileText,
  GitPullRequest,
  LayoutDashboard,
  Layers,
  Radar,
  ScrollText,
  History,
  Search,
  Settings,
  ShieldAlert,
} from "lucide-react";
import type { Severity } from "@/lib/types";

interface DriftHit {
  id: string;
  resource_address: string;
  resource_type: string;
  severity: Severity;
  status: string;
  environment: string;
  region: string;
  summary: string;
  risk_score: number;
}
interface ScanHit {
  id: string;
  status: string;
  environment: string;
  commit_sha: string;
  started_at: string;
  drift_detected: number;
}
interface Index {
  drifts: DriftHit[];
  scans: ScanHit[];
  unavailable?: boolean;
}

interface Item {
  id: string;
  group: string;
  icon: React.ElementType;
  title: string;
  detail?: string;
  mono?: boolean;
  onSelect: () => void;
}

const GH_ACTIONS =
  "https://github.com/Mlhr2212/Plumbline/actions/workflows/drift-scan.yml";

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lazy-load the real search index the first time the palette opens.
  useEffect(() => {
    inputRef.current?.focus();
    let alive = true;
    fetch("/api/search-index")
      .then((r) => r.json())
      .then((d: Index) => alive && setIndex(d))
      .catch(() => alive && setIndex({ drifts: [], scans: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Item[] = [];

    const pages: [string, string, React.ElementType][] = [
      ["Overview", "/", LayoutDashboard],
      ["Drift", "/drifts", Radar],
      ["Timeline", "/timeline", History],
      ["Scans", "/scans", ScrollText],
      ["Reconciliations", "/reconciliations", GitPullRequest],
      ["Infrastructure", "/infrastructure", Layers],
      ["Settings", "/settings", Settings],
    ];
    for (const [label, href, icon] of pages) {
      if (!q || label.toLowerCase().includes(q) || href.includes(q)) {
        out.push({
          id: `page-${href}`,
          group: "Go to",
          icon,
          title: `Go to ${label}`,
          onSelect: () => go(href),
        });
      }
    }

    if (!q || "scan".includes(q) || "run".includes(q)) {
      out.push({
        id: "action-scan",
        group: "Actions",
        icon: Activity,
        title: "Run new scan",
        detail: "Opens GitHub Actions workflow_dispatch",
        onSelect: () => {
          onClose();
          window.open(GH_ACTIONS, "_blank", "noopener");
        },
      });
    }

    if (index) {
      const match = (d: DriftHit) =>
        !q ||
        [
          d.resource_address,
          d.id,
          d.resource_type,
          d.severity,
          d.status,
          d.environment,
          d.region,
          d.summary,
        ]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q));

      const hits = index.drifts.filter(match);
      const openFirst = hits.find(
        (d) => d.status === "OPEN" || d.status === "ACKNOWLEDGED",
      );
      if (!q && openFirst) {
        out.push({
          id: "action-open-critical",
          group: "Actions",
          icon: ShieldAlert,
          title: "Open most recent unresolved drift",
          detail: openFirst.resource_address,
          onSelect: () => go(`/drifts/${openFirst.id}`),
        });
      }
      const latest = index.scans[0];
      if (!q && latest) {
        out.push({
          id: "action-latest-scan",
          group: "Actions",
          icon: ScrollText,
          title: "Open latest scan",
          detail: latest.id.slice(0, 8),
          onSelect: () => go(`/scans/${latest.id}`),
        });
      }

      for (const d of hits.slice(0, 8)) {
        out.push({
          id: `drift-${d.id}`,
          group: "Drift events",
          icon: Radar,
          title: d.resource_address,
          detail: `${d.severity.toLowerCase()} · ${d.status.toLowerCase().replace(/_/g, " ")} · ${d.summary}`,
          mono: true,
          onSelect: () => go(`/drifts/${d.id}`),
        });
      }
      for (const s of index.scans
        .filter(
          (s) =>
            !q ||
            s.id.toLowerCase().includes(q) ||
            s.commit_sha.toLowerCase().includes(q) ||
            s.status.toLowerCase().includes(q),
        )
        .slice(0, 4)) {
        out.push({
          id: `scan-${s.id}`,
          group: "Scans",
          icon: FileText,
          title: `Scan ${s.id.slice(0, 8)}`,
          detail: `${s.status.toLowerCase()} · ${s.drift_detected} detected`,
          mono: true,
          onSelect: () => go(`/scans/${s.id}`),
        });
      }
    }
    return out.slice(0, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, index]);

  useEffect(() => setCursor(0), [query]);

  // Scroll the cursor row into view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[cursor]?.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-border-strong bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search size={15} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search resources, drift events, scans — or type a command"
            className="h-11 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div
          id="palette-list"
          ref={listRef}
          className="max-h-[340px] overflow-y-auto py-1.5"
          role="listbox"
        >
          {items.map((it, i) => {
            const header =
              it.group !== lastGroup ? (
                <div className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-widest text-faint">
                  {it.group}
                </div>
              ) : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <div key={it.id}>
                {header}
                <button
                  data-idx={i}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={it.onSelect}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    i === cursor ? "bg-selected" : ""
                  }`}
                >
                  <Icon size={14} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13px] text-text ${it.mono ? "mono" : ""}`}
                    >
                      {it.title}
                    </span>
                    {it.detail && (
                      <span className="block truncate text-[11px] text-faint">
                        {it.detail}
                      </span>
                    )}
                  </span>
                  {i === cursor && (
                    <ArrowRight size={13} className="shrink-0 text-faint" />
                  )}
                </button>
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-[12px] text-faint">
              Nothing matches{index?.unavailable ? " — API unreachable" : ""}.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-faint">
          <span>
            <kbd className="kbd">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="kbd">↵</kbd> open
          </span>
          <span>
            <kbd className="kbd">esc</kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1">
            <ExternalLink size={10} />
            real data — no fixtures
          </span>
        </div>
      </div>
    </div>
  );
}
