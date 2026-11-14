'use client';

/* eslint-disable @next/next/no-img-element */
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Connection, ConnectionProvider, ConnectionsResponse, MonitoredService } from '@/lib/types';
import { Badge, Button, ErrorBanner, LoadingBlock, Mono, PageHeader } from '@/components/ui';

type Notice = { tone: 'ok' | 'bad'; text: string } | null;

function isLocal(url: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(url);
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShown(true);
    }
  };
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex gap-2">
        <input
          readOnly
          className="input mono min-w-0 flex-1 text-[13px]"
          value={shown ? value : '•'.repeat(24)}
          onFocus={(e) => shown && e.currentTarget.select()}
          aria-label={label}
        />
        {secret && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setShown((s) => !s)}>
            {shown ? 'Hide' : 'Show'}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

function StatusBadgeFor({ connection }: { connection: Connection }) {
  if (!connection.connected) return <Badge>Not connected</Badge>;
  if (connection.status === 'error') return <Badge tone="bad">Needs attention</Badge>;
  return <Badge tone="ok">Connected</Badge>;
}

/**
 * Shared frame: header, status, notices, test and disconnect actions.
 */
function ConnectionCard({
  connection,
  icon,
  intro,
  onChanged,
  testLabel = 'Test connection',
  children,
}: {
  connection: Connection;
  icon?: React.ReactNode;
  intro: React.ReactNode;
  onChanged: (next?: Connection) => void;
  testLabel?: string;
  children: (helpers: { save: (body: unknown) => Promise<boolean>; saving: boolean }) => React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const save = async (body: unknown): Promise<boolean> => {
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api<Connection>(`/connections/${connection.provider}`, { method: 'PUT', body });
      setNotice({ tone: 'ok', text: connection.connected ? 'Saved.' : `${connection.label} connected.` });
      onChanged(data);
      return true;
    } catch (err) {
      setNotice({ tone: 'bad', text: describeError(err) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const { data } = await api<{ ok: boolean; message: string }>(`/connections/${connection.provider}/test`, { method: 'POST' });
      setNotice({ tone: data.ok ? 'ok' : 'bad', text: data.message });
      onChanged();
    } catch (err) {
      setNotice({ tone: 'bad', text: describeError(err) });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Disconnect ${connection.label}? Athena deletes the stored credentials, and tools that need them stop working until you connect again.`)) return;
    setRemoving(true);
    setNotice(null);
    try {
      await api(`/connections/${connection.provider}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setNotice({ tone: 'bad', text: describeError(err) });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section id={connection.provider} className="card scroll-mt-28">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-bg">{icon}</span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[19px] font-medium tracking-[-0.01em]">{connection.label}</h2>
              <StatusBadgeFor connection={connection} />
            </div>
            <p className="mt-1 max-w-[64ch] text-[15px] leading-relaxed text-ink-soft">{intro}</p>
          </div>
        </div>
        {connection.connected && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={testing} onClick={() => void test()}>{testLabel}</Button>
            <Button size="sm" variant="ghost" loading={removing} onClick={() => void remove()}>Disconnect</Button>
          </div>
        )}
      </header>
      <div className="space-y-5 p-5">
        {notice && (
          <p role="status" className={clsx('rounded-md border px-3 py-2 text-[14px]', notice.tone === 'ok' ? 'border-ok-line bg-ok-soft text-ok' : 'border-bad-line bg-bad-soft text-bad')}>
            {notice.text}
          </p>
        )}
        {connection.connected && connection.lastError && !notice && (
          <p className="rounded-md border border-bad-line bg-bad-soft px-3 py-2 text-[14px] text-bad">{connection.lastError}</p>
        )}
        {children({ save, saving })}
        {connection.connected && (
          <p className="text-[13px] text-muted">
            {connection.lastVerifiedAt ? `Checked ${timeAgo(connection.lastVerifiedAt)}` : 'Not checked yet'}
            {connection.lastWebhookAt ? ` · last webhook ${timeAgo(connection.lastWebhookAt)}` : ''}
          </p>
        )}
      </div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 text-[14px] leading-relaxed text-ink-soft">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mono w-4 shrink-0 text-muted">{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- Bachs ----------

function BachsCard({ connection, onChanged }: { connection: Connection; onChanged: (c?: Connection) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const webhook = connection.webhook;

  return (
    <ConnectionCard
      connection={connection}
      onChanged={onChanged}
      icon={<span className="text-[13px] font-semibold text-ink">B</span>}
      intro="MoneyGuard reads payments, customers and disputes with your key, and flags customers or refunds only after you approve. OpsGuard uses it for checkout lookups."
    >
      {({ save, saving }) => (
        <>
          <form
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save({ apiKey: apiKey.trim() })) setApiKey('');
            }}
          >
            <Field
              id="bachs-key"
              label={connection.connected ? 'Replace secret key' : 'Secret key'}
              hint={
                connection.connected ? (
                  <>Current key <Mono>{connection.hints.apiKey}</Mono>{connection.config.environment && <> · {connection.config.environment === 'sandbox' ? 'sandbox' : 'live'}</>}</>
                ) : (
                  <>From the Bachs dashboard, Developers, API keys. Use an <Mono>sk_sandbox_</Mono> key while testing.</>
                )
              }
            >
              <input id="bachs-key" type="password" autoComplete="off" spellCheck={false} className="input mono" placeholder="sk_sandbox_…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </Field>
            <Button type="submit" className="md:mt-[24px]" loading={saving} disabled={apiKey.trim().length < 12}>
              {connection.connected ? 'Replace key' : 'Connect Bachs'}
            </Button>
          </form>

          {connection.config.environment === 'production' && (
            <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[14px] text-warn">
              This is a live key. Approved refunds move real money.
            </p>
          )}

          {webhook && (
            <div className="space-y-4 border-t border-line pt-5">
              <div>
                <h3 className="text-[16px] font-medium">Start runs automatically</h3>
                <p className="mt-1 text-[14px] text-ink-soft">Bachs sends payment and dispute events to your personal URL, and your MoneyGuard workflows start on their own.</p>
              </div>
              <CopyField label="Webhook URL" value={webhook.url} />
              <div>
                <div className="label">Events to send</div>
                <div className="flex flex-wrap gap-1.5">
                  {webhook.events.map((e) => <Badge key={e} className="mono font-normal">{e}</Badge>)}
                </div>
              </div>
              {isLocal(webhook.url) ? (
                <Steps
                  items={[
                    <>
                      Bachs cannot reach <Mono>localhost</Mono>, so forward events with the Bachs CLI:
                      <span className="mono mt-1.5 block break-all rounded-sm border border-line bg-bg px-2 py-1.5 text-[12.5px] text-ink">
                        bachs listen --forward-to {webhook.url.replace(/^https?:\/\//, '')} --events {webhook.events.join(',')}
                      </span>
                    </>,
                    'Paste the signing secret the CLI prints below.',
                  ]}
                />
              ) : (
                <Steps
                  items={[
                    'In the Bachs dashboard, open Developers, Webhooks, and add an endpoint.',
                    'Paste the webhook URL above and select the events listed.',
                    'Copy the signing secret Bachs shows and paste it below.',
                  ]}
                />
              )}
              <form
                className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await save({ webhookSecret: webhookSecret.trim() })) setWebhookSecret('');
                }}
              >
                <Field
                  id="bachs-whsec"
                  label="Webhook signing secret"
                  hint={webhook.secretConfigured ? <>Saved <Mono>{connection.hints.webhookSecret}</Mono>. Paste a new one to replace it.</> : 'Until this is set, Athena rejects events sent to your URL.'}
                >
                  <input id="bachs-whsec" type="password" autoComplete="off" spellCheck={false} className="input mono" placeholder="whsec_…" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
                </Field>
                <Button type="submit" className="md:mt-[24px]" variant="secondary" loading={saving} disabled={webhookSecret.trim().length < 8}>
                  Save secret
                </Button>
              </form>
            </div>
          )}
        </>
      )}
    </ConnectionCard>
  );
}

// ---------- GitHub ----------

function GithubCard({ connection, onChanged }: { connection: Connection; onChanged: (c?: Connection) => void }) {
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState(connection.config.repo ?? '');
  useEffect(() => setRepo(connection.config.repo ?? ''), [connection.config.repo]);
  const webhook = connection.webhook;

  return (
    <ConnectionCard
      connection={connection}
      onChanged={onChanged}
      icon={<img src="/icons/github.svg" alt="" width={16} height={16} />}
      intro="OpsGuard reads Actions runs, opens and updates incident issues, and re-runs failed jobs after you approve. It only works in the repository you set here."
    >
      {({ save, saving }) => (
        <>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save({ repo: repo.trim(), ...(token.trim() ? { token: token.trim() } : {}) })) setToken('');
            }}
          >
            <Field id="gh-repo" label="Repository" hint="owner/repo, or paste the repository URL.">
              <input id="gh-repo" className="input mono" placeholder="acme/shop" value={repo} onChange={(e) => setRepo(e.target.value)} />
            </Field>
            <Field
              id="gh-token"
              label={connection.connected ? 'Replace token' : 'Token'}
              hint={
                connection.connected ? (
                  <>Current token <Mono>{connection.hints.token}</Mono>{connection.config.canWrite === false && ' · read only, so OpsGuard cannot open issues'}</>
                ) : (
                  'A fine-grained token for this repository with Actions (read and write), Issues (read and write) and Metadata (read).'
                )
              }
            >
              <input id="gh-token" type="password" autoComplete="off" spellCheck={false} className="input mono" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" loading={saving} disabled={!repo.trim() || (!connection.connected && token.trim().length < 10)}>
                {connection.connected ? 'Save' : 'Connect GitHub'}
              </Button>
            </div>
          </form>

          {webhook && (
            <div className="space-y-4 border-t border-line pt-5">
              <div>
                <h3 className="text-[16px] font-medium">React to failed deploys</h3>
                <p className="mt-1 text-[14px] text-ink-soft">GitHub tells Athena when a workflow run finishes, and the failed-deployment workflow investigates failures.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <CopyField label="Payload URL" value={webhook.url} />
                {webhook.secret && <CopyField label="Secret" value={webhook.secret} secret />}
              </div>
              <Steps
                items={[
                  <>In the repository, open Settings, Webhooks, Add webhook.</>,
                  <>Paste the payload URL and secret, and set content type to <Mono>application/json</Mono>.</>,
                  <>Choose “Let me select individual events” and tick only <b className="font-medium text-ink">Workflow runs</b>.</>,
                  ...(isLocal(webhook.url) ? [<>GitHub cannot reach <Mono>localhost</Mono>. This works once Athena runs on a public URL.</>] : []),
                ]}
              />
            </div>
          )}
        </>
      )}
    </ConnectionCard>
  );
}

