import { randomBytes } from 'crypto';
import { z } from 'zod';
import { ConnectionModel, IConnection } from '@athena/database';
import {
  hmacSha256Hex,
  isBachsKey,
  isSlackWebhookUrl,
  normalizeRepo,
  postSlackMessageTo,
  verifyBachsKey,
  verifyGithubAccess,
} from '@athena/integrations';
import { checkHealth, privateUrlsAllowed, servicesListSchema } from '@athena/opsguard';
import {
  AppError,
  CONNECTION_LABELS,
  CONNECTION_PROVIDERS,
  ConnectionProvider,
  IntegrationError,
  NotFoundError,
  decryptSecret,
  encryptSecret,
  logger,
} from '@athena/shared';
import { config } from '../config';

/**
 * Per-user connections to third-party services. Secrets are encrypted at
 * rest, verified against the provider before saving, and never returned to
 * the browser; the dashboard only sees masked hints.
 */

// ---------- Input schemas ----------

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const connectionInputSchemas = {
  bachs: z
    .object({
      apiKey: trimmed(250).refine(isBachsKey, 'Bachs secret keys start with sk_sandbox_ or sk_live_').optional(),
      /** Empty string removes the stored webhook secret */
      webhookSecret: z.string().trim().max(250).optional(),
    })
    .strict(),
  github: z
    .object({
      token: trimmed(300).optional(),
      repo: trimmed(200).refine((r) => normalizeRepo(r) !== null, 'Use owner/repo or https://github.com/owner/repo'),
    })
    .strict(),
  slack: z
    .object({
      webhookUrl: trimmed(500)
        .refine(isSlackWebhookUrl, 'Slack incoming webhook URLs start with https://hooks.slack.com/')
        .optional(),
    })
    .strict(),
  services: z.object({ services: servicesListSchema }).strict(),
} satisfies Record<ConnectionProvider, z.ZodTypeAny>;

export type ConnectionInput<P extends ConnectionProvider> = z.infer<(typeof connectionInputSchemas)[P]>;

const REQUIRED_SECRETS: Record<ConnectionProvider, string[]> = {
  bachs: ['apiKey'],
  github: ['token'],
  slack: ['webhookUrl'],
  services: [],
};

/** Events each webhook endpoint should be subscribed to on the provider side */
const WEBHOOK_EVENTS: Partial<Record<ConnectionProvider, string[]>> = {
  bachs: ['collection.failed', 'collection.succeeded', 'collection.underpaid', 'dispute.created', 'checkout.expired'],
  github: ['workflow_run'],
};

// ---------- Views ----------

export interface ConnectionView {
  provider: ConnectionProvider;
  label: string;
  connected: boolean;
  status: 'connected' | 'error' | 'not_connected';
  hints: Record<string, string>;
  config: Record<string, unknown>;
  lastVerifiedAt: string | null;
  lastError: string | null;
  lastWebhookAt: string | null;
  updatedAt: string | null;
  webhook: {
    url: string;
    events: string[];
    /** GitHub: Athena generates the secret the user pastes into GitHub */
    secret?: string;
    /** Bachs: Bachs generates the secret the user pastes into Athena */
    secretConfigured?: boolean;
  } | null;
}

function apiBase(): string {
  return config.publicUrl.replace(/\/$/, '');
}

export function githubWebhookSecret(token: string): string {
  return hmacSha256Hex(config.webhookSigningSecret, `github:${token}`);
}

function webhookView(doc: Pick<IConnection, 'provider' | 'webhookToken' | 'hints'>): ConnectionView['webhook'] {
  if (!doc.webhookToken) return null;
  if (doc.provider === 'bachs') {
    return {
      url: `${apiBase()}/api/webhooks/bachs/${doc.webhookToken}`,
      events: WEBHOOK_EVENTS.bachs!,
      secretConfigured: Boolean(doc.hints?.webhookSecret),
    };
  }
  if (doc.provider === 'github') {
    return {
      url: `${apiBase()}/api/webhooks/github/${doc.webhookToken}`,
      events: WEBHOOK_EVENTS.github!,
      secret: githubWebhookSecret(doc.webhookToken),
    };
  }
  return null;
}

