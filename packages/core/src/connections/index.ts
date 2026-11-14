import { ConnectionModel } from '@athena/database';
import {
  ConnectionProvider,
  ResolvedConnection,
  UserScope,
  decryptSecret,
  logger,
  runInUserScope,
} from '@athena/shared';

/**
 * Load and decrypt every connection a user has. A connection that cannot be
 * decrypted is reported as broken instead of failing the whole scope.
 */
export async function loadUserScope(userId: string): Promise<UserScope> {
  const docs = await ConnectionModel.find({ userId })
    .select('+secretsEncrypted provider config webhookToken')
    .lean();

  const scope: UserScope = { userId, connections: {}, broken: {} };
  for (const doc of docs) {
    const provider = doc.provider as ConnectionProvider;
    try {
      const secrets = JSON.parse(decryptSecret(doc.secretsEncrypted)) as Record<string, string>;
      const resolved: ResolvedConnection = {
        provider,
        secrets,
        config: (doc.config ?? {}) as Record<string, unknown>,
        webhookToken: doc.webhookToken,
      };
      scope.connections[provider] = resolved;
    } catch (error) {
      logger.warn('Could not load connection', { userId, provider, error: (error as Error).message });
      scope.broken![provider] = 'stored credentials could not be decrypted';
    }
  }
  return scope;
}

/**
 * Run fn with the user's connections available to connectors (bachs(),
 * github(), postSlackMessage(), OpsGuard services).
 */
export async function withUserScope<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const scope = await loadUserScope(userId);
  return runInUserScope(scope, fn);
}
