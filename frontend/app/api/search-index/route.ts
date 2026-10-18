// Compact search index for the ⌘K palette. Server-side only — fetches the
// real drift events and scans, returns just enough to match technical
// identifiers (terraform address, resource id, arn fragments, scan id).
import { NextResponse } from "next/server";
import { api } from "@/lib/api";
import { listSummary } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [drifts, scans] = await Promise.all([
      api.drifts({ limit: "100" }),
      api.scans(),
    ]);
    return NextResponse.json({
      drifts: drifts.items.map((d) => ({
        id: d.id,
        resource_address: d.resource_address,
        resource_type: d.resource_type,
        severity: d.severity,
        status: d.status,
        environment: d.environment,
        region: d.region,
        summary: listSummary(d),
        risk_score: d.risk_score,
      })),
      scans: scans.items.map((s) => ({
        id: s.id,
        status: s.status,
        environment: s.environment,
        commit_sha: s.commit_sha,
        started_at: s.started_at,
        drift_detected: s.drift_detected,
      })),
    });
  } catch {
    return NextResponse.json(
      { drifts: [], scans: [], unavailable: true },
      { status: 200 },
    );
  }
}
