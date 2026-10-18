import type { Attribution } from "@/lib/types";
import { shortTime } from "@/lib/format";
import { Card } from "./Badges";

export default function AttributionCard({
  attribution,
}: {
  attribution: Attribution;
}) {
  const { status, actor, event_name, event_time, source_ip, confidence } =
    attribution;

  if (status === "disabled" || attribution.source === "none") {
    return (
      <Card title="Who did it">
        <p className="text-sm text-[#8b98a9]">
          CloudTrail attribution is disabled for this environment.
        </p>
      </Card>
    );
  }

  if (!actor || status === "unknown") {
    return (
      <Card title="Who did it">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm">
            ?
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-300">Actor unknown</p>
            <p className="text-xs text-[#8b98a9]">
              CloudTrail found no matching mutating event in the lookback
              window — reported honestly, not guessed.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Who did it">
      <div className="space-y-2">
        <p className="mono break-all text-sm font-medium text-sky-300">
          {actor}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-[#8b98a9]">Action</dt>
          <dd className="mono">{event_name ?? "—"}</dd>
          <dt className="text-[#8b98a9]">When</dt>
          <dd>{event_time ? shortTime(event_time) : "—"}</dd>
          <dt className="text-[#8b98a9]">Source IP</dt>
          <dd className="mono">{source_ip ?? "—"}</dd>
          <dt className="text-[#8b98a9]">Confidence</dt>
          <dd>
            <span
              className={
                confidence >= 0.8
                  ? "text-emerald-400"
                  : confidence >= 0.5
                    ? "text-amber-400"
                    : "text-red-400"
              }
            >
              {Math.round(confidence * 100)}%
            </span>
          </dd>
        </dl>
      </div>
    </Card>
  );
}
