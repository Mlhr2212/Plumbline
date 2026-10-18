import { api } from "@/lib/api";
import DriftExplorer from "@/components/DriftExplorer";
import { ErrorState } from "@/components/States";

export const dynamic = "force-dynamic";

export default async function DriftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  // URL params seed the explorer's filters — shareable, persistent.
  const page = await api
    .drifts({
      severity: params.severity?.split(",")[0],
      status: params.status?.split(",")[0],
      limit: "100",
    })
    .catch(() => null);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Drift</h1>
        <span className="text-[12px] text-faint">
          every out-of-band change Terraform observed, as an incident
        </span>
      </div>
      {page ? (
        <DriftExplorer items={page.items} />
      ) : (
        <ErrorState detail="Couldn't load drift events — the PlumbLine API did not respond." />
      )}
    </div>
  );
}
