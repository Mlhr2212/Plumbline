import { api } from "@/lib/api";

// Server component — pings the backend once per render to show live status
// in the sidebar footer.
export default async function ApiStatus() {
  let ok = false;
  try {
    await api.overview();
    ok = true;
  } catch {
    ok = false;
  }
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className={`h-2 w-2 rounded-full ${
          ok ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      <span className="font-medium text-[#5c6675]">
        {ok ? "API connected" : "API unreachable"}
      </span>
    </div>
  );
}
