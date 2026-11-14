/* eslint-disable @next/next/no-img-element */
import clsx from 'clsx';

/**
 * One input (triggers), the main processor (the Athena runtime), and the two
 * application lanes, with pulses running along the lines. Counts are live.
 */
export function RuntimeDiagram({
  money,
  ops,
  pending,
}: {
  money: { runs: number; installed: boolean };
  ops: { runs: number; installed: boolean };
  pending: number;
}) {
  return (
    <div className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] md:items-center">
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
        <g fill="none" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
          {[22, 50, 78].map((y) => (
            <g key={`in-${y}`}>
              <path d={`M31 ${y} C 36 ${y}, 36 50, 37 50`} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
              <path className="pulse-line" d={`M31 ${y} C 36 ${y}, 36 50, 37 50`} stroke="var(--action)" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {[30, 70].map((y) => (
            <g key={`out-${y}`}>
              <path d={`M63 50 C 65 50, 65 ${y}, 69 ${y}`} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
              <path className="pulse-line" d={`M63 50 C 65 50, 65 ${y}, 69 ${y}`} stroke="var(--action)" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      </svg>

      <div className="relative space-y-2">
        <Source icon={<span className="mono text-[12px] font-semibold text-ink">B</span>} name="Bachs" detail="collection.failed, dispute.created" />
        <Source icon={<img src="/icons/github.svg" alt="" width={18} height={18} />} name="GitHub" detail="workflow_run failed" />
        <Source icon={<span className="h-2 w-2 rounded-full bg-ok" />} name="Health checks" detail="every 15 minutes" />
      </div>

      <div className="relative rounded-lg border border-ink bg-inv p-5 text-inv-ink">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-inv-muted">Shared runtime</span>
          <span className="flex items-center gap-1.5 text-label text-inv-muted">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#7fd3c9]" /> running
          </span>
        </div>
        <div className="mt-2 text-[22px] font-medium tracking-[-0.03em]">Athena</div>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] text-inv-muted">
          <li>Tool registry</li>
          <li>Permissions</li>
          <li>Approvals{pending > 0 && <span className="ml-1 text-[#f2c879]">· {pending}</span>}</li>
          <li>Memory</li>
          <li>Workflows</li>
          <li>Live monitor</li>
        </ul>
        <div className="mt-4 flex items-center gap-3 border-t border-inv-surface pt-3">
          <span className="text-label text-inv-muted">Models</span>
          <img src="/icons/anthropic.svg" alt="Anthropic" width={20} height={14} className="invert" />
          <img src="/icons/groq.svg" alt="Groq" width={44} height={12} className="opacity-90 invert" />
        </div>
      </div>

      <div className="relative space-y-2">
        <Lane name="MoneyGuard" detail="Payments, risk, refunds" runs={money.runs} installed={money.installed} accent />
        <Lane name="OpsGuard" detail="Services, deploys, incidents" runs={ops.runs} installed={ops.installed} />
        <div className="flex items-center gap-2 px-1 pt-1 text-label text-muted">
          <img src="/icons/slack.svg" alt="" width={14} height={14} /> Both notify Slack with one shared tool
        </div>
      </div>
    </div>
  );
}

function Source({ icon, name, detail }: { icon: React.ReactNode; name: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-card px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-bg">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-tight">{name}</span>
        <span className="mono block truncate text-[12px] text-muted">{detail}</span>
      </span>
    </div>
  );
}

function Lane({ name, detail, runs, installed, accent }: { name: string; detail: string; runs: number; installed: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-card px-3 py-3">
      <span className={clsx('h-8 w-1 rounded-full', accent ? 'bg-action' : 'bg-ink')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight">{name}</span>
        <span className="block text-[13px] text-muted">{installed ? detail : 'Not installed'}</span>
      </span>
      <span className="text-right">
        <span className="tabular block text-[18px] font-medium leading-none">{runs}</span>
        <span className="text-label text-muted">runs, 7d</span>
      </span>
    </div>
  );
}
