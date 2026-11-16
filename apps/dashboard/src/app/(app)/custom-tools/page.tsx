'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorBanner, JsonBlock, LoadingBlock, Mono, PageHeader } from '@/components/ui';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ToolInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

interface CustomTool {
  id: string;
  toolId: string;
  name: string;
  description: string;
  method: Method;
  url: string;
  inputs: ToolInput[];
  headers: Record<string, string>;
  secretHeaderName: string | null;
  secretHint: string | null;
  requiresApproval: boolean;
  permission: string;
}

interface Draft {
  name: string;
  description: string;
  method: Method;
  url: string;
  inputs: ToolInput[];
  headers: Array<{ key: string; value: string }>;
  secretHeaderName: string;
  secretValue: string;
  requiresApproval: boolean;
}

const EMPTY: Draft = {
  name: '',
  description: '',
  method: 'GET',
  url: '',
  inputs: [],
  headers: [],
  secretHeaderName: 'Authorization',
  secretValue: '',
  requiresApproval: false,
};

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]{0,40})\}/g;

function placeholders(url: string): string[] {
  return Array.from(new Set(Array.from(url.matchAll(PLACEHOLDER), (m) => m[1])));
}

function toDraft(tool: CustomTool): Draft {
  return {
    name: tool.name,
    description: tool.description,
    method: tool.method,
    url: tool.url,
    inputs: tool.inputs,
    headers: Object.entries(tool.headers).map(([key, value]) => ({ key, value })),
    secretHeaderName: tool.secretHeaderName ?? 'Authorization',
    secretValue: '',
    requiresApproval: tool.requiresApproval,
  };
}

function ToolForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: CustomTool | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(editing ? toDraft(editing) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Every {placeholder} in the URL becomes a required input
  const syncInputs = (url: string) =>
    setDraft((d) => {
      const names = placeholders(url);
      const existing = new Map(d.inputs.map((i) => [i.name, i]));
      const fromUrl = names.map((n) => existing.get(n) ?? { name: n, type: 'string' as const, description: '', required: true });
      const others = d.inputs.filter((i) => !names.includes(i.name));
      return { ...d, url, inputs: [...fromUrl, ...others] };
    });

  const updateInput = (i: number, patch: Partial<ToolInput>) =>
    set('inputs', draft.inputs.map((input, j) => (j === i ? { ...input, ...patch } : input)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        method: draft.method,
        url: draft.url.trim(),
        inputs: draft.inputs.filter((i) => i.name.trim()),
        headers: Object.fromEntries(draft.headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value])),
        secretHeaderName: draft.secretValue || editing?.secretHint ? draft.secretHeaderName.trim() : '',
        ...(draft.secretValue ? { secretValue: draft.secretValue } : {}),
        requiresApproval: draft.requiresApproval,
      };
      if (editing) await api(`/custom-tools/${editing.id}`, { method: 'PUT', body });
      else await api('/custom-tools', { body });
      onSaved();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const changesData = draft.method !== 'GET';

  return (
    <Card title={editing ? `Edit ${editing.name}` : 'New tool'}>
      <form onSubmit={save} className="space-y-5">
        <ErrorBanner message={error} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="ct-name">Name</label>
            <input id="ct-name" className="input" required minLength={2} maxLength={80} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Look up a Shopify order" />
          </div>
          <div>
            <label className="label" htmlFor="ct-desc">What it does (the agent reads this)</label>
            <input id="ct-desc" className="input" required minLength={10} maxLength={500} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Returns an order's status, items and shipping by order id" />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <label className="label" htmlFor="ct-method">Method</label>
            <select
              id="ct-method"
              className="input"
              value={draft.method}
              onChange={(e) => {
                const method = e.target.value as Method;
                setDraft((d) => ({ ...d, method, requiresApproval: method !== 'GET' }));
              }}
            >
              {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ct-url">URL</label>
            <input id="ct-url" className="input mono" required value={draft.url} onChange={(e) => syncInputs(e.target.value)} placeholder="https://api.example.com/orders/{orderId}" />
            <p className="mt-1.5 text-[13px] text-muted">
              Put inputs in braces, like <Mono>{'{orderId}'}</Mono>. Other inputs go in the query string for GET and DELETE, or the JSON body for POST, PUT and PATCH.
            </p>
          </div>
        </div>

        <div>
          <div className="label">Inputs the agent fills in</div>
          {draft.inputs.length === 0 && <p className="mb-2 text-[13px] text-muted">None yet. Add a {'{placeholder}'} to the URL or add one here.</p>}
          <div className="space-y-2">
            {draft.inputs.map((input, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,2fr)_auto_auto]">
                <input className="input mono" aria-label="Input name" value={input.name} onChange={(e) => updateInput(i, { name: e.target.value })} placeholder="orderId" />
                <select className="input" aria-label="Type" value={input.type} onChange={(e) => updateInput(i, { type: e.target.value as ToolInput['type'] })}>
                  <option value="string">text</option>
                  <option value="number">number</option>
                  <option value="boolean">yes/no</option>
                </select>
                <input className="input" aria-label="Description" value={input.description} onChange={(e) => updateInput(i, { description: e.target.value })} placeholder="The order number, e.g. 1042" />
                <label className="flex items-center gap-1.5 px-1 text-[13px]">
                  <input type="checkbox" checked={input.required} onChange={(e) => updateInput(i, { required: e.target.checked })} /> required
                </label>
                <Button type="button" size="sm" variant="ghost" className="h-11" onClick={() => set('inputs', draft.inputs.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => set('inputs', [...draft.inputs, { name: '', type: 'string', description: '', required: false }])}>
            Add input
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="ct-secret">Secret header (optional)</label>
            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2">
              <input className="input mono" aria-label="Secret header name" value={draft.secretHeaderName} onChange={(e) => set('secretHeaderName', e.target.value)} />
              <input
                id="ct-secret"
                type="password"
                autoComplete="off"
                className="input mono"
                value={draft.secretValue}
                onChange={(e) => set('secretValue', e.target.value)}
                placeholder={editing?.secretHint ? `Saved ${editing.secretHint}` : 'Bearer sk_...'}
              />
            </div>
            <p className="mt-1.5 text-[13px] text-muted">Encrypted, never shown again, and only sent with this tool&apos;s requests.</p>
          </div>
          <div>
            <div className="label">Other headers (optional)</div>
            <div className="space-y-2">
              {draft.headers.map((h, i) => (
                <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)_auto] gap-2">
                  <input className="input mono" aria-label="Header name" value={h.key} onChange={(e) => set('headers', draft.headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <input className="input mono" aria-label="Header value" value={h.value} onChange={(e) => set('headers', draft.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <Button type="button" size="sm" variant="ghost" className="h-11" onClick={() => set('headers', draft.headers.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => set('headers', [...draft.headers, { key: '', value: '' }])}>Add header</Button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-[14px]">
          <input type="checkbox" className="mt-1" checked={draft.requiresApproval} onChange={(e) => set('requiresApproval', e.target.checked)} />
          <span>
            Ask me before each call
            <span className="block text-[13px] text-muted">
              {changesData ? 'Recommended: this method can change data in the other system.' : 'Usually not needed for read-only lookups.'}
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" loading={saving}>{editing ? 'Save tool' : 'Create tool'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function TestPanel({ tool }: { tool: CustomTool }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ status: number; ok: boolean; body: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const input = Object.fromEntries(
      tool.inputs
        .filter((i) => values[i.name] !== undefined && values[i.name] !== '')
        .map((i) => [i.name, i.type === 'number' ? Number(values[i.name]) : i.type === 'boolean' ? values[i.name] === 'true' : values[i.name]])
    );
    try {
      const { data } = await api<{ status: number; ok: boolean; body: unknown }>(`/custom-tools/${tool.id}/test`, { body: { input } });
      setResult(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="text-[14px] font-medium">Try it</div>
      {tool.inputs.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {tool.inputs.map((i) => (
            <input
              key={i.name}
              className="input mono"
              aria-label={i.name}
              placeholder={`${i.name}${i.required ? '' : ' (optional)'}`}
              value={values[i.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))}
            />
          ))}
        </div>
      )}
      <Button size="sm" variant="secondary" loading={busy} onClick={() => void run()}>
        Send a real request
      </Button>
      <ErrorBanner message={error} />
      {result && (
        <div>
          <Badge tone={result.ok ? 'ok' : 'bad'}>HTTP {result.status}</Badge>
          <JsonBlock value={result.body} className="mt-2" />
        </div>
      )}
    </div>
  );
}

export default function CustomToolsPage() {
  const [tools, setTools] = useState<CustomTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomTool | 'new' | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTools((await api<CustomTool[]>('/custom-tools')).data);
    } catch (err) {
      setError(describeError(err));
      setTools([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (tool: CustomTool) => {
    if (!window.confirm(`Delete ${tool.name}? Agents using it lose it from their next run.`)) return;
    try {
      await api(`/custom-tools/${tool.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  };

  if (!tools) return <LoadingBlock />;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Build"
        title="Custom tools"
        description="Turn any HTTP API into a tool your agents can use: Shopify, Jira, Notion, your own backend. Describe one request; the agent fills in the inputs."
        actions={editing === null ? <Button onClick={() => setEditing('new')}>New tool</Button> : undefined}
      />
      <ErrorBanner message={error} />

      {editing !== null && (
        <div className="mb-6">
          <ToolForm
            key={editing === 'new' ? 'new' : editing.id}
            editing={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        </div>
      )}

      {tools.length === 0 && editing === null ? (
        <EmptyState title="No custom tools yet" action={<Button onClick={() => setEditing('new')}>Create your first tool</Button>}>
          For example: <Mono>GET https://api.example.com/orders/{'{orderId}'}</Mono> with an API key header. Then tick it when you create or edit an agent.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {tools.map((tool) => (
            <Card
              key={tool.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {tool.name}
                  <Badge tone={tool.method === 'GET' ? 'neutral' : 'warn'}>{tool.method}</Badge>
                  {tool.requiresApproval && <Badge tone="medium">asks you first</Badge>}
                </span>
              }
              actions={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setTesting(testing === tool.id ? null : tool.id)}>
                    {testing === tool.id ? 'Close test' : 'Test'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(tool)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(tool)}>Delete</Button>
                </div>
              }
            >
              <p className="text-[15px] text-ink-soft">{tool.description}</p>
              <p className="mt-2 break-all"><Mono>{tool.url}</Mono></p>
              <p className="mt-2 text-[13px] text-muted">
                Tool id <Mono>{tool.toolId}</Mono> · needs <Mono>{tool.permission}</Mono>
                {tool.inputs.length > 0 && <> · inputs {tool.inputs.map((i) => i.name).join(', ')}</>}
                {tool.secretHint && <> · secret {tool.secretHint}</>}
              </p>
              {testing === tool.id && <div className="mt-4"><TestPanel tool={tool} /></div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
