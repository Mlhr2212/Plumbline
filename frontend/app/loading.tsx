import { Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-48 animate-pulse rounded bg-elevated" />
      <div className="rounded-md border border-border bg-panel p-4">
        <Skeleton lines={3} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-panel p-4">
          <Skeleton lines={4} />
        </div>
        <div className="rounded-md border border-border bg-panel p-4">
          <Skeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
