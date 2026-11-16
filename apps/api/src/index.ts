import { createServer } from 'http';
import { config } from './config';
import { disconnectDatabase } from '@athena/database';
import { resumeStalledRuns, workflowEngine } from '@athena/core';
import { logger } from '@athena/shared';
import { createApp } from './app';
import { ensureDatabase, registerApplications } from './bootstrap';

/**
 * Long-lived server mode (e.g. `npm run dev:api` or a container host). The
 * same API also runs inside the dashboard's Next.js app, which is how it is
 * deployed to Vercel (see serverless.ts).
 */

/**
 * Connect to MongoDB. If it is unreachable the API still starts, so the
 * dashboard can show why; it keeps retrying in the background.
 */
async function connectWithBackgroundRetry(): Promise<void> {
  const RETRY_MS = 30000;
  const attempt = async (): Promise<void> => {
    try {
      await ensureDatabase({ retryAttempts: 3 });
      const resumed = await resumeStalledRuns();
      if (resumed > 0) logger.info('Resumed runs interrupted by a restart', { count: resumed });
    } catch (error) {
      console.error(`\n${(error as Error).message}\nThe API keeps running and retries every ${RETRY_MS / 1000}s.\n`);
      setTimeout(() => void attempt(), RETRY_MS);
    }
  };
  await attempt();
}

async function main(): Promise<void> {
  registerApplications();
  await connectWithBackgroundRetry();
  // Event-bus triggers plus a maintenance tick every minute
  workflowEngine.start();

  const server = createServer(createApp());
  server.listen(config.port, () => {
    logger.info(`Athena API listening on port ${config.port}`, {
      corsOrigins: config.corsOrigins,
      registration: config.allowRegistration,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    workflowEngine.stop();
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
