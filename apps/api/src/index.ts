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

async function main(): Promise<void> {
  await connectDatabase(config.mongoUri);

  // Both applications plug into the same runtime
  registerBuiltInTools();
  registerApplication(moneyGuardApp);
  registerApplication(opsGuardApp);

  const recovered = await agentRuntime.recoverInterrupted();
  if (recovered > 0) logger.warn('Marked interrupted executions as failed', { count: recovered });

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
  logger.error('Failed to start API', error as Error);
  process.exit(1);
});
