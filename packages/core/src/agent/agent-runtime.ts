import { AgentModel, AgentToolModel, ApprovalModel, ExecutionModel, IAgent } from '@athena/database';
import {
  AgentNotFoundError,
  AppError,
  LLMProvider,
  NotFoundError,
  RateLimitError,
  ToolContext,
  ToolValidationError,
  logger,
  truncate,
} from '@athena/shared';
import { toolRegistry } from '../tools/tool-registry';
import { permissionManager } from '../permissions/permission-manager';
import { approvalManager } from '../approvals/approval-manager';
import { executionMonitor } from '../monitor/execution-monitor';
import { memoryManager } from '../memory/memory-manager';
import { builtInTools } from '../memory/memory-tools';
import { getLLMClient, defaultModel } from '../llm/llm-factory';
import { LLMToolCall } from '../llm/llm.types';
import { withUserScope } from '../connections';
import { eventBus } from '../events/event-bus';
import { scheduleRun } from '../runs/background';
import { AgentLoopState, Budget, RunState, Suspension, isSuspension, serializeRunState } from '../runs/run-state';

export interface LoadedAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  permissions: string[];
  toolIds: string[];
  maxIterations: number;
  application?: string;
  userId: string;
}

export interface ExecutionTriggerInfo {
  type: string;
  source: string;
  payload: Record<string, any>;
}

export interface StartExecutionInput {
  agentId: string;
  userId: string;
  task: string;
  context?: Record<string, any>;
  trigger?: ExecutionTriggerInfo;
  workflowId?: string;
}

/**
 * State shared by everything that happens inside one execution
 */
export interface RuntimeContext {
  executionId: string;
  agent: LoadedAgent;
  userId: string;
  startedAt: Date;
}

export interface ToolInvocationResult {
  ok: boolean;
  /** Content returned to the LLM */
  content: string;
  data?: unknown;
}

export type ApprovalResolution =
  | { status: 'pending' }
  | { status: 'approved' | 'rejected' | 'expired'; approved: boolean; comment?: string };

export class ExecutionCancelledError extends AppError {
  constructor(executionId: string) {
    super('Execution was cancelled', { statusCode: 409, context: { executionId } });
  }
}

const MAX_TOOL_RESULT_CHARS = 15000;
const ACTIVE_STATUSES = ['pending', 'running', 'waiting_approval'];

function maxConcurrent(): number {
  return Number(process.env.MAX_CONCURRENT_EXECUTIONS || 5);
}

const PLATFORM_RULES = `
You are running on Athena, an agent runtime with audited tools.
Rules:
- Work step by step. Before calling tools, say briefly what you are checking and why.
- Only use the tools provided. Never invent data; if a tool fails, report it.
- Some tools need human approval. If an approval is rejected, do not retry the same action; explain and continue or finish.
- When the task is complete, reply without tool calls. Give a concise final report: findings, actions taken, and recommended next steps.
`.trim();

/**
 * Agent Runtime - runs the reasoning/tool loop for any Athena agent.
 * Applications provide tools and prompts; the runtime is identical for all of them.
 *
 * Runs are checkpointed in MongoDB after each step (see runs/run-driver.ts), so
 * a run can pause for a human approval or a time limit and continue in any process.
 */
export class AgentRuntime {
  private static instance: AgentRuntime;

  private constructor() {
    // A decision resumes the run that was waiting for it
    eventBus.on('approval.decided', ({ executionId }) => scheduleRun(executionId));
  }

  static getInstance(): AgentRuntime {
    if (!AgentRuntime.instance) {
      AgentRuntime.instance = new AgentRuntime();
    }
    return AgentRuntime.instance;
  }

  /** Runs that are queued, running, or waiting for approval */
  async countActive(userId?: string): Promise<number> {
    return ExecutionModel.countDocuments({
      status: { $in: ACTIVE_STATUSES.filter((s) => s !== 'waiting_approval') },
      ...(userId ? { userId } : {}),
    });
  }