function toView(provider: ConnectionProvider, doc?: IConnection | null): ConnectionView {
  if (!doc) {
    return {
      provider,
      label: CONNECTION_LABELS[provider],
      connected: false,
      status: 'not_connected',
      hints: {},
      config: {},
      lastVerifiedAt: null,
      lastError: null,
      lastWebhookAt: null,
      updatedAt: null,
      webhook: null,
    };
  }
  return {
    provider,
    label: CONNECTION_LABELS[provider],
    connected: true,
    status: doc.status,
    hints: doc.hints ?? {},
    config: doc.config ?? {},
    lastVerifiedAt: doc.lastVerifiedAt ? new Date(doc.lastVerifiedAt).toISOString() : null,
    lastError: doc.lastError ?? null,
    lastWebhookAt: doc.lastWebhookAt ? new Date(doc.lastWebhookAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    webhook: webhookView(doc),
  };
}

export async function listConnections(userId: string): Promise<ConnectionView[]> {
  const docs = (await ConnectionModel.find({ userId }).lean()) as IConnection[];
  const byProvider = new Map(docs.map((d) => [d.provider, d]));
  return CONNECTION_PROVIDERS.map((p) => toView(p, byProvider.get(p)));
}

export async function connectedProviders(userId: string): Promise<Set<ConnectionProvider>> {
  const docs = await ConnectionModel.find({ userId }).select('provider').lean();
  return new Set(docs.map((d) => d.provider as ConnectionProvider));
}

// ---------- Masking ----------

function maskSecret(value: string): string {
  if (value.startsWith('sk_sandbox_')) return `sk_sandbox_…${value.slice(-4)}`;
  if (value.startsWith('sk_live_')) return `sk_live_…${value.slice(-4)}`;
  const prefix = /^(ghp_|gho_|github_pat_|whsec_)/.exec(value)?.[1] ?? '';
  return `${prefix}…${value.slice(-4)}`;
}

function maskSlackUrl(url: string): string {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  return `hooks.slack.com/${parts[0] ?? ''}/…${(parts[parts.length - 1] ?? '').slice(-4)}`;
}

function hintsFor(provider: ConnectionProvider, secrets: Record<string, string>): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue;
    hints[key] = provider === 'slack' && key === 'webhookUrl' ? maskSlackUrl(value) : maskSecret(value);
  }
  return hints;
}

// ---------- Verification ----------

