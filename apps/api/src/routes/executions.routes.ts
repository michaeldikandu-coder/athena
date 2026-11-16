import { Router } from 'express';
import { z } from 'zod';
import { AgentModel, ExecutionModel } from '@athena/database';
import { agentRuntime, approvalManager, executionMonitor } from '@athena/core';
import { NotFoundError, commonSchemas, paginatedResponse, successResponse } from '@athena/shared';
import { asyncHandler, idParams, paginationQuery, validate } from '../middleware/validate';
import { serializeApproval, serializeExecution } from '../services/serializers';

const router = Router();

const listQuery = paginationQuery.extend({
  status: z.enum(['pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled']).optional(),
  agentId: commonSchemas.objectId.optional(),
  application: z.string().max(50).optional(),
  workflowId: commonSchemas.objectId.optional(),
});

async function agentNames(ids: string[]): Promise<Map<string, string>> {
  const agents = await AgentModel.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(agents.map((a) => [String(a._id), a.name]));
}

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const filter: Record<string, unknown> = { userId: req.user!.id };
    if (q.status) filter.status = q.status;
    if (q.agentId) filter.agentId = q.agentId;
    if (q.application) filter.application = q.application;
    if (q.workflowId) filter.workflowId = q.workflowId;

    const [items, total] = await Promise.all([
      ExecutionModel.find(filter)
        .sort({ startedAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      ExecutionModel.countDocuments(filter),
    ]);
    const names = await agentNames(Array.from(new Set(items.map((e) => e.agentId))));
    res.json(
      paginatedResponse(
        items.map((e) => serializeExecution(e, names.get(e.agentId))),
        q.page,
        q.limit,
        total
      )
    );
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [byStatus, byApp, pendingApprovals] = await Promise.all([
      ExecutionModel.aggregate([
        { $match: { userId, startedAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ExecutionModel.aggregate([
        { $match: { userId, startedAt: { $gte: since } } },
        {
          $group: {
            _id: { $ifNull: ['$application', 'custom'] },
            count: { $sum: 1 },
            toolCalls: { $sum: '$toolCallCount' },
          },
        },
      ]),
      approvalManager.list({ userId, status: 'pending', limit: 200 }),
    ]);
    res.json(
      successResponse({
        windowDays: 7,
        byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
        byApplication: byApp.map((a) => ({ application: a._id, executions: a.count, toolCalls: a.toolCalls })),
        pendingApprovals: pendingApprovals.length,
        activeExecutions: await agentRuntime.countActive(userId),
      })
    );
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const execution = await ExecutionModel.findOne({ _id: req.params.id, userId: req.user!.id }).lean();
    if (!execution) throw new NotFoundError('Execution', req.params.id);

    const [timeline, approvals, names] = await Promise.all([
      executionMonitor.getTimeline(req.params.id),
      approvalManager.list({ userId: req.user!.id, executionId: req.params.id }),
      agentNames([execution.agentId]),
    ]);
    res.json(
      successResponse({
        ...serializeExecution(execution, names.get(execution.agentId)),
        timeline,
        approvals: approvals.map(serializeApproval),
      })
    );
  })
);

router.post(
  '/:id/cancel',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await agentRuntime.cancel(req.params.id, req.user!.id);
    res.json(successResponse({ cancelRequested: true }));
  })
);

export default router;
