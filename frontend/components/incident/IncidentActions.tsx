"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  EyeOff,
  Link2,
  MoreHorizontal,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { DriftStatus } from "@/lib/types";

/** Header actions: primary remediation review + quiet overflow menu. */
export default function IncidentActions({
  driftId,
  status,
  onOpenRemediation,
}: {
  driftId: string;
  status: DriftStatus;
  onOpenRemediation: () => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const actionable =
    status === "OPEN" ||
    status === "ACKNOWLEDGED" ||
    status === "REMEDIATION_REQUESTED";

  const act = async (action: string) => {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch(`/api/drifts/${driftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setNotice(
          action === "acknowledge"
            ? "Marked as investigating."
            : `Drift ${action}ed.`,
        );
        router.refresh();
      } else {
        const d = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        setNotice(
          res.status === 409
            ? "No longer actionable — drift state changed."
            : String(d.detail ?? `Failed (${res.status})`),
        );
      }
    } catch {
      setNotice("API unreachable.");
    } finally {
      setBusy(null);
      setMenu(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
    setMenu(false);
  };

  return (
    <div className="flex items-center gap-2">
      {actionable && (
        <button
          onClick={onOpenRemediation}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90"
        >
          <Wrench size={13} /> Review remediation
        </button>
      )}

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label="More actions"
          className="rounded-md border border-border bg-panel p-1.5 text-muted transition-colors hover:text-text"
        >
          <MoreHorizontal size={15} />
        </button>
        {menu && (
          <div className="absolute right-0 top-full z-30 mt-1 w-[210px] rounded-md border border-border-strong bg-elevated py-1 shadow-xl">
            {status === "OPEN" && (
              <button
                onClick={() => act("acknowledge")}
                disabled={busy !== null}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
              >
                <ShieldCheck size={13} /> Mark investigating
              </button>
            )}
            {actionable && (
              <>
                <button
                  onClick={() => act("accept")}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
                >
                  <Check size={13} /> Accept drift
                </button>
                <button
                  onClick={() => act("ignore")}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
                >
                  <EyeOff size={13} /> Ignore
                </button>
              </>
            )}
            <button
              onClick={copyLink}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
            >
              {copied ? (
                <Check size={13} className="text-healthy" />
              ) : (
                <Link2 size={13} />
              )}
              {copied ? "Copied" : "Copy incident link"}
            </button>
          </div>
        )}
      </div>
      {notice && (
        <span className="text-[11px] text-muted" role="status">
          {notice}
        </span>
      )}
    </div>
  );
}

export function CopyAddr({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="rounded p-0.5 text-faint transition-colors hover:text-text"
      aria-label={`Copy ${value}`}
      title="Copy"
    >
      {copied ? (
        <Check size={12} className="text-healthy" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}
