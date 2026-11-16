'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, describeError } from '@/lib/api';
import type { Agent, ToolDescriptor } from '@/lib/types';
import { Badge, Button, ErrorBanner } from './ui';

const MEMORY = ['read:memory', 'write:memory'];

export interface AgentFormValue {
  name: string;
  description: string;
  systemPrompt: string;
  provider: 'anthropic' | 'groq';
  model: string;
  maxIterations: number;
  permissions: string[];
  tools: string[];
}

export function agentToForm(agent: Agent): AgentFormValue {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    provider: agent.modelConfig.provider,
    model: agent.modelConfig.model,
    maxIterations: agent.maxIterations,
    permissions: agent.permissions,
    tools: agent.tools,
  };
}

export const EMPTY_AGENT: AgentFormValue = {
  name: '',
  description: '',
  systemPrompt: 'You are a helpful operations agent. Investigate carefully and explain your findings.',
  provider: 'groq',
  model: '',
  maxIterations: 15,
  permissions: ['read:memory', 'write:memory'],
  tools: [],
};

export function AgentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: AgentFormValue;
  submitLabel: string;
  onSubmit: (value: AgentFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<AgentFormValue>(initial);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [newPermission, setNewPermission] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ToolDescriptor[]>('/tools')
      .then(({ data }) => setTools(data.filter((t) => t.category !== 'memory')))
      .catch((err) => setError(describeError(err)));
  }, []);

  const set = <K extends keyof AgentFormValue>(key: K, v: AgentFormValue[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  const [advanced, setAdvanced] = useState(false);

  const requiredBy = useCallback(
    (ids: string[]) => new Set(tools.filter((t) => ids.includes(t.id)).flatMap((t) => t.requiredPermissions)),
    [tools]
  );

  // Permissions follow the tools: ticking a tool grants what it needs,
  // unticking removes what no other selected tool needs. Memory stays on.
  const toggleTool = (id: string) =>
    setValue((prev) => {
      const nextTools = prev.tools.includes(id) ? prev.tools.filter((t) => t !== id) : [...prev.tools, id];
      const before = requiredBy(prev.tools);
      const after = requiredBy(nextTools);
      const kept = prev.permissions.filter((p) => after.has(p) || !before.has(p) || MEMORY.includes(p));
      return { ...prev, tools: nextTools, permissions: Array.from(new Set([...kept, ...after])) };
    });

  // Older agents may lack a permission their tools need; offer to add it
  const missing = useMemo(() => {
    const required = requiredBy(value.tools);
    return Array.from(required).filter((p) => !value.permissions.includes(p));
  }, [requiredBy, value.tools, value.permissions]);

  const auto = requiredBy(value.tools);
  const extra = value.permissions.filter((p) => !auto.has(p) && !MEMORY.includes(p));
  const memoryOn = MEMORY.every((p) => value.permissions.includes(p));

  const addPermission = (p: string) => {
    const trimmed = p.trim();
    if (trimmed && !value.permissions.includes(trimmed)) set('permissions', [...value.permissions, trimmed]);
    setNewPermission('');
  };

  const groups = useMemo(() => {
    const order: Array<[string, (t: ToolDescriptor) => boolean]> = [
      ['Your custom tools', (t) => t.category === 'custom'],
      ['Payments (Bachs)', (t) => (t.connections ?? []).includes('bachs') || t.id === 'create_case'],
      ['Services and deploys', (t) => (t.connections ?? []).some((c) => c === 'services' || c === 'github')],
      ['Notifications and other', () => true],
    ];
    const used = new Set<string>();
    return order
      .map(([label, test]) => {
        const items = tools.filter((t) => !used.has(t.id) && test(t));
        items.forEach((t) => used.add(t.id));
        return { label, items };
      })
      .filter((g) => g.items.length > 0);
  }, [tools]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBanner message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" required maxLength={100} value={value.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" required maxLength={500} value={value.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">System prompt</label>
        <textarea
          className="input min-h-[12rem] font-mono text-label"
          required
          minLength={10}
          maxLength={20000}
          value={value.systemPrompt}
          onChange={(e) => set('systemPrompt', e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label">Model provider</label>
          <select
            className="input"
            value={value.provider}
            onChange={(e) =>
              // A model name belongs to one provider; clear it so the server default for the new one is used
              setValue((prev) => ({ ...prev, provider: e.target.value as 'anthropic' | 'groq', model: '' }))
            }
          >
            <option value="groq">Groq (free tier)</option>
            <option value="anthropic">Anthropic Claude</option>
          </select>
        </div>
        {advanced && (
          <>
            <div>
              <label className="label">Model</label>
              <input className="input" placeholder="Server default" maxLength={100} value={value.model} onChange={(e) => set('model', e.target.value)} />
            </div>
            <div>
              <label className="label">Max iterations</label>
              <input className="input" type="number" min={1} max={50} value={value.maxIterations} onChange={(e) => set('maxIterations', Number(e.target.value))} />
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <label className="label mb-0">What the agent can do</label>
          <Link href="/custom-tools" className="link text-[13px]">Add your own API as a tool</Link>
        </div>
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 text-[13px] text-muted">{group.label}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {group.items.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-line p-2 hover:border-line-strong">
                    <input type="checkbox" className="mt-1" checked={value.tools.includes(t.id)} onChange={() => toggleTool(t.id)} />
                    <span>
                      <span className="text-[14px] font-medium text-ink">{t.name}</span>{' '}
                      {t.requiresApproval && <Badge tone="medium" className="ml-1">asks you first</Badge>}
                      <span className="block text-label text-muted">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Permissions are set from the tools you pick{auto.size > 0 && <>: <span className="mono">{Array.from(auto).join(', ')}</span></>}.
          {memoryOn ? ' The agent can remember facts between runs.' : ''}
        </p>
        {missing.length > 0 && (
          <div className="mt-2 rounded-md border border-warn-line bg-warn-soft p-2 text-label text-warn">
            Some selected tools need permissions this agent does not have:{' '}
            {missing.map((p) => (
              <button type="button" key={p} onClick={() => addPermission(p)} className="mr-1 font-mono underline">
                + {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-line">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[14px] font-medium text-ink-soft hover:text-ink"
          aria-expanded={advanced}
          onClick={() => setAdvanced((a) => !a)}
        >
          Advanced: model, iterations, memory, extra permissions
          <span aria-hidden>{advanced ? '−' : '+'}</span>
        </button>
        {advanced && (
          <div className="space-y-4 border-t border-line p-3">
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={memoryOn}
                onChange={(e) =>
                  set(
                    'permissions',
                    e.target.checked
                      ? Array.from(new Set([...value.permissions, ...MEMORY]))
                      : value.permissions.filter((p) => !MEMORY.includes(p))
                  )
                }
              />
              Remember facts between runs (memory tools)
            </label>
            <div>
              <div className="label">Extra permissions</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {extra.length === 0 && <span className="text-[13px] text-muted">None</span>}
                {extra.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => set('permissions', value.permissions.filter((x) => x !== p))}
                    className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-soft hover:bg-bad-soft hover:text-bad"
                    title="Remove"
                  >
                    {p} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input max-w-xs font-mono text-label"
                  placeholder="read:transactions"
                  value={newPermission}
                  onChange={(e) => setNewPermission(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPermission(newPermission);
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => addPermission(newPermission)}>Add</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Button type="submit" loading={busy}>{submitLabel}</Button>
    </form>
  );
}

export function formToBody(value: AgentFormValue) {
  return {
    name: value.name,
    description: value.description,
    systemPrompt: value.systemPrompt,
    modelConfig: { provider: value.provider, model: value.model.trim() || undefined },
    maxIterations: value.maxIterations,
    permissions: value.permissions,
    tools: value.tools,
  };
}
