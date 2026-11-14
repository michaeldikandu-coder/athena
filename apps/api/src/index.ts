import { createServer } from 'http';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from '@athena/database';
import {
  agentRuntime,
  approvalManager,
  registerApplication,
  registerBuiltInTools,
  workflowEngine,
} from '@athena/core';
import { moneyGuardApp } from '@athena/moneyguard';
import { opsGuardApp } from '@athena/opsguard';
import { logger } from '@athena/shared';
import { createApp } from './app';
import { attachWebSocketServer } from './websocket/server';

/**
 * Connect to MongoDB. If it is unreachable the API still starts, so the
 * dashboard can show why; it keeps retrying in the background.
 */
async function connectWithBackgroundRetry(): Promise<void> {
  const RETRY_MS = 30000;
  const attempt = async (): Promise<void> => {
    try {
      await connectDatabase(config.mongoUri);
      const recovered = await agentRuntime.recoverInterrupted();
      if (recovered > 0) logger.warn('Marked interrupted executions as failed', { count: recovered });
    } catch (error) {
      console.error(`\n${(error as Error).message}\nThe API keeps running and retries every ${RETRY_MS / 1000}s.\n`);
      setTimeout(() => void attempt(), RETRY_MS);
    }
  };
  await attempt();
}

async function main(): Promise<void> {
  // Both applications plug into the same runtime
  registerBuiltInTools();
  registerApplication(moneyGuardApp);
  registerApplication(opsGuardApp);

  await connectWithBackgroundRetry();
  workflowEngine.start();
  const approvalCleanup = setInterval(() => {
    void approvalManager.cleanupExpired().catch((error) => logger.error('Approval cleanup failed', error));
  }, 60 * 1000);

  const server = createServer(createApp());
  const wss = attachWebSocketServer(server);

  server.listen(config.port, () => {
    logger.info(`Athena API listening on port ${config.port}`, {
      corsOrigins: config.corsOrigins,
      registration: config.allowRegistration,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    clearInterval(approvalCleanup);
    workflowEngine.stop();
    wss.close();
    server.close();
    await disconnectDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  // Print the reason on its own line so it is not lost in a stack trace
  console.error(`\nAthena API did not start: ${(error as Error).message}\n`);
  process.exit(1);
});
