import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';

/**
 * Run the Athena API inside another Node HTTP handler, e.g. a Next.js API
 * route on Vercel. There is no long-lived process there, so:
 * - background work is kept alive with the host's waitUntil(),
 * - a run that needs more than one function's time continues in a new
 *   invocation through a signed request to /api/internal/runs/:id/continue,
 * - periodic work runs from /api/internal/cron/tick and dashboard polling.
 */

export interface ServerlessOptions {
  /** Keep the invocation alive until the promise settles (Vercel: waitUntil from @vercel/functions) */
  waitUntil?: (promise: Promise<unknown>) => void;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function sendJson(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ success: false, data: null, error: { message } }));
}

export function createServerlessHandler(options: ServerlessOptions = {}): Handler {
  let app: Express | null = null;
  let setupError: string | null = null;
  let ensureDatabase: (() => Promise<void>) | null = null;

  const setup = async (): Promise<void> => {
    if (app || setupError) return;
    try {
      // Loaded lazily so a configuration error (e.g. a short JWT_SECRET) is
      // reported in the response instead of crashing every request
      const core = await import('@athena/core');
      const { config } = await import('./config');
      const { runContinuationSignature } = await import('./services/webhook-secrets');
      const bootstrap = await import('./bootstrap');
      const { createApp } = await import('./app');

      if (options.waitUntil) core.setBackgroundRunner(options.waitUntil);
      const base = config.publicUrl.replace(/\/$/, '');
      core.setContinuationHandler(async (executionId) => {
        const response = await fetch(`${base}/api/internal/runs/${executionId}/continue`, {
          method: 'POST',
          headers: { 'x-athena-signature': runContinuationSignature(executionId) },
        });
        if (response.status !== 202) {
          throw new Error(`Run continuation returned ${response.status}; maintenance will resume it`);
        }
      });

      bootstrap.registerApplications();
      ensureDatabase = () => bootstrap.ensureDatabase();
      app = createApp();
    } catch (error) {
      setupError = (error as Error).message;
      console.error(`Athena API is misconfigured: ${setupError}`);
    }
  };

  return async (req, res) => {
    await setup();
    if (!app) {
      sendJson(res, 500, `Server configuration error: ${setupError}`);
      return;
    }
    // A database outage is reported by the routes (503) and /api/health
    await ensureDatabase!().catch(() => undefined);
    const express = app;
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      express(req as never, res as never);
    });
  };
}
