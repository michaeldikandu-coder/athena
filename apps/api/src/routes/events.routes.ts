import { Router } from 'express';
import { z } from 'zod';
import { workflowEngine } from '@athena/core';
import { successResponse } from '@athena/shared';
import { asyncHandler, validate } from '../middleware/validate';

const router = Router();

const eventBody = z.object({
  event: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
  payload: z.record(z.unknown()).default({}),
});

/**
 * Emit a custom event that starts the user's matching "event" workflows
 */
router.post(
  '/',
  validate({ body: eventBody }),
  asyncHandler(async (req, res) => {
    const { event, payload } = req.body as z.infer<typeof eventBody>;
    const executionIds = await workflowEngine.handleTrigger({
      event,
      source: 'api',
      payload,
      userId: req.user!.id,
    });
    res.status(202).json(successResponse({ executionIds }));
  })
);

export default router;
