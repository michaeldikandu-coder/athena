'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Execution } from '@/lib/types';
import { useRealtime } from '@/lib/realtime';
import { ExecutionTable } from '@/components/execution-table';
import { Button, Card, ErrorBanner, LoadingBlock, PageHeader } from '@/components/ui';

const STATUSES = ['', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'];

function ExecutionsList() {
  const router = useRouter();
  const params = useSearchParams()!;
  const status = params.get('status') ?? '';
  const application = params.get('application') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [items, setItems] = useState<Execution[] | null>(null);
  const [meta, setMeta] = useState<{ totalPages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: '25' });
    if (status) qs.set('status', status);
    if (application) qs.set('application', application);
    try {
      const res = await api<Execution[]>(`/executions?${qs}`);
      setItems(res.data);
      setMeta({ totalPages: res.meta?.totalPages ?? 1, total: res.meta?.total ?? 0 });
    } catch (err) {
      setError(describeError(err));
    }
  }, [page, status, application]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime((m) => {
    if (m.type === 'execution.status') void load();
  });

  const setParam = (key: string, value: string) => {
    const qs = new URLSearchParams(params.toString());
    if (value) qs.set(key, value);
    else qs.delete(key);
    if (key !== 'page') qs.delete('page');
    router.push(`/executions?${qs}`);
  };

  return (
    <div>
      <PageHeader title="Runs across both agents" description="Every agent task and workflow run, newest first. Open one to see each tool call and decision." />
      <ErrorBanner message={error} />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-48" value={status} onChange={(e) => setParam('status', e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s ? ({ running: 'Running', waiting_approval: 'Needs approval', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' } as Record<string, string>)[s] : 'All statuses'}</option>
          ))}
        </select>
        <select className="input w-48" value={application} onChange={(e) => setParam('application', e.target.value)}>
          <option value="">All applications</option>
          <option value="moneyguard">MoneyGuard</option>
          <option value="opsguard">OpsGuard</option>
        </select>
      </div>
      <Card flush>
        {!items ? <div className="px-5"><LoadingBlock /></div> : <ExecutionTable executions={items} />}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[14px] text-muted">
            <span className="tabular">{meta.total} runs</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>Previous</Button>
              <span className="px-2 py-1">Page {page} of {meta.totalPages}</span>
              <Button size="sm" variant="secondary" disabled={page >= meta.totalPages} onClick={() => setParam('page', String(page + 1))}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ExecutionsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ExecutionsList />
    </Suspense>
  );
}
