"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  GitPullRequest,
  X,
} from "lucide-react";
import type { DriftEvent, RemediationPreview } from "@/lib/types";
import { severityText } from "@/components/Badges";

/** Full-height slide-over — a serious change-review surface, not a card. */
export default function RemediationPanel({
  drift,
  preview,
  onClose,
}: {
  drift: DriftEvent;
  preview: RemediationPreview;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    pr?: string | null;
  } | null>(null);

  const reconcile = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/drifts/${drift.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "terraform_desired_state" }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.ok) {
        setResult({
          ok: true,
          text: `Reconciliation proposed — ${String(data.strategy ?? "terraform_desired_state")}. A human reviews it before anything applies.`,
          pr: (data.pr_url as string) ?? null,
        });
        setConfirming(false);
        router.refresh();
      } else {
        setResult({
          ok: false,
          text:
            res.status === 409
              ? "This drift is no longer actionable — it may already be resolved. A fresh scan will confirm."
              : String(data.detail ?? `Request failed (${res.status})`),
        });
      }
    } catch {
      setResult({ ok: false, text: "Could not reach the API." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Remediation preview"
    >
      <aside
        className="flex h-full w-full max-w-[420px] flex-col border-l border-border-strong bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-text">
            Remediation preview
          </h2>
          <button
            onClick={onClose}
            aria-label="Close remediation preview"
            className="rounded p-1 text-faint transition-colors hover:bg-hover hover:text-text"
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[12px]">
          {/* Expected terraform action */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-faint">
              Expected Terraform action
            </p>
            <div className="flex flex-wrap gap-1.5">
              {preview.terraform_actions.map((a) => (
                <span
                  key={a}
                  className="mono rounded-sm border border-border bg-bg px-1.5 py-0.5 text-[11px] text-muted"
                >
                  ~ {a}
                </span>
              ))}
            </div>
            <p className="mono mt-2 text-[11px] text-muted">
              {preview.resources_modified} modified ·{" "}
              {preview.resources_destroyed} destroyed ·{" "}
              {preview.resources_replaced} replaced
            </p>
          </div>

          {/* Security posture */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-faint">
              Security posture
            </p>
            <div className="flex items-center gap-3">
              <span className={`text-[13px] font-medium ${severityText(preview.risk_before)}`}>
                {preview.risk_before}
              </span>
              <ArrowRight size={13} className="text-faint" />
              <span className={`text-[13px] font-medium ${severityText(preview.risk_after)}`}>
                {preview.risk_after}
              </span>
            </div>
          </div>

          {/* Impact */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-faint">
              Known impact
            </p>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-faint">Dependent resources</dt>
                <dd className="text-text">{preview.known_dependents}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint">Downtime</dt>
                <dd className="text-text">
                  {preview.downtime_expected
                    ? "downtime indicators detected"
                    : "no downtime indicators"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint">Preview confidence</dt>
                <dd className="text-text">
                  {Math.round(preview.confidence * 100)}%
                </dd>
              </div>
            </dl>
          </div>

          {/* Why */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-faint">
              Assessment
            </p>
            <ul className="space-y-1.5">
              {preview.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 leading-relaxed text-muted">
                  <CheckCircle2
                    size={12}
                    className="mt-0.5 shrink-0 text-healthy"
                  />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {result && (
            <div
              className={`rounded-md border px-3 py-2.5 leading-relaxed ${
                result.ok
                  ? "border-healthy/30 bg-healthy/5 text-healthy"
                  : "border-critical/30 bg-critical/5 text-critical"
              }`}
            >
              {result.text}
              {result.pr && (
                <a
                  href={result.pr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 underline"
                >
                  <GitPullRequest size={12} /> Open pull request
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer action — meaningful confirmation, not "are you sure?" */}
        <footer className="border-t border-border px-4 py-3">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={drift.status === "RESOLVED"}
              className="w-full rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Request reconciliation
            </button>
          ) : (
            <div className="rounded-md border border-border-strong bg-bg p-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-faint">
                Confirm reconciliation
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Terraform will revert{" "}
                <span className="text-text">
                  {drift.attribute_diffs.length} unauthorized change
                  {drift.attribute_diffs.length === 1 ? "" : "s"}
                </span>{" "}
                on <span className="mono text-text">{drift.resource_address}</span>{" "}
                (<span className="mono">{drift.environment}</span>) via an{" "}
                {preview.terraform_actions.join("/")} action. A reviewable
                proposal is created — nothing applies automatically.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-text"
                >
                  Cancel
                </button>
                <button
                  onClick={reconcile}
                  disabled={busy}
                  className="flex-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {busy ? "Requesting…" : "Confirm"}
                </button>
              </div>
            </div>
          )}
          {!preview.eligible_for_auto && (
            <p className="mt-2 text-center text-[10px] text-faint">
              Not eligible for automatic remediation — human review required.
            </p>
          )}
        </footer>
      </aside>
    </div>
  );
}
