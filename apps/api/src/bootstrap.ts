import { connectDatabase, getDatabaseStatus } from '@athena/database';
import { registerApplication, registerBuiltInTools } from '@athena/core';
import { moneyGuardApp } from '@athena/moneyguard';
import { opsGuardApp } from '@athena/opsguard';
import { logger } from '@athena/shared';
import { config } from './config';
import { syncInstalledApplications } from './services/app-installer';

/**
 * Process-wide setup shared by the long-lived server (index.ts) and the
 * serverless handler (serverless.ts).
 */

let registered = false;

/** Both applications plug into the same runtime */
export function registerApplications(): void {
  if (registered) return;
  registerBuiltInTools();
  registerApplication(moneyGuardApp);
  registerApplication(opsGuardApp);
  registered = true;
}

let connecting: Promise<void> | null = null;
let synced = false;
let lastAttempt = 0;
const RETRY_AFTER_MS = 10_000;

/**
 * Connect to MongoDB once per process and bring installed apps up to date.
 * Failures are remembered (health shows the reason) and retried on a later
 * call, never more than once every 10 seconds, so requests do not pile up
 * behind a database that is down.
 */
export async function ensureDatabase(options: { retryAttempts?: number } = {}): Promise<void> {
  if (getDatabaseStatus().connected && synced) return;
  if (connecting) return connecting;
  if (Date.now() - lastAttempt < RETRY_AFTER_MS && !getDatabaseStatus().connected) return;
  lastAttempt = Date.now();

  connecting = (async () => {
    await connectDatabase(config.mongoUri, { retryAttempts: options.retryAttempts ?? 1, maxPoolSize: 10 });
    if (!synced) {
      // Installed MoneyGuard/OpsGuard agents follow the templates in the code
      const upgraded = await syncInstalledApplications();
      if (upgraded > 0) logger.info('Installed applications upgraded', { count: upgraded });
      synced = true;
    }
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}
