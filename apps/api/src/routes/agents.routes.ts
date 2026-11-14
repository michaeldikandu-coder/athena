import { Router } from 'express';
import { z } from 'zod';
import { AgentModel, AgentToolModel, ExecutionModel, WorkflowModel, MemoryModel } from '@athena/database';
import { agentRuntime, defaultModel, toolRegistry } from '@athena/core';
import { AgentNotFoundError, ValidationError, successResponse } from '@athena/shared';
import { asyncHandler, idParams, validate } from '../middleware/validate';
import { serializeAgent } from '../services/serializers';

const router = Router();

const permissionString = z
  .string()
  .regex(/^(admin|\*|[a-z*]+:[a-z0-9_*-]+)$/, 'Permissions look like "read:transactions"');

const modelConfig = z.object({
  provider: z.enum(['anthropic', 'groq']),
  model: z.string().trim().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(64000).optional(),
});

const agentBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  systemPrompt: z.string().trim().min(10).max(20000),
  modelConfig,
  permissions: z.array(permissionString).max(50).default([]),
  tools: z.array(z.string().max(64)).max(50).default([]),
  maxIterations: z.number().int().min(1).max(50).default(15),
});

const updateBody = agentBody.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

const runBody = z.object({
  task: z.string().trim().min(1).max(10000),
  context: z.record(z.unknown()).optional(),
});

function assertToolsExist(tools: string[]): void {
  const unknown = tools.filter((id) => !toolRegistry.has(id));
  if (unknown.length) throw new ValidationError(`Unknown tools: ${unknown.join(', ')}`);
}

async function setAgentTools(agentId: string, tools: string[]): Promise<void> {
  await AgentToolModel.deleteMany({ agentId, toolId: { $nin: tools } });
  for (const toolId of tools) {
    await AgentToolModel.updateOne(
      { agentId, toolId },
      { $set: { enabled: true }, $setOnInsert: { agentId, toolId } },
      { upsert: true }
    );
  }
}

async function toolsFor(agentIds: string[]): Promise<Map<string, string[]>> {
  const links = await AgentToolModel.find({ agentId: { $in: agentIds }, enabled: true }).lean();
  const map = new Map<string, string[]>();
  for (const link of links) {
    map.set(link.agentId, [...(map.get(link.agentId) ?? []), link.toolId]);
  }
  return map;
}

async function findOwnedAgent(id: string, userId: string) {
  const agent = await AgentModel.findOne({ _id: id, userId }).lean();
  if (!agent) throw new AgentNotFoundError(id);
  return agent;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const agents = await AgentModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
    const tools = await toolsFor(agents.map((a) => String(a._id)));
    res.json(successResponse(agents.map((a) => serializeAgent(a, tools.get(String(a._id))))));
  })
);

router.post(
  '/',
  validate({ body: agentBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof agentBody>;
    assertToolsExist(body.tools);
    const agent = await AgentModel.create({
      name: body.name,
      description: body.description,
      systemPrompt: body.systemPrompt,
      modelConfig: { ...body.modelConfig, model: body.modelConfig.model || defaultModel(body.modelConfig.provider) },
      permissions: body.permissions,
      maxIterations: body.maxIterations,
      userId: req.user!.id,
      status: 'active',
    });
    await setAgentTools(String(agent._id), body.tools);
    res.status(201).json(successResponse(serializeAgent(agent.toObject(), body.tools)));
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const agent = await findOwnedAgent(req.params.id, req.user!.id);
    const tools = await toolsFor([req.params.id]);
    const [executions, memories] = await Promise.all([
      ExecutionModel.countDocuments({ agentId: req.params.id }),
      MemoryModel.find({ agentId: req.params.id, type: { $in: ['fact', 'decision'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);
    res.json(
      successResponse({
        ...serializeAgent(agent, tools.get(req.params.id)),
        stats: { executions },
        memories: memories.map((m) => ({
          id: String(m._id),
          type: m.type,
          content: m.content,
          createdAt: m.createdAt,
        })),
      })
    );
  })
);

router.put(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    await findOwnedAgent(req.params.id, req.user!.id);
    const { tools, modelConfig: mc, ...rest } = req.body as z.infer<typeof updateBody>;
    if (tools) assertToolsExist(tools);

    const update: Record<string, unknown> = { ...rest };
    if (mc) {
      // A model kept from the other provider would fail on every run
      const looksWrong =
        mc.model && ((mc.provider === 'groq' && /^claude-/i.test(mc.model)) || (mc.provider === 'anthropic' && !/^claude-/i.test(mc.model)));
      update.modelConfig = { ...mc, model: !mc.model || looksWrong ? defaultModel(mc.provider) : mc.model };
    }

    const agent = await AgentModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      update,
      { new: true, runValidators: true }
    ).lean();
    if (tools) await setAgentTools(req.params.id, tools);
    const toolMap = await toolsFor([req.params.id]);
    res.json(successResponse(serializeAgent(agent!, toolMap.get(req.params.id))));
  })
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await findOwnedAgent(req.params.id, req.user!.id);
    await Promise.all([
      AgentModel.deleteOne({ _id: req.params.id, userId: req.user!.id }),
      AgentToolModel.deleteMany({ agentId: req.params.id }),
      WorkflowModel.deleteMany({ agentId: req.params.id, userId: req.user!.id }),
      MemoryModel.deleteMany({ agentId: req.params.id }),
    ]);
    res.json(successResponse({ deleted: true }));
  })
);

router.post(
  '/:id/run',
  validate({ params: idParams, body: runBody }),
  asyncHandler(async (req, res) => {
    const { task, context } = req.body as z.infer<typeof runBody>;
    const result = await agentRuntime.start({
      agentId: req.params.id,
      userId: req.user!.id,
      task,
      context,
      trigger: { type: 'manual', source: 'dashboard', payload: context ?? {} },
    });
    res.status(202).json(successResponse(result));
  })
);

router.delete(
  '/:id/memory',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await findOwnedAgent(req.params.id, req.user!.id);
    const result = await MemoryModel.deleteMany({ agentId: req.params.id });
    res.json(successResponse({ deleted: result.deletedCount }));
  })
);

export default router;
