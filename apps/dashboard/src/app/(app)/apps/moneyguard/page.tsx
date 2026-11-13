'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AppPage } from '@/components/app-header';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, TextLink } from '@/components/ui';

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

function statusTone(status: string): 'high' | 'medium' | 'success' | 'neutral' {
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'high';
  if (['underpaid', 'overpaid', 'accepted', 'processing'].includes(status)) return 'medium';
  if (status === 'succeeded') return 'success';
  return 'neutral';
}

function MoneyGuardContent() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');

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

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <Card
        title={
          <span className="flex items-center gap-2">
            Recent Bachs payments
            {environment && <Badge tone={environment === 'sandbox' ? 'medium' : 'success'}>{environment}</Badge>}
          </span>
        }
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualId.trim()) void investigate(manualId.trim());
            }}
          >
            <input className="input w-60 py-1 text-xs" placeholder="ch_... charge id" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            <Button size="sm" type="submit" disabled={!manualId.trim()} loading={busy === manualId.trim()}>
              Investigate
            </Button>
          </form>
        }
      >
        {!payments ? (
          <LoadingBlock />
        ) : !configured ? (
          <EmptyState title="Bachs is not configured">
            Set <span className="font-mono">BACHS_API_KEY</span> on the API server (an <span className="font-mono">sk_sandbox_</span> key works) to list live payments.
          </EmptyState>
        ) : payments.length === 0 ? (
          <EmptyState title="No payments on this Bachs account yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">Payment</th>
                  <th className="table-head">Customer</th>
                  <th className="table-head">Amount</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Date</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.chargeId ?? `row-${i}`} className="hover:bg-ink-850">
                    <td className="table-cell">
                      <div className="font-mono text-xs">{p.chargeId ?? '—'}</div>
                      {p.reference && <div className="text-xs text-ink-400">ref {p.reference}</div>}
                    </td>
                    <td className="table-cell">
                      <div className="text-sm">{p.customerName || '—'}</div>
                      <div className="text-xs text-ink-400">{p.customerEmail}</div>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {p.amount} {p.currency}
                      {p.settlement && p.settlement.currency !== p.currency && (
                        <div className="text-xs text-ink-400">settles {p.settlement.amount} {p.settlement.currency}</div>
                      )}
                    </td>
                    <td className="table-cell">
                      <Badge tone={statusTone(p.status)}>{p.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-ink-400">{timeAgo(p.date)}</td>
                    <td className="table-cell text-right">
                      {p.chargeId && (
                        <Button size="sm" variant="secondary" loading={busy === p.chargeId} disabled={busy !== null} onClick={() => void investigate(p.chargeId!)}>
                          Investigate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Investigation cases">
        {cases.length === 0 ? (
          <EmptyState title="No cases yet">The agent opens a case when it finds medium or high risk.</EmptyState>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Case</th>
                <th className="table-head">Risk</th>
                <th className="table-head">Recommended action</th>
                <th className="table-head">Opened</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="table-cell">
                    <div>{c.title}</div>
                    <div className="font-mono text-xs text-ink-400">
                      {c.chargeId}
                      {c.customerEmail ? ` · ${c.customerEmail}` : ''}
                    </div>
                  </td>
                  <td className="table-cell"><Badge tone={c.riskLevel}>{c.riskLevel}</Badge></td>
                  <td className="table-cell text-ink-300">{c.recommendedAction}</td>
                  <td className="table-cell whitespace-nowrap text-xs">
                    <TextLink href={`/executions/${c.executionId}`}>{timeAgo(c.createdAt)}</TextLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function MoneyGuardPage() {
  return <AppPage appId="moneyguard">{() => <MoneyGuardContent />}</AppPage>;
}
