'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { ToolDescriptor } from '@/lib/types';
import { Badge, Card, ErrorBanner, JsonBlock, LoadingBlock, PageHeader } from '@/components/ui';

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDescriptor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<ToolDescriptor[]>('/tools')
      .then(({ data }) => setTools(data))
      .catch((err) => setError(describeError(err)));
  }, []);

  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    return (tools ?? []).filter(
      (t) => !q || t.id.includes(q) || t.description.toLowerCase().includes(q) || t.usedBy.some((u) => u.includes(q))
    );
  }, [tools, filter]);

  if (!tools && !error) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        eyebrow="Build"
        title="Tool registry for every agent"
        description="Each tool declares its input schema, its risk level, and the permissions an agent needs. High-risk tools always wait for approval."
      />
      <ErrorBanner message={error} />
      <input aria-label="Filter tools" className="input mb-5 max-w-sm" placeholder="Filter tools or applications" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Card flush>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="table-head pl-5">Tool</th>
              <th className="table-head">Risk</th>
              <th className="table-head">Permissions</th>
              <th className="table-head">Used by</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <Fragment key={t.id}>
                <tr className="cursor-pointer transition-colors hover:bg-hover" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <td className="table-cell pl-5">
                    <div className="font-mono text-[15px] text-ink">{t.id}</div>
                    <div className="text-label text-muted">{t.description}</div>
                  </td>
                  <td className="table-cell whitespace-nowrap">
                    <Badge tone={t.permissionLevel}>{t.permissionLevel}</Badge>
                    {t.requiresApproval && <Badge tone="medium" className="ml-1">approval</Badge>}
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-1">
                      {t.requiredPermissions.map((p) => (
                        <Badge key={p}>{p}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-1">
                      {t.usedBy.map((u) => (
                        <Badge key={u} tone={t.usedBy.length > 1 ? 'action' : 'neutral'}>{u}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
                {open === t.id && (
                  <tr>
                    <td colSpan={4} className="table-cell bg-bg">
                      <div className="label">Input schema sent to the model</div>
                      <JsonBlock value={t.inputSchema} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
