import { AsyncLocalStorage } from 'async_hooks';
import { AppError } from './errors';

/**
 * Third-party services a user can connect. Credentials are stored per user,
 * encrypted, and only loaded into memory for the duration of a tool call or
 * an API request made by that user.
 */
export const CONNECTION_PROVIDERS = ['bachs', 'github', 'slack', 'services'] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

export const CONNECTION_LABELS: Record<ConnectionProvider, string> = {
  bachs: 'Bachs',
  github: 'GitHub',
  slack: 'Slack',
  services: 'Monitored services',
};

export interface ResolvedConnection {
  provider: ConnectionProvider;
  /** Decrypted secret values, e.g. { apiKey } */
  secrets: Record<string, string>;
  /** Non-secret settings, e.g. { repo } */
  config: Record<string, unknown>;
  webhookToken?: string;
}

export interface UserScope {
  userId: string;
  connections: Partial<Record<ConnectionProvider, ResolvedConnection>>;
  /** Connections that exist but could not be loaded, with the reason */
  broken?: Partial<Record<ConnectionProvider, string>>;
}

const storage = new AsyncLocalStorage<UserScope>();

/**
 * Run fn with the given user's connections available to connectors.
 */
export function runInUserScope<T>(scope: UserScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export function currentUserScope(): UserScope | undefined {
  return storage.getStore();
}

export function findConnection(provider: ConnectionProvider): ResolvedConnection | undefined {
  return storage.getStore()?.connections[provider];
}

export class ConnectionMissingError extends AppError {
  constructor(provider: ConnectionProvider, reason?: string) {
    const label = CONNECTION_LABELS[provider];
    super(
      reason
        ? `${label} connection is broken: ${reason}. Reconnect it in Settings > Connections.`
        : `${label} is not connected for this account. Connect it in Settings > Connections.`,
      { statusCode: 409, context: { provider } }
    );
    this.name = 'ConnectionMissingError';
  }
}

/**
 * Get the current user's connection or throw a message the agent and the
 * dashboard can show as-is.
 */
export function requireConnection(provider: ConnectionProvider): ResolvedConnection {
  const scope = storage.getStore();
  if (!scope) {
    throw new AppError(`No user scope: ${CONNECTION_LABELS[provider]} credentials are only available inside a user request or run`);
  }
  const connection = scope.connections[provider];
  if (!connection) throw new ConnectionMissingError(provider, scope.broken?.[provider]);
  return connection;
}