// ---------- Slack ----------

function SlackCard({ connection, onChanged }: { connection: Connection; onChanged: (c?: Connection) => void }) {
  const [url, setUrl] = useState('');
  return (
    <ConnectionCard
      connection={connection}
      onChanged={onChanged}
      testLabel="Send test message"
      icon={<img src="/icons/slack.svg" alt="" width={16} height={16} />}
      intro="Both agents post findings that need a person to one Slack channel, through the same send_notification tool."
    >
      {({ save, saving }) => (
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save({ webhookUrl: url.trim() })) setUrl('');
          }}
        >
          <Field
            id="slack-url"
            label={connection.connected ? 'Replace webhook URL' : 'Incoming webhook URL'}
            hint={connection.connected ? <>Current <Mono>{connection.hints.webhookUrl}</Mono></> : 'In Slack, create an app with Incoming Webhooks turned on, add a webhook to a channel, and copy its URL.'}
          >
            <input id="slack-url" type="password" autoComplete="off" spellCheck={false} className="input mono" placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Button type="submit" className="md:mt-[24px]" loading={saving} disabled={!url.trim().startsWith('https://hooks.slack.com/')}>
            {connection.connected ? 'Replace' : 'Connect Slack'}
          </Button>
        </form>
      )}
    </ConnectionCard>
  );
}

