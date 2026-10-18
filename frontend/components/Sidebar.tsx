import Link from "next/link";
import { LayoutDashboard, Radar, ScrollText } from "lucide-react";
import ApiStatus from "./ApiStatus";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      {/* plumb bob mark */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <line x1="12" y1="2" x2="12" y2="14" stroke="#2563eb" strokeWidth="2" />
        <path d="M12 14 L7.5 21 L16.5 21 Z" fill="#2563eb" />
        <line x1="4" y1="21" x2="20" y2="21" stroke="#c7d7fb" strokeWidth="1.5" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        PlumbLine
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/drifts", label: "Drift events", icon: Radar },
  { href: "/scans", label: "Scans", icon: ScrollText },
];

export default function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col border-r border-[#e5e8ec] bg-white">
      <div className="px-5 pb-6 pt-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-[#5c6675] transition-colors hover:bg-[#f2f4f7] hover:text-[#17202b]"
          >
            <Icon size={15} strokeWidth={1.8} className="text-[#8a94a3]" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-[#eef0f3] px-5 py-4">
        <ApiStatus />
        <p className="mt-2 text-[11px] text-[#8a94a3]">
          sandbox · us-east-2
        </p>
      </div>
    </aside>
  );
}
