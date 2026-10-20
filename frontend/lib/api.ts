// Server-side API client. All functions run on the Next.js server only —
// PLUMBLINE_API_URL and PLUMBLINE_API_KEY are never exposed to the browser.
import type {
  DependencySummary,
  DriftEvent,
  Overview,
  Page,
  ReconciliationProposal,
  RemediationPreview,
  Scan,
  TimelineEvent,
} from "./types";

const BASE = (process.env.PLUMBLINE_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);
const API_KEY = process.env.PLUMBLINE_API_KEY ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`PlumbLine API ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function postAction(
  driftId: string,
  action: "reconcile" | "accept" | "ignore" | "acknowledge",
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${BASE}/api/v1/drifts/${driftId}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Mask IPv4 to two octets — demo attribution can contain the operator's
 *  home IP; the UI renders `a.b.x.x` instead. */
function maskIp(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v.replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, "$1.x.x");
}

/** Redact PII-ish fields before data reaches the browser. */
function redactEvent(d: DriftEvent): DriftEvent {
  const a = d.cloudtrail_attribution;
  return a?.source_ip
    ? {
        ...d,
        cloudtrail_attribution: {
          ...a,
          source_ip: maskIp(a.source_ip) as string,
        },
      }
    : d;
}

export const api = {
  health: () =>
    get<{ status: string; service: string; version: string }>("/health"),
  overview: () => get<Overview>("/api/v1/overview"),
  drifts: (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return get<Page<DriftEvent>>(`/api/v1/drifts${qs ? `?${qs}` : ""}`).then(
      (p) => ({ ...p, items: p.items.map(redactEvent) }),
    );
  },
  drift: (id: string) =>
    get<DriftEvent>(`/api/v1/drifts/${id}`).then(redactEvent),
  timeline: async (id: string) => {
    const events = await get<TimelineEvent[]>(
      `/api/v1/drifts/${id}/timeline`,
    );
    return events.map((e) => ({
      ...e,
      metadata: Object.fromEntries(
        Object.entries(e.metadata ?? {}).map(([k, v]) => [k, maskIp(v)]),
      ),
    }));
  },
  dependencies: (id: string) =>
    get<DependencySummary>(`/api/v1/drifts/${id}/dependencies`),
  remediationPreview: (id: string) =>
    get<RemediationPreview>(`/api/v1/drifts/${id}/remediation-preview`),
  scans: () => get<Page<Scan>>("/api/v1/scans?limit=50"),
  scan: (id: string) => get<Scan>(`/api/v1/scans/${id}`),
  reconciliations: () =>
    get<Page<ReconciliationProposal>>("/api/v1/reconciliations?limit=50"),
};
