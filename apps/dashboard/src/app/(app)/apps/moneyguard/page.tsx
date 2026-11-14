'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AppPage } from '@/components/app-header';
import { Badge, Button, EmptyState, ErrorBanner, LoadingBlock, Mono, TextLink } from '@/components/ui';

interface PaymentRow {
  chargeId: string | null;
  status: string;
  amount: string;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  reference: string | null;
  settlement: { amount: string; currency: string | null } | null;
  isRefundable: boolean | null;
  date: string | null;
}

interface CaseItem {
  id: string;
  title: string;
  chargeId: string;
  customerEmail?: string;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  status: string;
  executionId: string;
  createdAt: string;
}

const FAILED = ['failed', 'expired', 'cancelled'];
const ODD = ['underpaid', 'overpaid', 'accepted', 'processing'];

function statusTone(status: string): 'bad' | 'warn' | 'ok' | 'neutral' {
  if (FAILED.includes(status)) return 'bad';
  if (ODD.includes(status)) return 'warn';
  if (status === 'succeeded') return 'ok';
  return 'neutral';
}

/** Format a Bachs decimal string with thousands separators, keeping its precision */
function money(amount: string, currency: string | null): string {
  const [whole, frac] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac !== undefined ? `${grouped}.${frac}` : grouped} ${currency ?? ''}`.trim();
}

type Filter = 'all' | 'failed' | 'odd' | 'succeeded';

function MoneyGuardContent() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const [p, k] = await Promise.all([
        api<{ configured: boolean; environment: string | null; payments: PaymentRow[] }>('/apps/moneyguard/payments'),
        api<CaseItem[]>('/apps/moneyguard/cases'),
      ]);
      setConfigured(p.data.configured);
      setEnvironment(p.data.environment);
      setPayments(p.data.payments);
      setCases(k.data);
    } catch (err) {
      setError(describeError(err));
      setPayments([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const investigate = async (chargeId: string) => {
    setBusy(chargeId);
    setError(null);
    try {
      const { data } = await api<{ executionId: string }>('/apps/moneyguard/investigate', { body: { chargeId } });
      router.push(`/executions/${data.executionId}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const list = payments ?? [];
    return {
      all: list.length,
      failed: list.filter((p) => FAILED.includes(p.status)).length,
      odd: list.filter((p) => ODD.includes(p.status)).length,
      succeeded: list.filter((p) => p.status === 'succeeded').length,
    };
  }, [payments]);

  const shown = (payments ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'failed' ? FAILED.includes(p.status) : filter === 'odd' ? ODD.includes(p.status) : p.status === 'succeeded'
  );

  const FILTERS: Array<[Filter, string]> = [
    ['all', 'All'],
    ['failed', 'Failed'],
    ['odd', 'Under or overpaid'],
    ['succeeded', 'Succeeded'],
  ];

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-[17px] font-medium tracking-[-0.01em]">Bachs payments</h2>
            {environment && <Badge tone={environment === 'sandbox' ? 'warn' : 'ok'}>{environment === 'sandbox' ? 'Sandbox' : 'Live'}</Badge>}
          </div>
          <form
            className="flex w-full gap-2 sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualId.trim()) void investigate(manualId.trim());
            }}
          >
            <label className="sr-only" htmlFor="charge-id">Charge id</label>
            <input id="charge-id" className="input mono sm:w-64" placeholder="ch_1a2b3c4d5e6f" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            <Button type="submit" disabled={!manualId.trim()} loading={busy === manualId.trim()}>
              Investigate charge
            </Button>
          </form>
        </header>

        {!payments ? (
          <div className="px-5"><LoadingBlock label="Loading payments" /></div>
        ) : !configured ? (
          <div className="p-5">
            <EmptyState title="Connect Bachs to see payments">
              Add <span className="mono">BACHS_API_KEY</span> to the API server’s <span className="mono">.env</span>. An <span className="mono">sk_sandbox_</span> key reads the Bachs sandbox, so nothing real moves while you test.
            </EmptyState>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-5"><EmptyState title="No payments on this Bachs account yet" /></div>
        ) : (
          <>
            <div className="flex gap-1 border-b border-line px-3" role="tablist" aria-label="Filter payments">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={clsx(
                    'relative flex h-11 items-center gap-2 px-3 text-[14px] font-medium',
                    filter === key ? 'text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-ink' : 'text-muted hover:text-ink'
                  )}
                >
                  {label}
                  <span className="tabular text-label text-muted">{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="table-head pl-5">Customer</th>
                    <th className="table-head text-right">Amount</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Charge</th>
                    <th className="table-head">When</th>
                    <th className="table-head pr-5"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p, i) => (
                    <tr key={p.chargeId ?? `row-${i}`} className="transition-colors hover:bg-hover">
                      <td className="table-cell pl-5">
                        <div className="font-medium text-ink">{p.customerName || 'Guest'}</div>
                        <div className="text-[13px] text-muted">{p.customerEmail ?? 'no email'}</div>
                      </td>
                      <td className="table-cell tabular whitespace-nowrap text-right">
                        <div className="font-medium text-ink">{money(p.amount, p.currency)}</div>
                        {p.settlement && p.settlement.currency !== p.currency && (
                          <div className="text-[13px] text-muted">settles {money(p.settlement.amount, p.settlement.currency)}</div>
                        )}
                      </td>
                      <td className="table-cell">
                        <Badge tone={statusTone(p.status)}>{p.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="table-cell">
                        <Mono>{p.chargeId ?? '—'}</Mono>
                        {p.reference && <div className="text-[13px] text-muted">ref {p.reference}</div>}
                      </td>
                      <td className="table-cell whitespace-nowrap text-muted">{timeAgo(p.date)}</td>
                      <td className="table-cell pr-5 text-right">
                        {p.chargeId && (
                          <Button size="sm" variant={FAILED.includes(p.status) ? 'primary' : 'secondary'} loading={busy === p.chargeId} disabled={busy !== null} onClick={() => void investigate(p.chargeId!)}>
                            Investigate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={6} className="table-cell py-8 text-center text-muted">No payments match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[22px] leading-tight">Investigation cases</h2>
          <span className="tabular text-[14px] text-muted">{cases.filter((c) => c.status === 'open').length} open</span>
        </div>
        {cases.length === 0 ? (
          <EmptyState title="No cases yet">MoneyGuard opens a case when it rates a payment medium or high risk, with the evidence it used.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cases.map((c) => (
              <article key={c.id} className="card flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge tone={c.riskLevel}>{c.riskLevel === 'high' ? 'High risk' : c.riskLevel === 'medium' ? 'Medium risk' : 'Low risk'}</Badge>
                  <span className="text-label text-muted">{timeAgo(c.createdAt)}</span>
                </div>
                <h3 className="text-[17px] font-medium leading-snug tracking-[-0.01em]">{c.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">{c.recommendedAction}</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <Mono className="truncate">{c.customerEmail ?? c.chargeId}</Mono>
                  <TextLink href={`/executions/${c.executionId}`}>Open the run</TextLink>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function MoneyGuardPage() {
  return <AppPage appId="moneyguard">{() => <MoneyGuardContent />}</AppPage>;
}
