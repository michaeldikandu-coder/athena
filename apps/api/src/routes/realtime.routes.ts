import { Router } from 'express';
import { z } from 'zod';
import { ApprovalModel, ExecutionEventModel, ExecutionModel } from '@athena/database';
import { executionMonitor, maybeRunMaintenance, runInBackground } from '@athena/core';
import { successResponse } from '@athena/shared';
import { asyncHandler, validate } from '../middleware/validate';

/**
 * Live updates by polling. Works the same on a long-lived server and on
 * serverless hosts, where WebSocket servers are not available.
 *
 * GET /api/realtime?since=<ISO time> returns everything that changed for the
 * signed-in user since then, in the same message shapes the dashboard used to
 * receive over a WebSocket, plus the cursor for the next call.
 */
const router = Router();

const query = z.object({ since: z.string().datetime({ offset: true }).optional() });

/** Overlap between polls so writes that land during a poll are not missed; clients dedupe */
const OVERLAP_MS = 2000;
const MAX_WINDOW_MS = 10 * 60 * 1000;

router.get(
  '/',
  validate({ query }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = Date.now();
    const requested = req.query.since ? new Date(String(req.query.since)).getTime() : now;
    const since = new Date(Math.max(requested, now - MAX_WINDOW_MS));
    const cursor = new Date(now - OVERLAP_MS).toISOString();

    const [executions, approvals] = await Promise.all([
      ExecutionModel.find({ userId, updatedAt: { $gt: since } })
        .select('agentId status error updatedAt')
        .sort({ updatedAt: 1 })
        .limit(100)
        .lean(),
      ApprovalModel.find({ userId, updatedAt: { $gt: since } })
        .select('executionId status requestedAction.tool updatedAt')
        .sort({ updatedAt: 1 })
        .limit(100)
        .lean(),
    ]);

    const executionIds = executions.map((e) => String(e._id));
    const events = executionIds.length
      ? await ExecutionEventModel.find({ executionId: { $in: executionIds }, timestamp: { $gt: since } })
          .sort({ timestamp: 1, _id: 1 })
          .limit(500)
          .lean()
      : [];

    const at = new Date(now).toISOString();
    const messages = [
      ...events.map((e) => ({ type: 'execution.event', data: executionMonitor.serialize(e as never), timestamp: at })),
      ...executions.map((e) => ({
        type: 'execution.status',
        data: { executionId: String(e._id), agentId: e.agentId, status: e.status, error: e.error, updatedAt: e.updatedAt },
        timestamp: at,
      })),
      ...approvals.map((a) => ({
        type: a.status === 'pending' ? 'approval.requested' : 'approval.decided',
        data: {
          approvalId: String(a._id),
          executionId: a.executionId,
          status: a.status,
          tool: a.requestedAction?.tool,
          updatedAt: a.updatedAt,
        },
        timestamp: at,
      })),
    ];

    // Dashboard traffic keeps schedules and stalled runs moving on hosts without timers
    runInBackground(() => maybeRunMaintenance());

    res.json(successResponse({ cursor, messages }));
  })
);

export default router;
