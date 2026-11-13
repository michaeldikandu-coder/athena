'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Approval } from '@/lib/types';
import { useRealtime } from '@/lib/realtime';
import { ApprovalCard } from '@/components/approval-card';
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
] as const;

export default function ApprovalsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [items, setItems] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<Approval[]>(`/approvals?status=${tab}`)).data);
    } catch (err) {
      setError(describeError(err));
    }
  }, [tab]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  useRealtime((m) => {
    if (m.type === 'approval.requested' || m.type === 'approval.decided') void load();
  });

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="High-risk tool calls pause here until a human decides. Rejections are sent back to the agent, which explains and continues."
      />
      <ErrorBanner message={error} />
      <div className="mb-4 flex gap-1 border-b border-ink-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.key ? 'border-accent-500 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!items ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title={tab === 'pending' ? 'Nothing waiting for approval' : `No ${tab} approvals`} />
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecided={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