function providerMessage(provider: ConnectionProvider, error: unknown): string {
  const status = (error as AppError).context?.status as number | undefined;
  const label = CONNECTION_LABELS[provider];
  if (status === 401) return `${label} rejected these credentials (401). Check that you copied the whole value.`;
  if (status === 403) return `${label} accepted the credentials but denied access (403). Check the token's permissions.`;
  if (status === 404) {
    return provider === 'github'
      ? 'GitHub could not find that repository with this token (404). Check the name and that the token has access to it.'
      : `${label} returned 404 for the check request.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `${label} check failed: ${message.replace(/^Integration error \([^)]+\): /, '')}`;
}

interface Verified {
  config: Record<string, unknown>;
}

async function verify(
  provider: ConnectionProvider,
  secrets: Record<string, string>,
  input: Record<string, unknown>
): Promise<Verified> {
  try {
    switch (provider) {
      case 'bachs': {
        const { environment } = await verifyBachsKey(secrets.apiKey);
        return { config: { environment } };
      }
      case 'github': {
        const result = await verifyGithubAccess(secrets.token, String(input.repo));
        return { config: { repo: result.repo, canWrite: result.canWrite, private: result.private } };
      }
      case 'slack':
        return { config: {} };
      case 'services':
        return { config: { services: input.services } };
    }
  } catch (error) {
    if (error instanceof IntegrationError || (error as AppError).statusCode === 400) {
      throw new AppError(providerMessage(provider, error), { statusCode: 422, cause: error as Error });
    }
    throw error;
  }
}

// ---------- Save / delete / test ----------

async function loadSecrets(userId: string, provider: ConnectionProvider): Promise<{
  doc: (IConnection & { _id: unknown }) | null;
  secrets: Record<string, string>;
}> {
  const doc = (await ConnectionModel.findOne({ userId, provider }).select('+secretsEncrypted').lean()) as
    | (IConnection & { _id: unknown })
    | null;
  if (!doc) return { doc: null, secrets: {} };
  try {
    return { doc, secrets: JSON.parse(decryptSecret(doc.secretsEncrypted)) as Record<string, string> };
  } catch {
    // Unreadable secrets (key rotated): the user has to enter them again
    return { doc, secrets: {} };
  }
}

/**
 * Create or update a connection. Omitted secret fields keep their stored
 * value, so a user can change the repository without re-entering the token.
 */
export async function saveConnection(
  userId: string,
  provider: ConnectionProvider,
  rawInput: unknown
): Promise<ConnectionView> {
  const input = connectionInputSchemas[provider].parse(rawInput) as Record<string, unknown>;
  const { doc: existing, secrets: stored } = await loadSecrets(userId, provider);

  const secrets: Record<string, string> = { ...stored };
  for (const key of ['apiKey', 'webhookSecret', 'token', 'webhookUrl']) {
    if (typeof input[key] === 'string') secrets[key] = input[key] as string;
  }
  if (secrets.webhookSecret === '') delete secrets.webhookSecret;

  const missing = REQUIRED_SECRETS[provider].filter((k) => !secrets[k]);
  if (missing.length) {
    throw new AppError(`Missing ${missing.join(', ')} for ${CONNECTION_LABELS[provider]}`, { statusCode: 400 });
  }

  const verified = await verify(provider, secrets, input);
  const webhookToken =
    existing?.webhookToken ?? (WEBHOOK_EVENTS[provider] ? randomBytes(18).toString('base64url') : undefined);

  const doc = (await ConnectionModel.findOneAndUpdate(
    { userId, provider },
    {
      $set: {
        secretsEncrypted: encryptSecret(JSON.stringify(secrets)),
        config: verified.config,
        hints: hintsFor(provider, secrets),
        status: 'connected',
        lastVerifiedAt: new Date(),
        ...(webhookToken ? { webhookToken } : {}),
      },
      $unset: { lastError: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()) as IConnection;

  logger.info('Connection saved', { userId, provider, created: !existing });
  return toView(provider, doc);
}

export async function deleteConnection(userId: string, provider: ConnectionProvider): Promise<void> {
  const result = await ConnectionModel.deleteOne({ userId, provider });
  if (result.deletedCount === 0) throw new NotFoundError(`${CONNECTION_LABELS[provider]} connection`);
  logger.info('Connection removed', { userId, provider });
}

export interface TestResult {
  ok: boolean;
  message: string;
  details?: unknown;
}

/**
 * Re-check stored credentials. Slack sends a real test message; services are
 * checked over HTTP once each.
 */
export async function testConnection(userId: string, provider: ConnectionProvider): Promise<TestResult> {
  const { doc, secrets } = await loadSecrets(userId, provider);
  if (!doc) throw new NotFoundError(`${CONNECTION_LABELS[provider]} connection`);

  let result: TestResult;
  try {
    switch (provider) {
      case 'bachs': {
        if (!secrets.apiKey) throw new AppError('Stored key is unreadable; enter it again', { statusCode: 422 });
        const { environment } = await verifyBachsKey(secrets.apiKey);
        result = { ok: true, message: `Bachs accepted the key (${environment}).` };
        break;
      }
      case 'github': {
        if (!secrets.token) throw new AppError('Stored token is unreadable; enter it again', { statusCode: 422 });
        const check = await verifyGithubAccess(secrets.token, String(doc.config.repo));
        result = {
          ok: true,
          message: check.canWrite
            ? `Token can read and write ${check.repo}.`
            : `Token can read ${check.repo} but cannot write, so OpsGuard cannot open issues or re-run jobs.`,
        };
        break;
      }
      case 'slack': {
        if (!secrets.webhookUrl) throw new AppError('Stored URL is unreadable; enter it again', { statusCode: 422 });
        await postSlackMessageTo(secrets.webhookUrl, ':white_check_mark: Athena is connected to this channel.');
        result = { ok: true, message: 'Test message sent to Slack.' };
        break;
      }
      case 'services': {
        const parsed = servicesListSchema.safeParse(doc.config.services ?? []);
        const services = parsed.success ? parsed.data : [];
        const checks = await Promise.all(services.map((s) => checkHealth(s)));
        const down = checks.filter((c) => !c.healthy);
        result = {
          ok: down.length === 0,
          message: down.length
            ? `${down.length} of ${checks.length} services failed: ${down.map((d) => `${d.name} (${d.error ?? d.status})`).join(', ')}`
            : `All ${checks.length} services responded.`,
          details: checks,
        };
        break;
      }
    }
  } catch (error) {
    const message =
      error instanceof IntegrationError ? providerMessage(provider, error) : (error as Error).message;
    result = { ok: false, message };
  }

  await ConnectionModel.updateOne(
    { userId, provider },
    result.ok || provider === 'services'
      ? { $set: { status: 'connected', lastVerifiedAt: new Date() }, $unset: { lastError: 1 } }
      : { $set: { status: 'error', lastError: result.message } }
  );
  return result;
}

/** Whether OpsGuard can reach private addresses on this server (shown in Settings) */
export function serverPolicy(): { privateUrlsAllowed: boolean; apiUrl: string } {
  return { privateUrlsAllowed: privateUrlsAllowed(), apiUrl: apiBase() };
}

// ---------- Webhook lookup ----------

export async function findWebhookConnection(
  provider: 'bachs' | 'github',
  token: string
): Promise<{ userId: string; secret: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const doc = (await ConnectionModel.findOne({ provider, webhookToken: token })
    .select('+secretsEncrypted userId webhookToken')
    .lean()) as (IConnection & { _id: unknown }) | null;
  if (!doc) return null;

  if (provider === 'github') return { userId: doc.userId, secret: githubWebhookSecret(token) };
  try {
    const secrets = JSON.parse(decryptSecret(doc.secretsEncrypted)) as Record<string, string>;
    return { userId: doc.userId, secret: secrets.webhookSecret || null };
  } catch {
    return { userId: doc.userId, secret: null };
  }
}

export async function markWebhookReceived(provider: ConnectionProvider, token: string): Promise<void> {
  await ConnectionModel.updateOne({ provider, webhookToken: token }, { $set: { lastWebhookAt: new Date() } });
}
