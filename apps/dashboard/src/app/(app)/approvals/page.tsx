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
        title="Approvals for high-risk actions"
        description="Refunds, customer flags, and deploy retries wait here until you decide. A rejection goes back to the agent with your note."
      />
      <ErrorBanner message={error} />
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              '-mb-px flex h-11 items-center border-b-2 px-3 text-[15px] font-medium',
              tab === t.key ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
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
