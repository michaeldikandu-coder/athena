import { Request, Router } from 'express';
import { WorkflowModel } from '@athena/database';
import { eventBus, workflowEngine } from '@athena/core';
import { verifyGithubSignature, verifyHmacSignature, verifyStripeSignature } from '@athena/integrations';
import { AppError, UnauthorizedError, commonSchemas, logger, successResponse } from '@athena/shared';
import { config } from '../config';
import { asyncHandler } from '../middleware/validate';
import { workflowWebhookSecret } from '../services/webhook-secrets';

const router = Router();

/**
 * Providers retry deliveries; remember recent ids so each event runs once.
 */
const seen = new Map<string, number>();
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
function alreadyProcessed(key: string): boolean {
  const now = Date.now();
  if (seen.size > 5000) {
    for (const [k, t] of seen) if (now - t > SEEN_TTL_MS) seen.delete(k);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

function rawBody(req: Request): Buffer {
  if (!req.rawBody) throw new AppError('Missing request body', { statusCode: 400 });
  return req.rawBody;
}

/**
 * Stripe: system-wide events, delivered to every matching workflow
 */
router.post('/stripe', (req, res) => {
  if (!config.stripeWebhookSecret) {
    res.status(503).json({ success: false, error: { message: 'Stripe webhook not configured' } });
    return;
  }
  if (!verifyStripeSignature(rawBody(req), req.header('stripe-signature'), config.stripeWebhookSecret)) {
    throw new UnauthorizedError('Invalid Stripe signature');
  }
  const event = req.body as { id: string; type: string; livemode: boolean };
  if (!event?.id || !event?.type) throw new AppError('Invalid Stripe event', { statusCode: 400 });

  // Respond quickly; processing happens asynchronously on the event bus
  res.json({ received: true });
  if (alreadyProcessed(`stripe:${event.id}`)) return;

  logger.info('Stripe webhook received', { type: event.type, id: event.id });
  eventBus.emit('trigger', { event: `stripe.${event.type}`, source: 'stripe', payload: req.body });
});

/**
 * GitHub: system-wide events, e.g. "github.workflow_run"
 */
router.post('/github', (req, res) => {
  if (!config.githubWebhookSecret) {
    res.status(503).json({ success: false, error: { message: 'GitHub webhook not configured' } });
    return;
  }
  if (!verifyGithubSignature(rawBody(req), req.header('x-hub-signature-256'), config.githubWebhookSecret)) {
    throw new UnauthorizedError('Invalid GitHub signature');
  }
  const eventName = req.header('x-github-event');
  const delivery = req.header('x-github-delivery');
  if (!eventName) throw new AppError('Missing X-GitHub-Event header', { statusCode: 400 });

  res.json({ received: true });
  if (eventName === 'ping' || (delivery && alreadyProcessed(`github:${delivery}`))) return;

  logger.info('GitHub webhook received', { event: eventName, delivery });
  eventBus.emit('trigger', { event: `github.${eventName}`, source: 'github', payload: req.body });
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
    if (deliveryId && alreadyProcessed(`workflow:${id}:${deliveryId}`)) {
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