  /** Refuse new runs when this user already has too many in progress */
  async assertCapacity(userId: string): Promise<void> {
    if ((await this.countActive(userId)) >= maxConcurrent()) throw new RateLimitError();
  }

  /**
   * Load an agent and its enabled tools. Agents are scoped to their owner.
   */
  async loadAgent(agentId: string, userId: string): Promise<LoadedAgent> {
    const agent = (await AgentModel.findOne({ _id: agentId, userId }).lean()) as
      | (IAgent & { _id: unknown })
      | null;
    if (!agent) throw new AgentNotFoundError(agentId);
    if (agent.status !== 'active') {
      throw new AppError(`Agent ${agent.name} is ${agent.status}`, { statusCode: 409 });
    }

    const links = await AgentToolModel.find({ agentId, enabled: true }).lean();
    const assigned = links.map((l) => l.toolId).filter((id) => toolRegistry.has(id));

    // Built-in memory tools are offered when the agent holds the needed permissions
    const builtIns = builtInTools
      .filter((tool) =>
        permissionManager.check({
          agentId,
          userId,
          granted: agent.permissions ?? [],
          required: tool.requiredPermissions,
          action: tool.id,
        }).allowed
      )
      .map((tool) => tool.id);

    return {
      id: String(agent._id),
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      provider: agent.modelConfig.provider,
      model: agent.modelConfig.model || defaultModel(agent.modelConfig.provider),
      temperature: agent.modelConfig.temperature,
      maxTokens: agent.modelConfig.maxTokens,
      permissions: agent.permissions ?? [],
      toolIds: Array.from(new Set([...assigned, ...builtIns])),
      maxIterations: agent.maxIterations ?? 15,
      application: agent.application,
      userId: agent.userId,
    };
  }

  /**
   * Create an execution record in pending state with its initial checkpoint
   */
  async createExecution(
    agent: LoadedAgent,
    input: Omit<StartExecutionInput, 'agentId'>,
    state?: RunState
  ): Promise<RuntimeContext> {
    const execution = await ExecutionModel.create({
      agentId: agent.id,
      workflowId: input.workflowId,
      userId: input.userId,
      task: input.task,
      application: agent.application,
      trigger: input.trigger ?? { type: 'manual', source: 'dashboard', payload: input.context ?? {} },
      status: 'pending',
      startedAt: new Date(),
      ...(state ? { stateJson: serializeRunState(state) } : {}),
    });
    return {
      executionId: String(execution._id),
      agent,
      userId: input.userId,
      startedAt: execution.startedAt,
    };
  }

  /**
   * Start an agent execution in the background and return its id immediately
   */
  async start(input: StartExecutionInput): Promise<{ executionId: string }> {
    await this.assertCapacity(input.userId);
    const agent = await this.loadAgent(input.agentId, input.userId);
    const agentState = await this.buildAgentState(agent, input.task, input.context);
    const ctx = await this.createExecution(agent, input, { version: 1, kind: 'agent', agent: agentState });
    scheduleRun(ctx.executionId);
    return { executionId: ctx.executionId };
  }

  /**
   * Initial state of a reasoning loop: system prompt (with memory) and the task
   */
  async buildAgentState(
    agent: LoadedAgent,
    task: string,
    context?: Record<string, any>
  ): Promise<AgentLoopState> {
    const memoryContext = await memoryManager.buildContext(agent.id);
    const system = [agent.systemPrompt, PLATFORM_RULES, `Current time: ${new Date().toISOString()}`, memoryContext]
      .filter(Boolean)
      .join('\n\n');
    const userContent =
      context && Object.keys(context).length > 0
        ? `${task}\n\nContext (JSON):\n${truncate(JSON.stringify(context, null, 2), 20000)}`
        : task;
    return { task, system, messages: [{ role: 'user', content: userContent }], iteration: 0, lastText: '' };
  }

