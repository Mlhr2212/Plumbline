import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import IncidentView from "@/components/incident/IncidentView";

export const dynamic = "force-dynamic";

export default async function DriftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, timeline, preview, deps, all] = await Promise.all([
    api.drift(id).catch(() => null),
    api.timeline(id).catch(() => []),
    api.remediationPreview(id).catch(() => null),
    api.dependencies(id).catch(() => null),
    api.drifts({ limit: "100" }).catch(() => null),
  ]);
  if (!event) notFound();

  // Incident quick-switcher: neighbors by first_seen, newest first.
  const sorted = (all?.items ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.first_seen_at).getTime() -
        new Date(a.first_seen_at).getTime(),
    );
  const idx = sorted.findIndex((d) => d.id === id);
  const prevId = idx > 0 ? sorted[idx - 1].id : null;
  const nextId = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].id : null;

  return (
    <IncidentView
      event={event}
      timeline={timeline}
      preview={preview}
      deps={deps}
      prevId={prevId}
      nextId={nextId}
    />
  );
}
