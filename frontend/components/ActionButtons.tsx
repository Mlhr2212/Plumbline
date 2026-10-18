"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
      <p className="text-sm text-[#8b98a9]">
        This event is {status.toLowerCase().replace(/_/g, " ")} — no actions
        available.
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
        setResult({ ok: true, msg: `${action} succeeded` });
        router.refresh();
      } else {
        setResult({
          ok: false,
          msg: data?.detail ?? `failed (${res.status})`,
        });
      }
    } catch {
      setResult({ ok: false, msg: "network error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy !== null}
          onClick={() =>
            act("reconcile", {
              strategy: "RESTORE_DESIRED",
              create_pr: false,
            })
          }
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy === "reconcile" ? "Working…" : "Propose reconciliation"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() =>
            act("accept", { strategy: "ACCEPT_DRIFT", create_pr: true })
          }
          className="rounded border border-[#3a4656] px-4 py-2 text-sm text-[#c9d4e0] hover:bg-[#161d27] disabled:opacity-50"
        >
          {busy === "accept" ? "Working…" : "Accept drift (PR)"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => act("acknowledge")}
          className="rounded border border-[#3a4656] px-4 py-2 text-sm text-[#c9d4e0] hover:bg-[#161d27] disabled:opacity-50"
        >
          {busy === "acknowledge" ? "Working…" : "Acknowledge"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => act("ignore", {})}
          className="rounded border border-[#3a4656] px-4 py-2 text-sm text-zinc-500 hover:bg-[#161d27] disabled:opacity-50"
        >
          {busy === "ignore" ? "Working…" : "Ignore"}
        </button>
      </div>
      {result && (
        <p
          className={`text-xs ${result.ok ? "text-emerald-400" : "text-red-400"}`}
        >
          {result.msg}
        </p>
      )}
    </div>
  );
}