// ---------- Services ----------

const EMPTY_ROW: MonitoredService = { name: '', url: '' };

function ServicesCard({
  connection,
  privateAllowed,
  onChanged,
}: {
  connection: Connection;
  privateAllowed: boolean;
  onChanged: (c?: Connection) => void;
}) {
  const saved = connection.config.services ?? [];
  const [rows, setRows] = useState<MonitoredService[]>(saved.length ? saved : [EMPTY_ROW]);
  useEffect(() => {
    const next = connection.config.services ?? [];
    setRows(next.length ? next : [EMPTY_ROW]);
  }, [connection.config.services]);

  const update = (i: number, patch: Partial<MonitoredService>) =>
    setRows((list) => list.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const filled = rows.filter((r) => r.name.trim() || r.url.trim());

  return (
    <ConnectionCard
      connection={connection}
      onChanged={onChanged}
      testLabel="Check now"
      intro="The health-check URLs OpsGuard watches. The agent picks services by name and can never call a URL that is not on this list."
    >
      {({ save, saving }) => (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ services: filled.map((r) => ({ ...r, name: r.name.trim(), url: r.url.trim() })) });
          }}
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 md:grid">
            <span className="label mb-0">Name</span>
            <span className="label mb-0">Health-check URL</span>
            <span className="w-[76px]" />
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              <input className="input mono" aria-label={`Service ${i + 1} name`} placeholder="checkout-api" value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
              <input className="input mono" aria-label={`Service ${i + 1} URL`} placeholder="https://checkout.example.com/health" value={row.url} onChange={(e) => update(i, { url: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" className="h-11 w-[76px]" onClick={() => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [EMPTY_ROW]))}>
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 25} onClick={() => setRows((list) => [...list, EMPTY_ROW])}>
              Add service
            </Button>
            <Button type="submit" loading={saving} disabled={filled.some((r) => !r.name.trim() || !r.url.trim())}>
              Save services
            </Button>
          </div>
          <p className="text-[13px] text-muted">
            {privateAllowed
              ? 'This server allows private and localhost addresses, which is the default outside production.'
              : 'This server refuses private, localhost and cloud-metadata addresses. Use public URLs.'}
          </p>
        </form>
      )}
    </ConnectionCard>
  );
}

