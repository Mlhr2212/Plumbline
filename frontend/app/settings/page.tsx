import { api } from "@/lib/api";
import { Section } from "@/components/Badges";
import { ErrorState } from "@/components/States";

export const dynamic = "force-dynamic";

const SHORTCUTS: [string, string][] = [
  ["⌘ K / Ctrl K", "Command palette — search and navigate anywhere"],
  ["/", "Focus the drift filter (Drift explorer)"],
  ["↑ ↓", "Move selection in lists and the palette"],
  ["↵", "Open the selected item"],
  ["Esc", "Close panels, menus, and focus mode"],
];

export default async function SettingsPage() {
  const health = await api.health().catch(() => null);

  return (
    <div className="max-w-[720px] space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Settings</h1>
        <span className="text-[12px] text-faint">
          deployment info and keyboard reference
        </span>
      </div>

      {health ? (
        <Section title="Connection">
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-faint">Backend status</dt>
              <dd className="flex items-center gap-1.5 text-healthy">
                <span className="h-1.5 w-1.5 rounded-full bg-healthy" />
                connected
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Service</dt>
              <dd className="mono text-text">{health.service}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Version</dt>
              <dd className="mono text-text">{health.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">API endpoint</dt>
              <dd className="mono text-text">
                {process.env.PLUMBLINE_API_URL ?? "http://localhost:8000"}
              </dd>
            </div>
          </dl>
        </Section>
      ) : (
        <ErrorState detail="The PlumbLine API is unreachable." />
      )}

      <Section title="Environment">
        <dl className="space-y-2 text-[12px]">
          <div className="flex justify-between">
            <dt className="text-faint">Monitored environment</dt>
            <dd className="mono text-text">sandbox (dev)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-faint">AWS region</dt>
            <dd className="mono text-text">us-east-2</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-faint">Scan source</dt>
            <dd className="text-text">
              GitHub Actions → terraform plan → signed ingest (hourly)
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-faint">Attribution source</dt>
            <dd className="text-text">AWS CloudTrail event history</dd>
          </div>
        </dl>
      </Section>

      <Section title="Keyboard shortcuts">
        <dl className="space-y-2 text-[12px]">
          {SHORTCUTS.map(([k, desc]) => (
            <div key={k} className="flex items-center gap-4">
              <dt className="w-[110px] shrink-0">
                <kbd className="kbd">{k}</kbd>
              </dt>
              <dd className="text-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="About">
        <p className="text-[12px] leading-relaxed text-muted">
          PlumbLine detects out-of-band AWS changes by consuming Terraform
          plan JSON — it reads what Terraform already compared, then adds
          attribution, replay, and safe remediation. It never replaces
          Terraform&apos;s diff engine and never applies changes without a
          human-reviewed proposal.
        </p>
      </Section>
    </div>
  );
}
