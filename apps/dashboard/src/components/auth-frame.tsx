import Link from 'next/link';

/**
 * Sign-in and registration frame: the form on the left, and on the right the
 * product itself, a run waiting for approval, drawn as live HTML.
 */
export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-8 md:px-12 xl:px-20">
        <Link href="/login" className="flex items-center gap-2.5" aria-label="Athena">
          <span className="mark-dots" aria-hidden />
          <span className="text-[20px] font-medium tracking-[-0.03em]">Athena</span>
        </Link>
        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[400px]">
            <div className="overflow-hidden pb-1">
              <h1 className="enter-rise text-[clamp(30px,1.6vw+22px,42px)] leading-[1.08]">{title}</h1>
            </div>
            <p className="enter-fade mt-3 text-[17px] leading-relaxed text-ink-soft">{lead}</p>
            <div className="enter-fade mt-8">{children}</div>
          </div>
        </div>
        <p className="text-label text-muted">Product names and logos are trademarks of their owners.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-line bg-surface lg:block" aria-hidden>
        <PreviewRun />
      </div>
    </div>
  );
}

function Row({ time, kind, children, tone = 'ink' }: { time: string; kind: string; children: React.ReactNode; tone?: 'ink' | 'ok' | 'warn' }) {
  const dot = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-line-strong';
  return (
    <li className="relative pl-6">
      <span className={`absolute left-0 top-[7px] h-2 w-2 rounded-full ${dot}`} />
      <div className="mono text-[12px] text-muted">{time} · {kind}</div>
      <div className="mt-0.5 text-[15px] text-ink">{children}</div>
    </li>
  );
}

function PreviewRun() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-12">
      <div className="w-full max-w-[620px] translate-x-10 rounded-lg border border-line bg-card shadow-[0_24px_60px_-30px_rgba(31,48,56,.35)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-[2px] bg-action" />
            <span className="text-[15px] font-medium">MoneyGuard</span>
            <span className="mono text-[12px] text-muted">run ch_7Qm2…f41</span>
          </div>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-warn-line bg-warn-soft px-2 text-label font-medium text-warn">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" /> Needs approval
          </span>
        </div>
        <div className="grid grid-cols-[1fr_190px]">
          <ol className="space-y-4 border-r border-line p-5">
            <Row time="14:02:11" kind="tool">get_transaction_details · 2,500,000.00 NGN, failed</Row>
            <Row time="14:02:12" kind="tool">search_transaction_history · 3 failed in 24h</Row>
            <Row time="14:02:14" kind="tool" tone="ok">check_risk_rules · score 85, high</Row>
            <Row time="14:02:15" kind="agent">Payer name does not match the customer and the card was reported stolen. Flagging the customer.</Row>
            <Row time="14:02:15" kind="approval" tone="warn">flag_customer waits for a person</Row>
          </ol>
          <div className="space-y-3 p-5">
            <div className="text-label text-muted">Risk rules</div>
            {[
              ['large_amount', 20],
              ['fraud_signal', 30],
              ['payer_mismatch', 15],
              ['prior_disputes', 30],
            ].map(([rule, w]) => (
              <div key={rule as string}>
                <div className="mono flex justify-between text-[12px] text-ink-soft">
                  <span>{rule}</span>
                  <span>+{w}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-surface">
                  <div className="h-1 rounded-full bg-action" style={{ width: `${(Number(w) / 30) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <span className="btn btn-secondary btn-sm">Reject</span>
          <span className="btn btn-primary btn-sm">Approve flag</span>
        </div>
      </div>
    </div>
  );
}
