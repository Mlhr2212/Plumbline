"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  ArrowUpRight,
  ChevronDown,
  Rows3,
  Search,
  X,
} from "lucide-react";
import type { DriftEvent, DriftStatus, Severity } from "@/lib/types";
import { listSummary, relativeTime } from "@/lib/format";
import {
  Section,
  SeverityBadge,
  StatusPill,
  severityDot,
  statusLabel,
} from "@/components/Badges";
import { EmptyState } from "@/components/States";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const STATUSES: DriftStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "REMEDIATION_REQUESTED",
  "RECONCILING",
  "RESOLVED",
  "ACCEPTED",
  "IGNORED",
  "SUPERSEDED",
];
const SEV_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

type SortKey = "severity" | "resource" | "detected" | "status" | "score";

/* Small dropdown for filter selection — outside click + Esc close. */
function FilterSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: React.ReactNode }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
          selected.size
            ? "border-accent-border bg-accent-soft text-text"
            : "border-border bg-panel text-muted hover:text-text"
        }`}
      >
        {label}
        {selected.size > 0 && (
          <span className="rounded-sm bg-accent px-1 text-[10px] font-medium text-white">
            {selected.size}
          </span>
        )}
        <ChevronDown size={12} className="text-faint" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-border-strong bg-elevated py-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onToggle(o.value)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[10px] ${
                  selected.has(o.value)
                    ? "border-accent bg-accent text-white"
                    : "border-border-strong"
                }`}
              >
                {selected.has(o.value) ? "✓" : ""}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DriftExplorer({ items }: { items: DriftEvent[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [sevSel, setSevSel] = useState<Set<string>>(
    () => new Set(searchParams.get("severity")?.split(",") ?? []),
  );
  const [statusSel, setStatusSel] = useState<Set<string>>(
    () => new Set(searchParams.get("status")?.split(",") ?? []),
  );
  const [serviceSel, setServiceSel] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("detected");
  const [sortAsc, setSortAsc] = useState(false);
  const [dense, setDense] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const services = useMemo(
    () => [...new Set(items.map((d) => d.aws_service))].sort(),
    [items],
  );

  // "/" focuses search — devtool convention.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items.filter((d) => {
      if (sevSel.size && !sevSel.has(d.severity)) return false;
      if (statusSel.size && !statusSel.has(d.status)) return false;
      if (serviceSel.size && !serviceSel.has(d.aws_service)) return false;
      if (!q) return true;
      return [
        d.resource_address,
        d.resource_type,
        d.id,
        d.aws_service,
        d.environment,
        d.region,
        d.aws_account_id,
        listSummary(d),
        d.cloudtrail_attribution?.actor ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const dir = sortAsc ? 1 : -1;
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case "severity":
          return (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) * -dir;
        case "resource":
          return a.resource_address.localeCompare(b.resource_address) * dir;
        case "detected":
          return (
            (new Date(a.first_seen_at).getTime() -
              new Date(b.first_seen_at).getTime()) *
            dir
          );
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "score":
          return (a.risk_score - b.risk_score) * dir;
        default:
          return 0;
      }
    });
    return out;
  }, [items, query, sevSel, statusSel, serviceSel, sortKey, sortAsc]);

  const selected = rows.find((d) => d.id === selId) ?? null;
  const selIdx = rows.findIndex((d) => d.id === selId);

  const toggle = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    apply(n);
  };

  const sort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(false);
    }
  };

  const activeFilters =
    sevSel.size + statusSel.size + serviceSel.size + (query ? 1 : 0);

  const onRowKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? Math.min(selIdx + 1, rows.length - 1)
          : Math.max(selIdx - 1, 0);
      setSelId(rows[next]?.id ?? null);
    } else if (e.key === "Enter" && selected) {
      router.push(`/drifts/${selected.id}`);
    } else if (e.key === "Escape") {
      setSelId(null);
    }
  };

  const TH = ({ label, k, className = "" }: { label: string; k?: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-faint ${className}`}
    >
      {k ? (
        <button
          onClick={() => sort(k)}
          className={`inline-flex items-center gap-1 uppercase tracking-widest transition-colors hover:text-muted ${
            sortKey === k ? "text-muted" : ""
          }`}
        >
          {label}
          <ArrowUpDown
            size={10}
            className={sortKey === k ? "text-accent" : "opacity-40"}
          />
        </button>
      ) : (
        label
      )}
    </th>
  );

  const pad = dense ? "py-1" : "py-2";

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {/* Filter bar — compact, chips appear when active */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…  ( / )"
              aria-label="Filter drift events"
              className="h-7 w-[220px] rounded-md border border-border bg-panel pl-7 pr-2 text-[12px] text-text outline-none placeholder:text-faint focus:border-accent-border"
            />
          </div>
          <FilterSelect
            label="Severity"
            selected={sevSel}
            onToggle={(v) => toggle(sevSel, v, setSevSel)}
            options={SEVERITIES.map((s) => ({
              value: s,
              label: (
                <span className="flex items-center gap-2 capitalize">
                  <span className={`h-2 w-2 rounded-full ${severityDot(s)}`} />
                  {s.toLowerCase()}
                </span>
              ),
            }))}
          />
          <FilterSelect
            label="Status"
            selected={statusSel}
            onToggle={(v) => toggle(statusSel, v, setStatusSel)}
            options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          />
          {services.length > 1 && (
            <FilterSelect
              label="Service"
              selected={serviceSel}
              onToggle={(v) => toggle(serviceSel, v, setServiceSel)}
              options={services.map((s) => ({
                value: s,
                label: <span className="mono">{s}</span>,
              }))}
            />
          )}

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setQuery("");
                setSevSel(new Set());
                setStatusSel(new Set());
                setServiceSel(new Set());
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-faint transition-colors hover:text-text"
            >
              <X size={11} /> clear all
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-faint">
              {rows.length} of {items.length}
            </span>
            <button
              onClick={() => setDense(!dense)}
              title={dense ? "Comfortable rows" : "Dense rows"}
              aria-pressed={dense}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                dense
                  ? "border-accent-border bg-accent-soft text-text"
                  : "border-border text-faint hover:text-muted"
              }`}
            >
              <Rows3 size={12} /> {dense ? "dense" : "comfortable"}
            </button>
          </div>
        </div>

        {/* Table */}
        <Section padded={false}>
          <div className="overflow-x-auto">
            <table
              className="w-full text-left"
              onKeyDown={onRowKey}
              aria-label="Drift events"
            >
              <thead>
                <tr className="border-b border-border">
                  <TH label="Severity" k="severity" />
                  <TH label="Resource" k="resource" />
                  <TH label="Service" />
                  <TH label="Change" />
                  <TH label="Actor" />
                  <TH label="Detected" k="detected" />
                  <TH label="Status" k="status" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((d) => {
                  const sel = d.id === selId;
                  const actor = d.cloudtrail_attribution?.actor;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelId(sel ? null : d.id)}
                      aria-selected={sel}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && router.push(`/drifts/${d.id}`)}
                      className={`cursor-pointer transition-colors ${
                        sel ? "bg-selected" : "hover:bg-hover"
                      }`}
                    >
                      <td className={`px-3 ${pad}`}>
                        <SeverityBadge severity={d.severity} score={d.risk_score} />
                      </td>
                      <td className={`px-3 ${pad} max-w-[240px]`}>
                        <span className="mono block truncate text-[12px] text-text">
                          {d.resource_address}
                        </span>
                      </td>
                      <td className={`px-3 ${pad}`}>
                        <span className="mono text-[11px] text-muted">
                          {d.aws_service}
                        </span>
                      </td>
                      <td className={`px-3 ${pad} max-w-[260px]`}>
                        <span className="block truncate text-[12px] text-muted">
                          {listSummary(d)}
                        </span>
                      </td>
                      <td className={`px-3 ${pad}`}>
                        {actor ? (
                          <span className="mono block max-w-[140px] truncate text-[11px] text-muted">
                            {actor.split("/").pop()}
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint">—</span>
                        )}
                      </td>
                      <td className={`px-3 ${pad} whitespace-nowrap text-[11px] text-faint`}>
                        {relativeTime(d.first_seen_at)}
                      </td>
                      <td className={`px-3 ${pad}`}>
                        <StatusPill status={d.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <EmptyState
                icon={Search}
                title="No drift events match"
                hint="Try widening the filters or clearing the search."
              />
            )}
          </div>
        </Section>
        <p className="mt-2 text-[10px] text-faint">
          <kbd className="kbd">↑↓</kbd> move · <kbd className="kbd">↵</kbd> open
          · <kbd className="kbd">esc</kbd> deselect · click a row to inspect
        </p>
      </div>

      {/* ── Row inspector — rapid triage without navigation ── */}
      {selected && (
        <aside
          className="sticky top-[60px] w-[320px] shrink-0 rounded-md border border-border bg-panel"
          aria-label="Drift inspector"
        >
          <div className="flex items-start justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SeverityBadge
                  severity={selected.severity}
                  score={selected.risk_score}
                />
                <StatusPill status={selected.status} />
              </div>
              <p className="mono mt-1.5 truncate text-[13px] font-medium text-text">
                {selected.resource_address}
              </p>
            </div>
            <button
              onClick={() => setSelId(null)}
              aria-label="Close inspector"
              className="rounded p-1 text-faint transition-colors hover:bg-hover hover:text-text"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3.5 px-4 py-3.5 text-[12px]">
            <p className="leading-relaxed text-muted">{listSummary(selected)}</p>

            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Environment</dt>
                <dd className="mono text-text">
                  {selected.environment} · {selected.region}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Detected</dt>
                <dd className="text-text">
                  {relativeTime(selected.first_seen_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Actor</dt>
                <dd className="mono max-w-[180px] truncate text-text">
                  {selected.cloudtrail_attribution?.actor
                    ? selected.cloudtrail_attribution.actor
                    : "unknown"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Confidence</dt>
                <dd className="text-text">
                  {selected.cloudtrail_attribution?.confidence != null
                    ? `${Math.round(selected.cloudtrail_attribution.confidence * 100)}%`
                    : "—"}
                </dd>
              </div>
            </dl>

            {selected.risk_factors.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-faint">
                  Risk signals
                </p>
                <ul className="space-y-1">
                  {selected.risk_factors.slice(0, 3).map((f) => (
                    <li
                      key={f.rule_id}
                      className="flex items-baseline gap-2 text-[11px] text-muted"
                    >
                      <span className="mono shrink-0 text-medium">
                        +{f.score}
                      </span>
                      <span className="leading-snug">{f.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              href={`/drifts/${selected.id}`}
              className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90"
            >
              Open investigation <ArrowUpRight size={12} />
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
}
