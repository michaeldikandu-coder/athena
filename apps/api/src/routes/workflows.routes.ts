import { Router } from 'express';
import { z } from 'zod';
import { AgentModel, WorkflowModel } from '@athena/database';
import { validateWorkflowDefinition, workflowEngine } from '@athena/core';
import { NotFoundError, commonSchemas, successResponse } from '@athena/shared';
import { asyncHandler, idParams, validate } from '../middleware/validate';
import { serializeWorkflow } from '../services/serializers';
import { workflowWebhookSecret, workflowWebhookUrl } from '../services/webhook-secrets';

const router = Router();

const workflowBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
  agentId: commonSchemas.objectId,
  trigger: z.unknown(),
  steps: z.unknown(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  trigger: z.unknown().optional(),
  steps: z.unknown().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const runBody = z.object({ payload: z.record(z.unknown()).default({}) });

function webhookInfo(workflow: { _id: unknown; trigger: { type: string } }) {
  if (workflow.trigger.type !== 'webhook') return {};
  const id = String(workflow._id);
  return { webhook: { url: workflowWebhookUrl(id), secret: workflowWebhookSecret(id) } };
}

async function assertOwnsAgent(agentId: string, userId: string): Promise<void> {
  if (!(await AgentModel.exists({ _id: agentId, userId }))) {
    throw new NotFoundError('Agent', agentId);
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workflows = await WorkflowModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
    res.json(successResponse(workflows.map((w) => serializeWorkflow(w))));
  })
);

router.post(
  '/',
  validate({ body: workflowBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof workflowBody>;
    await assertOwnsAgent(body.agentId, req.user!.id);
    const { trigger, steps } = validateWorkflowDefinition({ trigger: body.trigger, steps: body.steps });
    const workflow = await WorkflowModel.create({
      name: body.name,
      description: body.description,
      agentId: body.agentId,
      trigger,
      steps,
      status: body.status,
      userId: req.user!.id,
    });
    const obj = workflow.toObject();
    res.status(201).json(successResponse(serializeWorkflow(obj, webhookInfo(obj))));
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const workflow = await WorkflowModel.findOne({ _id: req.params.id, userId: req.user!.id }).lean();
    if (!workflow) throw new NotFoundError('Workflow', req.params.id);
    res.json(successResponse(serializeWorkflow(workflow, webhookInfo(workflow))));
  })
);

router.put(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    const existing = await WorkflowModel.findOne({ _id: req.params.id, userId: req.user!.id }).lean();
    if (!existing) throw new NotFoundError('Workflow', req.params.id);
    const body = req.body as z.infer<typeof updateBody>;

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.status !== undefined) update.status = body.status;
    if (body.trigger !== undefined || body.steps !== undefined) {
      const validated = validateWorkflowDefinition({
        trigger: body.trigger ?? existing.trigger,
        steps: body.steps ?? existing.steps,
      });
      update.trigger = validated.trigger;
      update.steps = validated.steps;
    }

    const workflow = await WorkflowModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      update,
      { new: true }
    ).lean();
    res.json(successResponse(serializeWorkflow(workflow!, webhookInfo(workflow!))));
  })
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const result = await WorkflowModel.deleteOne({ _id: req.params.id, userId: req.user!.id });
    if (result.deletedCount === 0) throw new NotFoundError('Workflow', req.params.id);
    res.json(successResponse({ deleted: true }));
  })
);

router.post(
  '/:id/run',
  validate({ params: idParams, body: runBody }),
  asyncHandler(async (req, res) => {
    const { payload } = req.body as z.infer<typeof runBody>;
    const result = await workflowEngine.runManually(req.params.id, req.user!.id, payload);
    res.status(202).json(successResponse(result));
  })
);

export default router;
