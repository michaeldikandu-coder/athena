import { z } from 'zod';
import { IWorkflow, IWorkflowStep, WorkflowModel } from '@athena/database';
import { AppError, NotFoundError, ValidationError, logger, truncate } from '@athena/shared';
import { agentRuntime, RuntimeContext } from '../agent/agent-runtime';
import { scheduleRun } from '../runs/background';
import { Budget, RunState, Suspension, WorkflowRunState, isSuspension } from '../runs/run-state';
import { maybeRunMaintenance } from '../runs/maintenance';
import { executionMonitor } from '../monitor/execution-monitor';
import { eventBus, TriggerEvent } from '../events/event-bus';
import { Condition, evaluateCondition, matchEventName, renderTemplate } from './template';

type WorkflowDoc = IWorkflow & { _id: unknown };

const conditionSchema = z.object({
  path: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists', 'not_exists', 'in']),
  value: z.unknown().optional(),
});

const stepConfigSchemas = {
  agent_task: z.object({
    task: z.string().min(1),
    /** Include the trigger payload as context for the agent (default true) */
    includePayload: z.boolean().optional(),
  }),
  tool_call: z.object({
    tool: z.string().min(1),
    input: z.record(z.unknown()).default({}),
    /** Continue the workflow if the tool fails (default false) */
    continueOnError: z.boolean().optional(),
  }),
  approval: z.object({
    message: z.string().min(1),
  }),
  condition: z.object({
    conditions: z.array(conditionSchema).min(1),
    match: z.enum(['all', 'any']).optional(),
    then: z.string().nullable().optional(),
    else: z.string().nullable().optional(),
  }),
} as const;