// ---------- Page ----------

const ORDER: ConnectionProvider[] = ['bachs', 'services', 'github', 'slack'];

export default function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData((await api<ConnectionsResponse>('/connections')).data);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Jump to the card named in the URL hash once it exists
  useEffect(() => {
    if (!data || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [data]);

  const onChanged = useCallback(
    (next?: Connection) => {
      if (next) {
        setData((prev) => prev && { ...prev, connections: prev.connections.map((c) => (c.provider === next.provider ? next : c)) });
      }
      void load();
    },
    [load]
  );

  if (error && !data) return <ErrorBanner message={error} />;
  if (!data) return <LoadingBlock />;

  const byProvider = new Map(data.connections.map((c) => [c.provider, c]));
  const connectedCount = data.connections.filter((c) => c.connected).length;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Connections"
        description="Connect your own accounts. Athena encrypts each key, shows only its last characters, and uses it only for your runs."
        actions={<span className="text-[14px] text-muted">{connectedCount} of {data.connections.length} connected</span>}
      />
      <ErrorBanner message={error} />
      <div className="grid gap-6">
        {ORDER.map((provider) => {
          const connection = byProvider.get(provider);
          if (!connection) return null;
          if (provider === 'bachs') return <BachsCard key={provider} connection={connection} onChanged={onChanged} />;
          if (provider === 'github') return <GithubCard key={provider} connection={connection} onChanged={onChanged} />;
          if (provider === 'slack') return <SlackCard key={provider} connection={connection} onChanged={onChanged} />;
          return <ServicesCard key={provider} connection={connection} privateAllowed={data.server.privateUrlsAllowed} onChanged={onChanged} />;
        })}
      </div>
    </div>
  );
}
