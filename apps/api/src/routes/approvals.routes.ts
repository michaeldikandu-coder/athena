import { Router } from 'express';
import { z } from 'zod';
import { AgentModel, ExecutionModel } from '@athena/database';
import { approvalManager } from '@athena/core';
import { NotFoundError, successResponse } from '@athena/shared';
import { asyncHandler, idParams, validate } from '../middleware/validate';
import { serializeApproval } from '../services/serializers';

const router = Router();

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const decisionBody = z.object({
  approved: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const approvals = await approvalManager.list({ userId: req.user!.id, status: q.status, limit: q.limit });

    // Attach agent name and task so reviewers have context
    const executionIds = Array.from(new Set(approvals.map((a) => a.executionId)));
    const agentIds = Array.from(new Set(approvals.map((a) => a.agentId)));
    const [executions, agents] = await Promise.all([
      ExecutionModel.find({ _id: { $in: executionIds } }).select('task application').lean(),
      AgentModel.find({ _id: { $in: agentIds } }).select('name').lean(),
    ]);
    const execMap = new Map(executions.map((e) => [String(e._id), e]));
    const agentMap = new Map(agents.map((a) => [String(a._id), a.name]));

    res.json(
      successResponse(
        approvals.map((a) => ({
          ...serializeApproval(a),
          agentName: agentMap.get(a.agentId) ?? null,
          task: execMap.get(a.executionId)?.task ?? null,
          application: execMap.get(a.executionId)?.application ?? null,
        }))
      )
    );
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const approval = await approvalManager.getApproval(req.params.id, req.user!.id);
    if (!approval) throw new NotFoundError('Approval', req.params.id);
    res.json(successResponse(serializeApproval(approval)));
  })
);

router.post(
  '/:id/decision',
  validate({ params: idParams, body: decisionBody }),
  asyncHandler(async (req, res) => {
    const { approved, comment } = req.body as z.infer<typeof decisionBody>;
    const approval = await approvalManager.decide(
      { approvalId: req.params.id, reviewerId: req.user!.id, approved, comment },
      req.user!.id
    );
    res.json(successResponse(serializeApproval(approval)));
  })
);

export default router;
