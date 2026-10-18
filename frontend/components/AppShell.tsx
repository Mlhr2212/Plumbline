"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import type { Overview } from "@/lib/types";

interface ShellState {
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
}

const ShellContext = createContext<ShellState>({
  focusMode: false,
  setFocusMode: () => {},
});

export function useShell() {
  return useContext(ShellContext);
}

export default function AppShell({
  children,
  overview,
  apiOk,
}: {
  children: React.ReactNode;
  overview: Overview | null;
  apiOk: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore sidebar preference locally.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("plumbline:sidebar") === "1");
    } catch {
      /* private mode */
    }
  }, []);
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("plumbline:sidebar", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  // Global keyboard: ⌘K / Ctrl+K opens the palette, Esc exits focus mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const env = overview?.environment ?? "sandbox";
  const lastScan = overview?.last_scan ?? null;

  return (
    <ShellContext.Provider value={{ focusMode, setFocusMode }}>
      <div className="flex min-h-screen">
        {!focusMode && (
          <Sidebar
            collapsed={collapsed}
            onToggle={toggleSidebar}
            apiOk={apiOk}
            environment={env}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!focusMode && (
            <TopBar
              lastScan={lastScan}
              onOpenPalette={() => setPaletteOpen(true)}
              onToggleSidebar={toggleSidebar}
            />
          )}
          <main
            className={`min-w-0 flex-1 ${
              focusMode ? "bg-bg" : ""
            }`}
          >
            <div
              className={`mx-auto px-6 py-6 ${
                focusMode ? "max-w-[1440px]" : "max-w-[1200px]"
              }`}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      )}
    </ShellContext.Provider>
  );
}
