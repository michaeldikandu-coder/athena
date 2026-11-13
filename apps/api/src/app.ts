import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { getDatabaseHealth } from '@athena/database';
import { successResponse } from '@athena/shared';
import { config } from './config';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import authRoutes from './routes/auth.routes';
import agentRoutes from './routes/agents.routes';
import toolRoutes from './routes/tools.routes';
import executionRoutes from './routes/executions.routes';
import approvalRoutes from './routes/approvals.routes';
import workflowRoutes from './routes/workflows.routes';
import appRoutes from './routes/apps.routes';
import webhookRoutes from './routes/webhooks.routes';
import eventRoutes from './routes/events.routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin/server-to-server requests (no Origin header) and configured origins
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: '1mb',
      // Keep the raw bytes for webhook signature verification
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    })
  );
  app.use(cookieParser());

  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false })
  );

  app.get('/api/health', (_req, res) => {
    const db = getDatabaseHealth();
    res.status(db ? 200 : 503).json(successResponse({ status: db ? 'ok' : 'degraded', database: db }));
  });

  // Public
  app.use('/api/auth', authRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // Authenticated
  app.use('/api/agents', requireAuth, agentRoutes);
  app.use('/api/tools', requireAuth, toolRoutes);
  app.use('/api/executions', requireAuth, executionRoutes);
  app.use('/api/approvals', requireAuth, approvalRoutes);
  app.use('/api/workflows', requireAuth, workflowRoutes);
  app.use('/api/apps', requireAuth, appRoutes);
  app.use('/api/events', requireAuth, eventRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
