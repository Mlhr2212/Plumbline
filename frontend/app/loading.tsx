export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-48 animate-pulse rounded-md bg-[#eef0f3]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-[#e5e8ec] bg-white"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-[#e5e8ec] bg-white" />
    </div>
  );
}
