"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  GitPullRequest,
  LayoutDashboard,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  ScrollText,
  Settings,
  History,
} from "lucide-react";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 ${collapsed ? "justify-center px-0" : "px-1"}`}
      aria-label="PlumbLine home"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <line x1="12" y1="2" x2="12" y2="14" stroke="#5b8df5" strokeWidth="2" />
        <path d="M12 14 L7.5 21 L16.5 21 Z" fill="#5b8df5" />
        <line x1="4" y1="21" x2="20" y2="21" stroke="#2d4a8a" strokeWidth="1.5" />
      </svg>
      {!collapsed && (
        <span className="text-[14px] font-semibold tracking-tight text-text">
          PlumbLine
        </span>
      )}
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/drifts", label: "Drift", icon: Radar },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/scans", label: "Scans", icon: ScrollText },
  { href: "/reconciliations", label: "Reconciliations", icon: GitPullRequest },
  { href: "/infrastructure", label: "Infrastructure", icon: Layers },
];

export default function Sidebar({
  collapsed,
  onToggle,
  apiOk,
  environment,
}: {
  collapsed: boolean;
  onToggle: () => void;
  apiOk: boolean;
  environment: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-nav transition-[width] duration-150 ${
        collapsed ? "w-[52px]" : "w-[216px]"
      }`}
    >
      <div className={`px-3 pb-3 pt-4 ${collapsed ? "px-0" : ""}`}>
        <Logo collapsed={collapsed} />
      </div>

      {/* Environment context — what you're looking at. Single env today,
          rendered as a chip, not a pretend selector. */}
      {!collapsed && (
        <div className="mx-3 mb-3 flex items-center justify-between rounded-md border border-border bg-panel px-2.5 py-1.5">
          <span className="mono text-[11px] text-muted">{environment}</span>
          <span className="mono text-[10px] text-faint">us-east-2</span>
        </div>
      )}

      <nav className="flex-1 space-y-px px-2" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] transition-colors ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-selected font-medium text-text"
                  : "text-muted hover:bg-hover hover:text-text"
              }`}
            >
              <Icon
                size={15}
                strokeWidth={1.8}
                className={active ? "text-accent" : "text-faint"}
              />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] text-muted transition-colors hover:bg-hover hover:text-text ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <Settings size={15} strokeWidth={1.8} className="text-faint" />
          {!collapsed && "Settings"}
        </Link>
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] text-muted transition-colors hover:bg-hover hover:text-text ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} strokeWidth={1.8} />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.8} />
          )}
          {!collapsed && "Collapse"}
        </button>

        {/* Connection health */}
        <div
          className={`flex items-center gap-2 px-2.5 pb-1 pt-2 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span
            className={`relative flex h-2 w-2 shrink-0 ${collapsed ? "" : ""}`}
            aria-hidden
          >
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                apiOk ? "bg-healthy" : "bg-critical"
              } opacity-60 ${apiOk ? "animate-ping" : ""}`}
              style={{ animationDuration: "2.4s" }}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                apiOk ? "bg-healthy" : "bg-critical"
              }`}
            />
          </span>
          {!collapsed && (
            <span className="text-[11px] text-muted">
              <Activity size={11} className="mr-1 inline text-faint" />
              {apiOk ? "API connected" : "API unreachable"}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
