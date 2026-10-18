// Server-side proxy for drift lifecycle actions. Attaches x-api-key so the
// secret never reaches the browser; forwards the backend's status verbatim
// (including 409 stale-drift rejections).
import { NextRequest, NextResponse } from "next/server";
import { postAction } from "@/lib/api";

const ALLOWED = new Set(["reconcile", "accept", "ignore", "acknowledge"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ detail: "unknown action" }, { status: 404 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine for acknowledge */
  }
  const result = await postAction(
    id,
    action as "reconcile" | "accept" | "ignore" | "acknowledge",
    body,
  );
  return NextResponse.json(result.data ?? {}, { status: result.status });
}
