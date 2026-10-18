"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { DriftStatus } from "@/lib/types";

const TERMINAL: DriftStatus[] = [
  "RESOLVED",
  "SUPERSEDED",
  "ACCEPTED",
  "IGNORED",
];

export default function ActionButtons({
  driftId,
  status,
}: {
  driftId: string;
  status: DriftStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  if (TERMINAL.includes(status)) {
    return (
      <p className="text-[13px] text-[#8a94a3]">
        This event is{" "}
        <span className="font-medium">
          {status.toLowerCase().replace(/_/g, " ")}
        </span>{" "}
        — no actions available.
      </p>
    );
  }

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(`/api/drifts/${driftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, msg: "Done — refreshing." });
        router.refresh();
      } else {
        setResult({
          ok: false,
          msg: (data as { detail?: string })?.detail ?? `failed (${res.status})`,
        });
      }
    } catch {
      setResult({ ok: false, msg: "Network error — API unreachable." });
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50";

  return (
    <div className="space-y-2.5">
      <button
        disabled={busy !== null}
        onClick={() =>
          act("reconcile", { strategy: "RESTORE_DESIRED", create_pr: false })
        }
        className={`${btn} w-full bg-[#17202b] text-white hover:bg-[#2a3542]`}
      >
        {busy === "reconcile" && <Loader2 size={13} className="animate-spin" />}
        Propose reconciliation
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy !== null}
          onClick={() =>
            act("accept", { strategy: "ACCEPT_DRIFT", create_pr: true })
          }
          className={`${btn} border border-[#d8dde3] text-[#17202b] hover:bg-[#f2f4f7]`}
        >
          {busy === "accept" && (
            <Loader2 size={13} className="animate-spin" />
          )}
          Accept drift → PR
        </button>
        <button
          disabled={busy !== null}
          onClick={() => act("acknowledge")}
          className={`${btn} border border-[#d8dde3] text-[#17202b] hover:bg-[#f2f4f7]`}
        >
          {busy === "acknowledge" && (
            <Loader2 size={13} className="animate-spin" />
          )}
          Acknowledge
        </button>
      </div>
      <button
        disabled={busy !== null}
        onClick={() => act("ignore", {})}
        className={`${btn} w-full text-[#8a94a3] hover:bg-[#f2f4f7] hover:text-[#5c6675]`}
      >
        {busy === "ignore" && <Loader2 size={13} className="animate-spin" />}
        Dismiss (ignore)
      </button>

      {result && (
        <p
          className={`flex items-center gap-1.5 text-[12px] ${
            result.ok ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 size={13} />
          ) : (
            <XCircle size={13} />
          )}
          {result.msg}
        </p>
      )}
    </div>
  );
}