  private describeTools(agent: LoadedAgent) {
    return agent.toolIds.map((id) => {
      const descriptor = toolRegistry.describe(id);
      const approvalNote = descriptor.requiresApproval ? ' [Requires human approval]' : '';
      return {
        name: descriptor.id,
        description: descriptor.description + approvalNote,
        inputSchema: descriptor.inputSchema,
      };
    });
  }

  /**
   * Advance the reasoning loop from its checkpoint until it finishes, needs an
   * approval, or the time slice runs out. `save` persists the checkpoint and is
   * called after every model turn and tool call.
   */
  async advanceAgent(
    ctx: RuntimeContext,
    state: AgentLoopState,
    budget: Budget,
    save: () => Promise<void>
  ): Promise<{ summary: string; incomplete: boolean } | Suspension> {
    const { agent } = ctx;

    for (;;) {
      await this.assertNotCancelled(ctx.executionId);

      // Finish the tool calls of the last model turn first
      if (state.pending) {
        const pending = state.pending;
        while (pending.index < pending.calls.length) {
          if (!budget.hasTime()) return { suspended: 'budget' };
          const call = pending.calls[pending.index];
          const result = await this.invokeTool(
            ctx,
            call,
            pending.reasoning,
            pending.approvalId ? { approvalId: pending.approvalId } : undefined
          );
          if (isSuspension(result)) {
            if (result.suspended === 'approval') {
              pending.approvalId = result.approvalId;
              await save();
            }
            return result;
          }
          state.messages.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.name,
            content: result.content,
            isError: !result.ok,
          });
          pending.index += 1;
          pending.approvalId = undefined;
          budget.worked();
          await save();
          await this.assertNotCancelled(ctx.executionId);
        }
        state.pending = undefined;
        await save();
      }

      if (state.iteration >= agent.maxIterations) return this.finishAgent(ctx, state, true);
      if (!budget.hasTime()) return { suspended: 'budget' };

      const response = await getLLMClient(agent.provider).chat({
        model: agent.model,
        system: state.system,
        messages: state.messages,
        tools: this.describeTools(agent),
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });
      state.iteration += 1;
      budget.worked();

      await ExecutionModel.updateOne(
        { _id: ctx.executionId },
        {
          $inc: {
            iterations: 1,
            'usage.inputTokens': response.usage.inputTokens,
            'usage.outputTokens': response.usage.outputTokens,
          },
        }
      );

      if (response.text || response.reasoning) {
        await executionMonitor.record({
          executionId: ctx.executionId,
          userId: ctx.userId,
          type: 'agent_reasoning',
          output: {
            text: response.text,
            ...(response.reasoning ? { reasoning: truncate(response.reasoning, 4000) } : {}),
          },
          metadata: { iteration: state.iteration, stopReason: response.stopReason },
        });
      }

      if (response.stopReason === 'refusal') {
        throw new AppError('The model declined this request', { statusCode: 422 });
      }

