'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AppPage } from '@/components/app-header';
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingBlock, TextLink } from '@/components/ui';

interface ChargeSummary {
  id: string;
  amountFormatted: string;
  status: 'succeeded' | 'pending' | 'failed';
  createdAt: string;
  customerId: string | null;
  description: string | null;
  failure: { code: string; message: string } | null;
  disputed: boolean;
  refunded: boolean;
  radar: { riskLevel?: string; riskScore?: number } | null;
  card: { brand: string; last4: string; country: string | null } | null;
  billingCountry: string | null;
  metadata: Record<string, string>;
}

interface CaseItem {
  id: string;
  title: string;
  chargeId: string;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  status: string;
  executionId: string;
  createdAt: string;
}

function riskTone(level?: string): 'low' | 'medium' | 'high' {
  if (level === 'highest' || level === 'elevated') return 'high';
  if (level === 'normal') return 'low';
  return 'low';
}

function MoneyGuardContent() {
  const router = useRouter();
  const [charges, setCharges] = useState<ChargeSummary[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([
        api<{ configured: boolean; charges: ChargeSummary[] }>('/apps/moneyguard/charges'),
        api<CaseItem[]>('/apps/moneyguard/cases'),
      ]);
      setConfigured(c.data.configured);
      setCharges(c.data.charges);
      setCases(k.data);
    } catch (err) {
      setError(describeError(err));
      setCharges([]);
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
        title="Recent Stripe charges"
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
        {!charges ? (
          <LoadingBlock />
        ) : !configured ? (
          <EmptyState title="Stripe is not configured">
            Set <span className="font-mono">STRIPE_SECRET_KEY</span> on the API server (a test-mode key works) to list live charges.
          </EmptyState>
        ) : charges.length === 0 ? (
          <EmptyState title="No charges in this Stripe account yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">Charge</th>
                  <th className="table-head">Amount</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Radar</th>
                  <th className="table-head">Card</th>
                  <th className="table-head">Created</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-850">
                    <td className="table-cell">
                      <div className="font-mono text-xs">{c.id}</div>
                      <div className="text-xs text-ink-400">{c.customerId ?? 'no customer'}</div>
                      {c.metadata?.moneyguard_flag && <Badge tone="high" className="mt-1">flagged</Badge>}
                    </td>
                    <td className="table-cell whitespace-nowrap">{c.amountFormatted}</td>
                    <td className="table-cell">
                      <Badge tone={c.status === 'failed' ? 'high' : c.status === 'succeeded' ? 'success' : 'neutral'}>{c.status}</Badge>
                      {c.failure && <div className="mt-1 text-xs text-red-300">{c.failure.code}</div>}
                      {c.disputed && <Badge tone="high" className="ml-1">disputed</Badge>}
                      {c.refunded && <Badge className="ml-1">refunded</Badge>}
                    </td>
                    <td className="table-cell">
                      {c.radar?.riskLevel ? (
                        <Badge tone={riskTone(c.radar.riskLevel)}>
                          {c.radar.riskLevel}
                          {c.radar.riskScore !== undefined ? ` · ${c.radar.riskScore}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-ink-300">
                      {c.card ? `${c.card.brand} ••${c.card.last4} ${c.card.country ?? ''}` : '—'}
                      {c.billingCountry && c.card?.country && c.billingCountry !== c.card.country && (
                        <div className="text-amber-300">billing {c.billingCountry}</div>
                      )}
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-ink-400">{timeAgo(c.createdAt)}</td>
                    <td className="table-cell text-right">
                      <Button size="sm" variant="secondary" loading={busy === c.id} disabled={busy !== null} onClick={() => void investigate(c.id)}>
                        Investigate
                      </Button>
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
                    <div className="font-mono text-xs text-ink-400">{c.chargeId}</div>
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
