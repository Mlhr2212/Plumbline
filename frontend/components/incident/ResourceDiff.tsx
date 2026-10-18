"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { AttributeDiff } from "@/lib/types";
import { fmtValue } from "@/lib/format";

type View = "structured" | "all" | "raw";

/* ── Security-group rule reconstruction ────────────────────────
   Leaf diffs arrive as `ingress[0].cidr_blocks[0]` etc. Group them
   back into per-rule views so the change reads like a firewall
   rule, not a JSON path. */
interface RuleField {
  field: string;
  before: unknown;
  after: unknown;
  change: string;
}
interface Rule {
  idx: string;
  direction: string;
  fields: RuleField[];
  allAdded: boolean;
  allRemoved: boolean;
}

const SG_FIELD_ORDER = [
  "protocol",
  "from_port",
  "to_port",
  "cidr_blocks",
  "ipv6_cidr_blocks",
  "prefix_list_ids",
  "security_groups",
  "self",
  "description",
];

function groupSgRules(diffs: AttributeDiff[]): Map<string, Rule> {
  const rules = new Map<string, Rule>();
  for (const d of diffs) {
    const m = d.path.match(/^(ingress|egress)\[(\d+)\]\.([^\[]+)/);
    if (!m) continue;
    const [, dir, idx, field] = m;
    const key = `${dir}[${idx}]`;
    if (!rules.has(key))
      rules.set(key, {
        idx,
        direction: dir,
        fields: [],
        allAdded: true,
        allRemoved: true,
      });
    const r = rules.get(key)!;
    // Merge list-element diffs (cidr_blocks[0], cidr_blocks[1]) into one field.
    const existing = r.fields.find((f) => f.field === field);
    if (existing) {
      if (d.change_type !== "removed")
        existing.after = Array.isArray(existing.after)
          ? [...existing.after, d.after]
          : [existing.after, d.after];
      if (d.change_type !== "added")
        existing.before = Array.isArray(existing.before)
          ? [...existing.before, d.before]
          : [existing.before, d.before];
    } else {
      r.fields.push({
        field,
        before: d.change_type === "added" ? null : d.before,
        after: d.change_type === "removed" ? null : d.after,
        change: d.change_type,
      });
    }
    if (d.change_type !== "added") r.allAdded = false;
    if (d.change_type !== "removed") r.allRemoved = false;
  }
  for (const r of rules.values()) {
    r.fields.sort(
      (a, b) =>
        SG_FIELD_ORDER.indexOf(a.field) - SG_FIELD_ORDER.indexOf(b.field),
    );
  }
  return rules;
}

function isPublicCidr(v: unknown): boolean {
  if (typeof v === "string") return v === "0.0.0.0/0" || v === "::/0";
  if (Array.isArray(v)) return v.some(isPublicCidr);
  return false;
}

function FieldLine({ f }: { f: RuleField }) {
  const publicAfter = f.field.includes("cidr") && isPublicCidr(f.after);
  const publicBefore = f.field.includes("cidr") && isPublicCidr(f.before);
  return (
    <div className="flex items-baseline gap-3 px-3 py-1">
      <span className="mono w-[140px] shrink-0 text-[11px] text-faint">
        {f.field}
      </span>
      <span className="mono min-w-0 flex-1 text-[12px]">
        {f.change === "modified" ? (
          <>
            <span
              className={`line-through decoration-critical/60 ${
                publicBefore ? "text-critical" : "text-muted"
              }`}
            >
              {fmtValue(f.before)}
            </span>
            <span className="mx-2 text-faint">→</span>
            <span className={publicAfter ? "font-medium text-critical" : "text-text"}>
              {fmtValue(f.after)}
            </span>
          </>
        ) : f.change === "added" ? (
          <span className={publicAfter ? "font-medium text-critical" : "text-healthy"}>
            + {fmtValue(f.after)}
          </span>
        ) : (
          <span className={publicBefore ? "text-critical" : "text-critical/80"}>
            − {fmtValue(f.before)}
          </span>
        )}
      </span>
      {publicAfter && (
        <span className="shrink-0 rounded-sm bg-critical/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-critical">
          public
        </span>
      )}
    </div>
  );
}

function SecurityGroupDiff({ diffs }: { diffs: AttributeDiff[] }) {
  const rules = useMemo(() => [...groupSgRules(diffs).values()], [diffs]);
  const other = diffs.filter(
    (d) => !/^(ingress|egress)\[\d+\]/.test(d.path),
  );
  const anyPublic = diffs.some(
    (d) => d.change_type !== "removed" && isPublicCidr(d.after),
  );

  return (
    <div>
      {anyPublic && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-critical/30 bg-critical/5 px-3 py-2">
          <AlertTriangle size={13} className="text-critical" />
          <span className="text-[12px] font-medium text-critical">
            Public exposure introduced — a rule now allows traffic from
            0.0.0.0/0
          </span>
        </div>
      )}
      <div className="space-y-2">
        {rules.map((r) => (
          <div
            key={`${r.direction}[${r.idx}]`}
            className="overflow-hidden rounded-md border border-border bg-bg"
          >
            <div className="flex items-center gap-2 border-b border-border bg-elevated px-3 py-1.5">
              <span className="mono text-[11px] text-muted">
                {r.direction}[{r.idx}]
              </span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  r.allAdded
                    ? "bg-healthy/15 text-healthy"
                    : r.allRemoved
                      ? "bg-critical/15 text-critical"
                      : "bg-medium/15 text-medium"
                }`}
              >
                {r.allAdded ? "added" : r.allRemoved ? "removed" : "modified"}
              </span>
            </div>
            <div className="py-1">
              {r.fields.map((f) => (
                <FieldLine key={f.field} f={f} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {other.length > 0 && <GenericTable diffs={other} className="mt-3" />}
    </div>
  );
}

/* ── IAM policy diff ─────────────────────────────────────────── */
function tryParsePolicy(v: unknown): {
  Statement?: { Effect?: string; Action?: unknown; Resource?: unknown }[];
} | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (obj && typeof obj === "object" && "Statement" in obj) return obj;
  } catch {
    /* not a policy doc */
  }
  return null;
}

function IamPolicyDiff({ diffs }: { diffs: AttributeDiff[] }) {
  const policyDiff = diffs.find(
    (d) => /policy|document|assume_role/.test(d.path),
  );
  const after = policyDiff ? tryParsePolicy(policyDiff.after) : null;
  const before = policyDiff ? tryParsePolicy(policyDiff.before) : null;
  if (!after && !before) return <GenericTable diffs={diffs} />;

  const stmts = after?.Statement ?? [];
  const wildcards = stmts.some(
    (s) =>
      s.Effect === "Allow" &&
      (s.Action === "*" || s.Resource === "*"),
  );

  return (
    <div>
      {wildcards && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-critical/30 bg-critical/5 px-3 py-2">
          <AlertTriangle size={13} className="text-critical" />
          <span className="text-[12px] font-medium text-critical">
            Wildcard permission in policy — Action or Resource is <span className="mono">*</span>
          </span>
        </div>
      )}
      <div className="space-y-2">
        {stmts.map((s, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-md border border-border bg-bg"
          >
            <div className="border-b border-border bg-elevated px-3 py-1.5">
              <span className="text-[11px] font-medium text-muted">
                Statement {i + 1}
                {before && !before.Statement?.[i] && (
                  <span className="ml-2 rounded-sm bg-healthy/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-healthy">
                    added
                  </span>
                )}
              </span>
            </div>
            <dl className="space-y-1 px-3 py-2 text-[12px]">
              <div className="flex gap-3">
                <dt className="mono w-[70px] text-faint">Effect</dt>
                <dd
                  className={
                    s.Effect === "Allow" ? "text-healthy" : "text-critical"
                  }
                >
                  {s.Effect}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="mono w-[70px] text-faint">Action</dt>
                <dd className="mono text-text">{fmtValue(s.Action)}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="mono w-[70px] text-faint">Resource</dt>
                <dd className="mono break-all text-text">
                  {fmtValue(s.Resource)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Generic changed-attribute table ─────────────────────────── */
function GenericTable({
  diffs,
  className = "",
}: {
  diffs: AttributeDiff[];
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-border bg-bg ${className}`}
    >
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-elevated text-[10px] font-medium uppercase tracking-widest text-faint">
            <th className="px-3 py-1.5">Attribute</th>
            <th className="px-3 py-1.5">Was</th>
            <th className="px-3 py-1.5">Now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {diffs.map((d, i) => (
            <tr key={i}>
              <td className="mono px-3 py-1.5 text-[11px] text-muted">
                {d.path}
              </td>
              <td className="mono px-3 py-1.5 text-[11px] text-faint">
                {d.change_type === "added" ? (
                  <span className="text-faint">—</span>
                ) : d.sensitive ? (
                  "••••••••"
                ) : (
                  fmtValue(d.before)
                )}
              </td>
              <td className="mono px-3 py-1.5 text-[11px]">
                {d.change_type === "removed" ? (
                  <span className="text-critical">removed</span>
                ) : d.sensitive ? (
                  <span className="text-faint" title="Sensitive value hidden">
                    ••••••••
                  </span>
                ) : (
                  <span className="text-text">{fmtValue(d.after)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResourceDiff({
  diffs,
  resourceType,
}: {
  diffs: AttributeDiff[];
  resourceType: string;
}) {
  const isSG = resourceType === "aws_security_group";
  const isIam = resourceType.startsWith("aws_iam");
  const hasStructured = isSG || isIam;
  const [view, setView] = useState<View>(
    hasStructured ? "structured" : "all",
  );

  const views: { id: View; label: string }[] = [
    ...(hasStructured ? [{ id: "structured" as View, label: "Structured" }] : []),
    { id: "all", label: "All changed attributes" },
    { id: "raw", label: "Raw JSON" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-1" role="tablist">
        {views.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              view === v.id
                ? "bg-elevated text-text"
                : "text-faint hover:text-muted"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "structured" && isSG && <SecurityGroupDiff diffs={diffs} />}
      {view === "structured" && isIam && <IamPolicyDiff diffs={diffs} />}
      {view === "all" && <GenericTable diffs={diffs} />}
      {view === "raw" && (
        <pre className="mono max-h-[360px] overflow-auto rounded-md border border-border bg-bg p-3 text-[11px] leading-relaxed text-muted">
          {JSON.stringify(diffs, null, 2)}
        </pre>
      )}
    </div>
  );
}
