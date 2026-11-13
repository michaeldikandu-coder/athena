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
        title="Tool Registry"
        description="All tools registered with the runtime. Each tool declares an input schema, a risk level, and the permissions an agent needs to call it."
      />
      <ErrorBanner message={error} />
      <input className="input mb-4 max-w-sm" placeholder="Filter tools or applications" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Card>
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Tool</th>
              <th className="table-head">Risk</th>
              <th className="table-head">Permissions</th>
              <th className="table-head">Used by</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <Fragment key={t.id}>
                <tr className="cursor-pointer hover:bg-ink-850" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <td className="table-cell">
                    <div className="font-mono text-sm text-ink-100">{t.id}</div>
                    <div className="text-xs text-ink-400">{t.description}</div>
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
                        <Badge key={u} tone={t.usedBy.length > 1 ? 'accent' : 'neutral'}>{u}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
                {open === t.id && (
                  <tr>
                    <td colSpan={4} className="table-cell bg-ink-950">
                      <div className="label">Input schema (JSON Schema, as sent to the LLM)</div>
                      <JsonBlock value={t.inputSchema} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