export const workflowStepSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
    type: z.enum(['agent_task', 'tool_call', 'approval', 'condition']),
    config: z.record(z.unknown()),
    nextSteps: z.array(z.string()).optional(),
  })
  .superRefine((step, ctx) => {
    const result = stepConfigSchemas[step.type].safeParse(step.config);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid config for ${step.type} step "${step.id}": ${result.error.message}`,
      });
    }
  });

export const workflowTriggerSchema = z.object({
  type: z.enum(['event', 'webhook', 'schedule', 'manual']),
  config: z
    .object({
      event: z.string().optional(),
      conditions: z.array(conditionSchema).optional(),
      intervalMinutes: z.number().int().min(1).max(10080).optional(),
    })
    .passthrough()
    .default({}),
});

const MAX_STEP_RUNS = 50;
const SCHEDULER_TICK_MS = 60 * 1000;

/**
 * Validate a workflow definition. Throws ValidationError with a readable message.
 */
export function validateWorkflowDefinition(definition: {
  trigger: unknown;
  steps: unknown;
}): { trigger: z.infer<typeof workflowTriggerSchema>; steps: IWorkflowStep[] } {
  const trigger = workflowTriggerSchema.safeParse(definition.trigger);
  if (!trigger.success) throw new ValidationError('Invalid workflow trigger', trigger.error.errors);

  const steps = z.array(workflowStepSchema).min(1).max(30).safeParse(definition.steps);
  if (!steps.success) throw new ValidationError('Invalid workflow steps', steps.error.errors);

  const ids = new Set<string>();
  for (const step of steps.data) {
    if (ids.has(step.id)) throw new ValidationError(`Duplicate step id: ${step.id}`);
    ids.add(step.id);
  }
  for (const step of steps.data) {
    const targets = [...(step.nextSteps ?? [])];
    if (step.type === 'condition') {
      const cfg = step.config as { then?: string | null; else?: string | null };
      if (cfg.then) targets.push(cfg.then);
      if (cfg.else) targets.push(cfg.else);
    }
    for (const target of targets) {
      if (!ids.has(target)) {
        throw new ValidationError(`Step "${step.id}" references unknown step "${target}"`);
      }
    }
    if (trigger.data.type === 'schedule' && !trigger.data.config.intervalMinutes) {
      throw new ValidationError('Schedule triggers need config.intervalMinutes');
    }
  }

  return { trigger: trigger.data, steps: steps.data as IWorkflowStep[] };
}

/**
 * Workflow Engine - runs multi-step workflows on top of the agent runtime and
 * listens for trigger events.
 */
export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private unsubscribe?: () => void;
  private schedulerTimer?: NodeJS.Timeout;

  private constructor() {}

  static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  /**
   * Begin listening for trigger events and running scheduled workflows
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = eventBus.on('trigger', (event) => {
      void this.handleTrigger(event).catch((error) =>
        logger.error('Trigger handling failed', error as Error, { event: event.event })
      );
    });
    // Long-lived servers run maintenance (schedules, expired approvals, stalled runs) every minute
    this.schedulerTimer = setInterval(
      () => void maybeRunMaintenance().catch((error) => logger.error('Maintenance tick failed', error as Error)),
      SCHEDULER_TICK_MS
    );
    logger.info('Workflow engine started');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
  }

  /**
   * Find workflows matching an event and start each one.
   * Returns the execution ids that were started.
   */
  async handleTrigger(event: TriggerEvent): Promise<string[]> {
    const query: Record<string, unknown> = {
      status: 'active',
      'trigger.type': { $in: ['event', 'webhook'] },
    };
    if (event.userId) query.userId = event.userId;
    if (event.workflowId) query._id = event.workflowId;

    const workflows = (await WorkflowModel.find(query).lean()) as WorkflowDoc[];
    const scope = { trigger: { event: event.event, source: event.source, payload: event.payload } };

    const started: string[] = [];
    for (const workflow of workflows) {
      const pattern = workflow.trigger.config?.event as string | undefined;
      // Per-workflow webhooks may omit an event name; everything else must match it
      if (!(event.workflowId && !pattern) && !(pattern && matchEventName(pattern, event.event))) {
        continue;
      }
      const conditions = (workflow.trigger.config?.conditions ?? []) as Condition[];
      if (!conditions.every((c) => evaluateCondition(c, scope))) continue;

      try {
        const { executionId } = await this.launch(workflow, {
          type: workflow.trigger.type,
          source: event.source,
          payload: { event: event.event, ...event.payload },
        });
        started.push(executionId);
      } catch (error) {
        logger.error('Failed to start triggered workflow', error as Error, {
          workflowId: String(workflow._id),
        });
      }
    }

    logger.info('Trigger processed', { event: event.event, started: started.length });
    return started;
  }

  /**
   * Run a workflow manually (owner only)
   */
  async runManually(
    workflowId: string,
    userId: string,
    payload: Record<string, any> = {}
  ): Promise<{ executionId: string }> {
    const workflow = (await WorkflowModel.findOne({ _id: workflowId, userId }).lean()) as
      | WorkflowDoc
      | null;
    if (!workflow) throw new NotFoundError('Workflow', workflowId);
    if (workflow.status !== 'active') {
      throw new AppError('Workflow is inactive', { statusCode: 409 });
    }
    return this.launch(workflow, { type: 'manual', source: 'dashboard', payload });
  }

  async launch(
    workflow: WorkflowDoc,
    trigger: { type: string; source: string; payload: Record<string, any> }
  ): Promise<{ executionId: string }> {
    await agentRuntime.assertCapacity(workflow.userId);
    const agent = await agentRuntime.loadAgent(workflow.agentId, workflow.userId);
    agentRuntime.assertRunnable(agent);
    const state: RunState = {
      version: 1,
      kind: 'workflow',
      workflow: {
        payload: trigger.payload,
        scope: {
          trigger: { payload: trigger.payload },
          steps: {},
          workflow: { id: String(workflow._id), name: workflow.name },
        },
        currentStepId: workflow.steps[0]?.id ?? null,
        stepRuns: 0,
      },
    };
    const ctx = await agentRuntime.createExecution(
      agent,
      { userId: workflow.userId, task: `Workflow: ${workflow.name}`, trigger, workflowId: String(workflow._id) },
      state
    );
    await WorkflowModel.updateOne({ _id: workflow._id }, { lastRunAt: new Date() });
    scheduleRun(ctx.executionId);
    return { executionId: ctx.executionId };
  }

  /**
   * Advance a workflow run from its checkpoint. Returns the final summary, or a
   * suspension when a step waits for approval or the time slice ends.
   */
  async advance(
    workflowId: string,
    ctx: RuntimeContext,
    state: WorkflowRunState,
    budget: Budget,
    save: () => Promise<void>
  ): Promise<{ summary?: string; steps: Record<string, unknown> } | Suspension> {
    const workflow = (await WorkflowModel.findOne({ _id: workflowId, userId: ctx.userId }).lean()) as
      | WorkflowDoc
      | null;
    if (!workflow) throw new NotFoundError('Workflow', workflowId);
    const stepsById = new Map(workflow.steps.map((s) => [s.id, s]));

    while (state.currentStepId) {
      const step = stepsById.get(state.currentStepId);
      if (!step) throw new AppError(`Workflow step "${state.currentStepId}" no longer exists`);
      await agentRuntime.assertNotCancelled(ctx.executionId);
      if (!budget.hasTime()) return { suspended: 'budget' };

      if (!state.step?.started) {
        if (++state.stepRuns > MAX_STEP_RUNS) {
          throw new AppError(`Workflow exceeded ${MAX_STEP_RUNS} step runs (possible loop)`);
        }
        state.step = { started: true };
        await executionMonitor.record({
          executionId: ctx.executionId,
          userId: ctx.userId,
          type: 'status_change',
          output: { step: step.id, stepType: step.type, phase: 'started' },
          metadata: { workflowStep: step.id },
        });
        await save();
      }

      const outcome = await this.runStep(step, ctx, state, budget, save);
      if (isSuspension(outcome)) {
        await save();
        return outcome;
      }

      state.scope.steps[step.id] = { output: outcome.output };
      if (step.type === 'agent_task' && typeof outcome.output === 'string') state.lastSummary = outcome.output;
      const nextId = outcome.next !== undefined ? outcome.next : this.defaultNext(workflow.steps, step);
      state.currentStepId = nextId ?? null;
      state.step = undefined;
      budget.worked();
      await save();
    }

    return { summary: state.lastSummary, steps: state.scope.steps };
  }

  private defaultNext(steps: IWorkflowStep[], step: IWorkflowStep): string | null {
    if (step.nextSteps && step.nextSteps.length > 0) return step.nextSteps[0];
    const index = steps.findIndex((s) => s.id === step.id);
    return steps[index + 1]?.id ?? null;
  }

  private async runStep(
    step: IWorkflowStep,
    ctx: RuntimeContext,
    state: WorkflowRunState,
    budget: Budget,
    save: () => Promise<void>
  ): Promise<{ output: unknown; next?: string | null } | Suspension> {
    const scope = state.scope;
    const progress = state.step!;
    switch (step.type) {
      case 'agent_task': {
        if (!progress.agent) {
          const cfg = stepConfigSchemas.agent_task.parse(step.config);
          const task = String(renderTemplate(cfg.task, scope));
          const context =
            cfg.includePayload === false
              ? { previousSteps: scope.steps }
              : { triggerPayload: state.payload, previousSteps: scope.steps };
          progress.agent = await agentRuntime.buildAgentState(ctx.agent, task, context);
          await save();
        }
        const result = await agentRuntime.advanceAgent(ctx, progress.agent, budget, save);
        if (isSuspension(result)) return result;
        return { output: result.summary };
      }

      case 'tool_call': {
        const cfg = stepConfigSchemas.tool_call.parse(step.config);
        const input = renderTemplate(cfg.input, scope) as Record<string, any>;
        progress.callId = progress.callId ?? `${step.id}-${Date.now()}`;
        const result = await agentRuntime.invokeTool(
          ctx,
          { id: progress.callId, name: cfg.tool, input },
          `Workflow step "${step.id}" calls ${cfg.tool}`,
          progress.approvalId ? { approvalId: progress.approvalId } : undefined
        );
        if (isSuspension(result)) {
          if (result.suspended === 'approval') progress.approvalId = result.approvalId;
          return result;
        }
        if (!result.ok && !cfg.continueOnError) {
          throw new AppError(`Step "${step.id}" failed: ${truncate(result.content, 500)}`);
        }
        return { output: result.ok ? result.data : { error: result.content } };
      }

      case 'approval': {
        const cfg = stepConfigSchemas.approval.parse(step.config);
        const message = String(renderTemplate(cfg.message, scope));
        if (!progress.approvalId) {
          const suspension = await agentRuntime.requestApproval(
            ctx,
            'workflow_approval',
            { step: step.id, message },
            message
          );
          if (suspension.suspended === 'approval') progress.approvalId = suspension.approvalId;
          return suspension;
        }
        const decision = await agentRuntime.resolveApproval(ctx, progress.approvalId, 'workflow_approval');
        if (decision.status === 'pending') return { suspended: 'approval', approvalId: progress.approvalId };
        if (!decision.approved) {
          throw new AppError(`Workflow stopped: approval ${decision.status} at step "${step.id}"`);
        }
        return { output: { approved: true, comment: decision.comment } };
      }

      case 'condition': {
        const cfg = stepConfigSchemas.condition.parse(step.config);
        const results = cfg.conditions.map((c) => evaluateCondition(c as Condition, scope));
        const passed = cfg.match === 'any' ? results.some(Boolean) : results.every(Boolean);
        const next = passed ? cfg.then : cfg.else;
        return { output: { passed }, next: next === undefined ? undefined : next };
      }

      default:
        throw new AppError(`Unknown step type: ${(step as IWorkflowStep).type}`);
    }
  }

  /**
   * Start scheduled workflows that are due. Each workflow is claimed with a
   * conditional update so overlapping ticks never start it twice.
   */
  async runScheduled(): Promise<number> {
    const workflows = (await WorkflowModel.find({
      status: 'active',
      'trigger.type': 'schedule',
    }).lean()) as WorkflowDoc[];

    const now = Date.now();
    let started = 0;
    for (const workflow of workflows) {
      const interval = Number(workflow.trigger.config?.intervalMinutes || 0) * 60 * 1000;
      if (!interval) continue;
      const last = workflow.lastRunAt ? new Date(workflow.lastRunAt).getTime() : 0;
      if (now - last < interval) continue;
      const claimed = await WorkflowModel.updateOne(
        { _id: workflow._id, lastRunAt: workflow.lastRunAt ?? null },
        { lastRunAt: new Date(now) }
      );
      if (claimed.modifiedCount === 0) continue;
      try {
        await this.launch(workflow, {
          type: 'schedule',
          source: 'scheduler',
          payload: { scheduledAt: new Date(now).toISOString() },
        });
        started++;
      } catch (error) {
        logger.error('Scheduled workflow failed to start', error as Error, { workflowId: String(workflow._id) });
      }
    }
    return started;
  }
}

export const workflowEngine = WorkflowEngine.getInstance();
