import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { driveRun, runInBackground, runMaintenance } from '@athena/core';
import { AppError, UnauthorizedError, commonSchemas, successResponse } from '@athena/shared';
import { asyncHandler } from '../middleware/validate';
import { runContinuationSignature } from '../services/webhook-secrets';

/**
 * Endpoints the platform calls itself: run continuations and the cron tick.
 */
const router = Router();

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Continue a run in a fresh invocation after the previous one used its time
 * slice. Signed with a secret derived from WEBHOOK_SIGNING_SECRET.
 */
router.post('/runs/:id/continue', (req, res) => {
  const id = req.params.id;
  if (!commonSchemas.objectId.safeParse(id).success) throw new UnauthorizedError('Invalid signature');
  if (!safeEqual(req.header('x-athena-signature') ?? '', runContinuationSignature(id))) {
    throw new UnauthorizedError('Invalid signature');
  }
  runInBackground(() => driveRun(id));
  res.status(202).json(successResponse({ continuing: true }));
});

/**
 * Maintenance tick: due scheduled workflows, expired approvals, stalled runs.
 * Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; any external cron
 * service can call it the same way.
 */
router.get(
  '/cron/tick',
  asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new AppError('Set CRON_SECRET to enable the cron endpoint', { statusCode: 503 });
    if (!safeEqual(req.header('authorization') ?? '', `Bearer ${secret}`)) {
      throw new UnauthorizedError('Invalid cron secret');
    }
    res.json(successResponse(await runMaintenance()));
  })
);

export default router;
