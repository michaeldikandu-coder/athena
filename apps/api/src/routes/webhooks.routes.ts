import { Request, Router } from 'express';
import { WebhookDeliveryModel, WorkflowModel } from '@athena/database';
import { runInBackground, workflowEngine } from '@athena/core';
import { verifyBachsSignature, verifyGithubSignature, verifyHmacSignature } from '@athena/integrations';
import { AppError, UnauthorizedError, commonSchemas, logger, successResponse } from '@athena/shared';
import { asyncHandler } from '../middleware/validate';
import { workflowWebhookSecret } from '../services/webhook-secrets';
import { findWebhookConnection, markWebhookReceived } from '../services/connections.service';

const router = Router();

/**
 * Providers retry deliveries; remember delivery ids (in MongoDB, for a day)
 * so each event runs once even across server instances.
 */
async function alreadyProcessed(key: string): Promise<boolean> {
  try {
    await WebhookDeliveryModel.create({ _id: key });
    return false;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return true;
    throw error;
  }
}

function rawBody(req: Request): Buffer {
  if (!req.rawBody) throw new AppError('Missing request body', { statusCode: 400 });
  return req.rawBody;
}

/**
 * Each user gets their own Bachs and GitHub webhook URL, shown in
 * Settings > Connections. The token in the URL picks the connection; the
 * signature is checked with that user's secret, and only that user's
 * workflows run. Providers expect a fast 2xx, so runs start asynchronously.
 */
router.post(
  '/bachs/:token',
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const connection = await findWebhookConnection('bachs', token);
    if (!connection) throw new AppError('Unknown webhook', { statusCode: 404 });
    if (!connection.secret) {
      throw new AppError('Add the Bachs webhook signing secret in Settings > Connections first', { statusCode: 409 });
    }
    if (!verifyBachsSignature(rawBody(req), (name) => req.header(name), connection.secret)) {
      throw new UnauthorizedError('Invalid Bachs signature');
    }

    const event = req.body as { id?: string; type?: string; data?: unknown };
    if (!event?.id || !event?.type || !event.data || typeof event.data !== 'object') {
      throw new AppError('Invalid Bachs event envelope', { statusCode: 400 });
    }

    const duplicate = await alreadyProcessed(`bachs:${token}:${event.id}`);
    res.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
    runInBackground(() => markWebhookReceived('bachs', token));
    if (duplicate) return;

    logger.info('Bachs webhook received', { type: event.type, id: event.id, userId: connection.userId });
    const body = req.body as Record<string, any>;
    runInBackground(() =>
      workflowEngine.handleTrigger({
        event: `bachs.${event.type}`,
        source: 'bachs',
        payload: body,
        userId: connection.userId,
      })
    );
  })
);

router.post(
  '/github/:token',
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const connection = await findWebhookConnection('github', token);
    if (!connection?.secret) throw new AppError('Unknown webhook', { statusCode: 404 });
    if (!verifyGithubSignature(rawBody(req), req.header('x-hub-signature-256'), connection.secret)) {
      throw new UnauthorizedError('Invalid GitHub signature');
    }
    const eventName = req.header('x-github-event');
    const delivery = req.header('x-github-delivery');
    if (!eventName) throw new AppError('Missing X-GitHub-Event header', { statusCode: 400 });

    const skip = eventName === 'ping' || (delivery ? await alreadyProcessed(`github:${token}:${delivery}`) : false);
    res.json({ received: true });
    runInBackground(() => markWebhookReceived('github', token));
    if (skip) return;

    logger.info('GitHub webhook received', { event: eventName, delivery, userId: connection.userId });
    const body = req.body as Record<string, any>;
    runInBackground(() =>
      workflowEngine.handleTrigger({
        event: `github.${eventName}`,
        source: 'github',
        payload: body,
        userId: connection.userId,
      })
    );
  })
);

/**
 * The old shared endpoints delivered one server's events to every account.
 * Point providers at the per-user URL from Settings > Connections instead.
 */
router.post(['/bachs', '/github'], (_req, res) => {
  res.status(410).json({
    success: false,
    error: {
      message:
        'This shared webhook URL was removed. Copy your personal webhook URL from Settings > Connections in the Athena dashboard.',
    },
  });
});

/**
 * Per-workflow webhook. Callers sign the raw body with the workflow's secret:
 *   X-Athena-Signature: sha256=<hex hmac>
 */
router.post(
  '/workflows/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!commonSchemas.objectId.safeParse(id).success) {
      throw new UnauthorizedError('Invalid signature');
    }
    if (!verifyHmacSignature(rawBody(req), req.header('x-athena-signature'), workflowWebhookSecret(id))) {
      throw new UnauthorizedError('Invalid signature');
    }
    const workflow = await WorkflowModel.findById(id).select('userId status trigger').lean();
    if (!workflow || workflow.trigger.type !== 'webhook') {
      throw new AppError('Workflow not found', { statusCode: 404 });
    }
    if (workflow.status !== 'active') {
      throw new AppError('Workflow is inactive', { statusCode: 409 });
    }
    const deliveryId = req.header('x-athena-delivery');
    if (deliveryId && (await alreadyProcessed(`workflow:${id}:${deliveryId}`))) {
      res.json(successResponse({ duplicate: true }));
      return;
    }

    const payload =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : { body: req.body };
    const eventName = typeof payload.event === 'string' ? payload.event : 'webhook.received';
    const started = await workflowEngine.handleTrigger({
      event: eventName,
      source: 'webhook',
      payload,
      userId: workflow.userId,
      workflowId: id,
    });
    res.status(202).json(successResponse({ executionIds: started }));
  })
);

export default router;
