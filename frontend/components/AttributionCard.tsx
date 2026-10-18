import { UserRound, CircleHelp } from "lucide-react";
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
        <div className="flex gap-3">
          <CircleHelp size={18} className="shrink-0 text-[#8a94a3]" />
          <p className="text-[13px] text-[#5c6675]">
            CloudTrail attribution is disabled for this environment.
          </p>
        </div>
      </Card>
    );
  }

  if (!actor || status === "unknown") {
    return (
      <Card title="Who did it">
        <div className="flex gap-3">
          <CircleHelp size={18} className="shrink-0 text-amber-500" />
          <div>
            <p className="text-[13px] font-medium">Actor unknown</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#8a94a3]">
              CloudTrail found no matching mutating event in the lookback
              window. Reported honestly — never guessed.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const actorShort = actor.split("/").pop() ?? actor;

  return (
    <Card title="Who did it">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eff4ff] text-[#2563eb]">
          <UserRound size={16} />
        </span>
        <div className="min-w-0">
          <p className="mono truncate text-[13px] font-semibold text-[#17202b]">
            {actorShort}
          </p>
          <p className="mono mt-0.5 break-all text-[11px] text-[#8a94a3]">
            {actor}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-[12px]">
        {[
          ["Action", <span key="a" className="mono">{event_name ?? "—"}</span>],
          ["When", event_time ? shortTime(event_time) : "—"],
          ["Source IP", <span key="i" className="mono">{source_ip ?? "—"}</span>],
          [
            "Confidence",
            <span
              key="c"
              className={
                confidence >= 0.8
                  ? "font-medium text-emerald-700"
                  : confidence >= 0.5
                    ? "font-medium text-amber-700"
                    : "font-medium text-red-600"
              }
            >
              {Math.round(confidence * 100)}%
            </span>,
          ],
        ].map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-[#8a94a3]">{k}</dt>
            <dd className="text-right text-[#17202b]">{v}</dd>
          </div>
        ))}
      </dl>
      {attribution.candidates.length > 1 && (
        <p className="mt-3 border-t border-[#eef0f3] pt-2 text-[11px] text-[#8a94a3]">
          {attribution.candidates.length - 1} other candidate event
          {attribution.candidates.length - 1 === 1 ? "" : "s"} in window
        </p>
      )}
    </Card>
  );
}