      state.messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls,
        providerContent: response.providerContent,
        provider: agent.provider,
      });
      state.lastText = response.text;

      if (response.toolCalls.length === 0) {
        await save();
        return this.finishAgent(ctx, state, response.stopReason === 'max_tokens');
      }

      state.pending = { calls: response.toolCalls, index: 0, reasoning: response.text };
      await save();
    }
  }

  private async finishAgent(
    ctx: RuntimeContext,
    state: AgentLoopState,
    incomplete: boolean
  ): Promise<{ summary: string; incomplete: boolean }> {
    let summary = state.lastText;
    if (incomplete && !summary) {
      summary = `Stopped after ${ctx.agent.maxIterations} iterations without a final report.`;
    }
    await memoryManager
      .store({
        agentId: ctx.agent.id,
        executionId: ctx.executionId,
        type: 'decision',
        content: `Task: ${truncate(state.task, 200)} | Outcome: ${truncate(summary, 800)}`,
      })
      .catch((error) => logger.warn('Failed to store decision memory', { error: String(error) }));
    return { summary, incomplete };
  }

  /**
   * Invoke a tool on behalf of an agent: availability, permission, validation,
   * approval, execution, and timeline recording. All tool calls (agent loop and
   * workflow steps) go through here.
   *
   * Approval-gated tools return a suspension the first time; call again with
   * the approval id once it is decided.
   */
  async invokeTool(
    ctx: RuntimeContext,
    call: LLMToolCall,
    reasoning?: string,
    resume?: { approvalId: string }
  ): Promise<ToolInvocationResult | Suspension> {
    const record = (type: Parameters<typeof executionMonitor.record>[0]['type'], extra: object) =>
      executionMonitor.record({
        executionId: ctx.executionId,
        userId: ctx.userId,
        type,
        tool: call.name,
        ...extra,
      });

    if (!resume) {
      await record('tool_call', { input: call.input, status: 'pending', metadata: { callId: call.id } });
    }

    const fail = async (message: string, code: string): Promise<ToolInvocationResult> => {
      await record('tool_result', {
        output: { error: message, code },
        status: 'failure',
        metadata: { callId: call.id },
      });
      return { ok: false, content: JSON.stringify({ error: message, code }) };
    };

    if (!ctx.agent.toolIds.includes(call.name) || !toolRegistry.has(call.name)) {
      return fail(`Tool "${call.name}" is not available to this agent`, 'tool_not_available');
    }
    const tool = toolRegistry.get(call.name);

    const permission = permissionManager.check({
      agentId: ctx.agent.id,
      userId: ctx.userId,
      granted: ctx.agent.permissions,
      required: tool.requiredPermissions,
      action: tool.id,
    });
    if (!permission.allowed) {
      await record('error', {
        output: { message: 'Permission denied', missing: permission.missing },
        status: 'failure',
      });
      return fail(`Permission denied. Missing: ${permission.missing.join(', ')}`, 'permission_denied');
    }

    let input: unknown;
    try {
      input = toolRegistry.validateInput(tool.id, call.input);
    } catch (error) {
      const details = error instanceof ToolValidationError ? error.context : undefined;
      return fail(`Invalid input: ${JSON.stringify(details?.validationErrors ?? error)}`, 'invalid_input');
    }

    if (toolRegistry.requiresApproval(tool.id)) {
      if (!resume) {
        return this.requestApproval(ctx, tool.id, input as Record<string, any>, reasoning);
      }
      const decision = await this.resolveApproval(ctx, resume.approvalId, tool.id);
      if (decision.status === 'pending') return { suspended: 'approval', approvalId: resume.approvalId };
      if (!decision.approved) {
        return fail(
          `Human reviewer ${decision.status} this action${decision.comment ? `: ${decision.comment}` : ''}`,
          `approval_${decision.status}`
        );
      }
    }

    await this.assertNotCancelled(ctx.executionId);

    const toolContext: ToolContext = {
      executionId: ctx.executionId,
      agentId: ctx.agent.id,
      userId: ctx.userId,
      startedAt: ctx.startedAt,
      toolName: tool.id,
      permissions: ctx.agent.permissions,
    };

    try {
      // Tools reach third-party services with the run owner's own connections
      const result = await withUserScope(ctx.userId, () => toolRegistry.execute(tool.id, input, toolContext));
      await ExecutionModel.updateOne({ _id: ctx.executionId }, { $inc: { toolCallCount: 1 } });
      await record('tool_result', {
        output: result.success ? { data: result.data } : { error: result.error },
        status: result.success ? 'success' : 'failure',
        metadata: { callId: call.id, executionTime: result.executionTime },
      });
      const payload = result.success ? { data: result.data } : { error: result.error };
      return {
        ok: result.success,
        content: truncate(JSON.stringify(payload), MAX_TOOL_RESULT_CHARS),
        data: result.data,
      };
    } catch (error) {
      const cause = (error as Error).cause as Error | undefined;
      return fail(cause?.message || (error as Error).message, 'tool_failed');
    }
  }

  /**
   * Ask a human to approve an action and pause the run. Used for
   * approval-gated tools and for explicit approval steps in workflows.
   */
  async requestApproval(
    ctx: RuntimeContext,
    toolId: string,
    input: Record<string, any>,
    reasoning?: string
  ): Promise<Suspension> {
    const approval = await approvalManager.requestApproval({
      executionId: ctx.executionId,
      agentId: ctx.agent.id,
      userId: ctx.userId,
      tool: toolId,
      input,
      reason: truncate(reasoning || `Agent ${ctx.agent.name} requested ${toolId}`, 2000),
    });
    const approvalId = String(approval._id);

    await executionMonitor.record({
      executionId: ctx.executionId,
      userId: ctx.userId,
      type: 'approval_request',
      tool: toolId,
      input,
      status: 'pending',
      metadata: { approvalId, expiresAt: approval.expiresAt },
    });
    await executionMonitor.setStatus(
      { id: ctx.executionId, userId: ctx.userId, agentId: ctx.agent.id },
      'waiting_approval'
    );
    return { suspended: 'approval', approvalId };
  }

  /**
   * Read the outcome of an approval. Records the decision on the timeline and
   * puts the run back to running once it is decided or has expired.
   */
  async resolveApproval(ctx: RuntimeContext, approvalId: string, toolId: string): Promise<ApprovalResolution> {
    let approval = await ApprovalModel.findById(approvalId).lean();
    if (!approval) throw new NotFoundError('Approval', approvalId);

    if (approval.status === 'pending') {
      if (new Date() <= new Date(approval.expiresAt)) return { status: 'pending' };
      await ApprovalModel.updateOne({ _id: approvalId, status: 'pending' }, { status: 'expired' });
      approval = { ...approval, status: 'expired' };
    }

    const status = approval.status as 'approved' | 'rejected' | 'expired';
    await executionMonitor.record({
      executionId: ctx.executionId,
      userId: ctx.userId,
      type: 'approval_decision',
      tool: toolId,
      output: { status, reviewerId: approval.reviewerId, comment: approval.reviewerComment },
      status: status === 'approved' ? 'success' : 'failure',
      metadata: { approvalId },
    });
    await executionMonitor.setStatus(
      { id: ctx.executionId, userId: ctx.userId, agentId: ctx.agent.id },
      'running'
    );
    return { status, approved: status === 'approved', comment: approval.reviewerComment };
  }

  /**
   * Cancel a run. A run that is waiting (queued or for approval) ends now; a
   * run in progress stops at its next model turn or tool call.
   */
  async cancel(executionId: string, userId: string): Promise<void> {
    const execution = await ExecutionModel.findOne({ _id: executionId, userId }).lean();
    if (!execution) throw new NotFoundError('Execution', executionId);
    if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
      throw new AppError(`Execution already ${execution.status}`, { statusCode: 409 });
    }
    await ExecutionModel.updateOne({ _id: executionId }, { cancelRequested: true });

    const leased = execution.leaseUntil && new Date(execution.leaseUntil) > new Date();
    if (!leased) {
      await ApprovalModel.updateMany(
        { executionId, status: 'pending' },
        { status: 'expired', reviewerComment: 'Execution cancelled' }
      );
      await executionMonitor.setStatus({ id: executionId, userId, agentId: execution.agentId }, 'cancelled');
    }
  }

  async isCancelled(executionId: string): Promise<boolean> {
    const execution = await ExecutionModel.findById(executionId).select('cancelRequested').lean();
    return Boolean(execution?.cancelRequested);
  }

  async assertNotCancelled(executionId: string): Promise<void> {
    if (await this.isCancelled(executionId)) {
      throw new ExecutionCancelledError(executionId);
    }
  }
}

export const agentRuntime = AgentRuntime.getInstance();
