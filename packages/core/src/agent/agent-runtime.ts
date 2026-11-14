import { AgentModel, AgentToolModel, ExecutionModel, IAgent } from '@athena/database';
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
import { LLMMessage, LLMToolCall } from '../llm/llm.types';
import { withUserScope } from '../connections';

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

export class ExecutionCancelledError extends AppError {
  constructor(executionId: string) {
    super('Execution was cancelled', { statusCode: 409, context: { executionId } });
  }
}

const MAX_TOOL_RESULT_CHARS = 15000;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_EXECUTIONS || 5);

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
 */
export class AgentRuntime {
  private static instance: AgentRuntime;
  private active = new Set<string>();
  private cancelled = new Set<string>();

  private constructor() {}

  static getInstance(): AgentRuntime {
    if (!AgentRuntime.instance) {
      AgentRuntime.instance = new AgentRuntime();
    }
    return AgentRuntime.instance;
  }

  get activeCount(): number {
    return this.active.size;
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
   * Create an execution record in pending state
   */
  async createExecution(
    agent: LoadedAgent,
    input: Omit<StartExecutionInput, 'agentId'>
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
    if (this.active.size >= MAX_CONCURRENT) {
      throw new RateLimitError();
    }
    const agent = await this.loadAgent(input.agentId, input.userId);
    const ctx = await this.createExecution(agent, input);

    void this.runToCompletion(ctx, input.task, input.context);
    return { executionId: ctx.executionId };
  }

  /**
   * Run an agent task inside a new execution and wait for the outcome
   */
  async runToCompletion(
    ctx: RuntimeContext,
    task: string,
    context?: Record<string, any>
  ): Promise<{ status: 'completed' | 'failed' | 'cancelled'; summary?: string; error?: string }> {
    this.active.add(ctx.executionId);
    const statusTarget = { id: ctx.executionId, userId: ctx.userId, agentId: ctx.agent.id };
    try {
      await executionMonitor.setStatus(statusTarget, 'running');
      const outcome = await this.runAgentTask(ctx, task, context);
      await executionMonitor.setStatus(statusTarget, 'completed', {
        result: { summary: outcome.summary, incomplete: outcome.incomplete },
      });
      return { status: 'completed', summary: outcome.summary };
    } catch (error) {
      if (error instanceof ExecutionCancelledError) {
        await executionMonitor.setStatus(statusTarget, 'cancelled');
        return { status: 'cancelled' };
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Execution failed', error as Error, { executionId: ctx.executionId });
      await executionMonitor
        .record({
          executionId: ctx.executionId,
          userId: ctx.userId,
          type: 'error',
          output: { message },
          status: 'failure',
        })
        .catch(() => undefined);
      await executionMonitor.setStatus(statusTarget, 'failed', { error: message });
      return { status: 'failed', error: message };
    } finally {
      this.active.delete(ctx.executionId);
      this.cancelled.delete(ctx.executionId);
    }
  }

  /**
   * The reasoning loop. Used directly by the workflow engine for agent_task steps.
   */
  async runAgentTask(
    ctx: RuntimeContext,
    task: string,
    context?: Record<string, any>
  ): Promise<{ summary: string; incomplete: boolean }> {
    const { agent } = ctx;
    const llm = getLLMClient(agent.provider);
    const tools = agent.toolIds.map((id) => {
      const descriptor = toolRegistry.describe(id);
      const approvalNote = descriptor.requiresApproval ? ' [Requires human approval]' : '';
      return {
        name: descriptor.id,
        description: descriptor.description + approvalNote,
        inputSchema: descriptor.inputSchema,
      };
    });

    const memoryContext = await memoryManager.buildContext(agent.id);
    const system = [
      agent.systemPrompt,
      PLATFORM_RULES,
      `Current time: ${new Date().toISOString()}`,
      memoryContext,
    ]
      .filter(Boolean)
      .join('\n\n');

    const userContent =
      context && Object.keys(context).length > 0
        ? `${task}\n\nContext (JSON):\n${truncate(JSON.stringify(context, null, 2), 20000)}`
        : task;
    const messages: LLMMessage[] = [{ role: 'user', content: userContent }];

    let finalText = '';
    let incomplete = true;

    for (let iteration = 1; iteration <= agent.maxIterations; iteration++) {
      await this.assertNotCancelled(ctx.executionId);

      const response = await llm.chat({
        model: agent.model,
        system,
        messages,
        tools,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });

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
          metadata: { iteration, stopReason: response.stopReason },
        });
      }

      if (response.stopReason === 'refusal') {
        throw new AppError('The model declined this request', { statusCode: 422 });
      }

      messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls,
        providerContent: response.providerContent,
        provider: agent.provider,
      });

      if (response.toolCalls.length === 0) {
        finalText = response.text;
        incomplete = response.stopReason === 'max_tokens';
        break;
      }

      for (const call of response.toolCalls) {
        const result = await this.invokeTool(ctx, call, response.text);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: result.content,
          isError: !result.ok,
        });
      }

      finalText = response.text;
    }

    if (incomplete && !finalText) {
      finalText = `Stopped after ${agent.maxIterations} iterations without a final report.`;
    }

    await memoryManager
      .store({
        agentId: agent.id,
        executionId: ctx.executionId,
        type: 'decision',
        content: `Task: ${truncate(task, 200)} | Outcome: ${truncate(finalText, 800)}`,
      })
      .catch((error) => logger.warn('Failed to store decision memory', { error: String(error) }));

    return { summary: finalText, incomplete };
  }

  /**
   * Invoke a tool on behalf of an agent: availability, permission, validation,
   * approval, execution, and timeline recording. All tool calls (agent loop and
   * workflow steps) go through here.
   */
  async invokeTool(
    ctx: RuntimeContext,
    call: LLMToolCall,
    reasoning?: string
  ): Promise<ToolInvocationResult> {
    const record = (type: Parameters<typeof executionMonitor.record>[0]['type'], extra: object) =>
      executionMonitor.record({
        executionId: ctx.executionId,
        userId: ctx.userId,
        type,
        tool: call.name,
        ...extra,
      });

    await record('tool_call', { input: call.input, status: 'pending', metadata: { callId: call.id } });

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
      const decision = await this.awaitApproval(ctx, tool.id, input as Record<string, any>, reasoning);
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
   * Pause the execution until a human approves or rejects. Used for approval-gated
   * tools and for explicit approval steps in workflows.
   */
  async awaitApproval(
    ctx: RuntimeContext,
    toolId: string,
    input: Record<string, any>,
    reasoning?: string
  ): Promise<{ approved: boolean; status: string; comment?: string }> {
    const approval = await approvalManager.requestApproval({
      executionId: ctx.executionId,
      agentId: ctx.agent.id,
      userId: ctx.userId,
      tool: toolId,
      input,
      reason: truncate(reasoning || `Agent ${ctx.agent.name} requested ${toolId}`, 2000),
    });
    const approvalId = String(approval._id);
    const statusTarget = { id: ctx.executionId, userId: ctx.userId, agentId: ctx.agent.id };

    await executionMonitor.record({
      executionId: ctx.executionId,
      userId: ctx.userId,
      type: 'approval_request',
      tool: toolId,
      input,
      status: 'pending',
      metadata: { approvalId, expiresAt: approval.expiresAt },
    });
    await executionMonitor.setStatus(statusTarget, 'waiting_approval');

    const outcome = await approvalManager.waitForDecision(approvalId, () =>
      this.isCancelled(ctx.executionId)
    );

    if (outcome.status === 'cancelled') {
      throw new ExecutionCancelledError(ctx.executionId);
    }

    await executionMonitor.record({
      executionId: ctx.executionId,
      userId: ctx.userId,
      type: 'approval_decision',
      tool: toolId,
      output: {
        status: outcome.status,
        reviewerId: outcome.approval.reviewerId,
        comment: outcome.approval.reviewerComment,
      },
      status: outcome.status === 'approved' ? 'success' : 'failure',
      metadata: { approvalId },
    });
    await executionMonitor.setStatus(statusTarget, 'running');

    return {
      approved: outcome.status === 'approved',
      status: outcome.status,
      comment: outcome.approval.reviewerComment,
    };
  }

  /**
   * Request cancellation. Takes effect at the next iteration, tool call, or approval poll.
   */
  async cancel(executionId: string, userId: string): Promise<void> {
    const execution = await ExecutionModel.findOne({ _id: executionId, userId });
    if (!execution) throw new NotFoundError('Execution', executionId);
    if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
      throw new AppError(`Execution already ${execution.status}`, { statusCode: 409 });
    }
    await ExecutionModel.updateOne({ _id: executionId }, { cancelRequested: true });
    this.cancelled.add(executionId);

    // Executions not running in this process (e.g. pending) are closed directly
    if (!this.active.has(executionId)) {
      await executionMonitor.setStatus(
        { id: executionId, userId, agentId: execution.agentId },
        'cancelled'
      );
    }
  }

  private async isCancelled(executionId: string): Promise<boolean> {
    if (this.cancelled.has(executionId)) return true;
    const execution = await ExecutionModel.findById(executionId).select('cancelRequested').lean();
    return Boolean(execution?.cancelRequested);
  }

  private async assertNotCancelled(executionId: string): Promise<void> {
    if (await this.isCancelled(executionId)) {
      throw new ExecutionCancelledError(executionId);
    }
  }

  /**
   * Executions are held in memory while running. After a restart, mark any that
   * were in flight as failed so they do not appear stuck.
   */
  async recoverInterrupted(): Promise<number> {
    const stuck = await ExecutionModel.find({
      status: { $in: ['pending', 'running', 'waiting_approval'] },
    }).lean();
    for (const execution of stuck) {
      await executionMonitor.setStatus(
        { id: String(execution._id), userId: execution.userId, agentId: execution.agentId },
        'failed',
        { error: 'Interrupted by server restart' }
      );
    }
    return stuck.length;
  }
}

export const agentRuntime = AgentRuntime.getInstance();
