import { ExecutionEventModel, ExecutionModel, IExecution, IExecutionEvent } from '@athena/database';
import { ExecutionEventType, ExecutionStatus, logger, truncate } from '@athena/shared';
import { eventBus, ExecutionEventPayload } from '../events/event-bus';

export interface RecordEventInput {
  executionId: string;
  userId: string;
  type: ExecutionEventType;
  tool?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  status?: 'success' | 'failure' | 'pending';
  metadata?: Record<string, any>;
}

const MAX_STORED_STRING = 20000;

/**
 * Execution Monitor - persists the execution timeline and broadcasts it
 * on the event bus for real-time clients.
 */
export class ExecutionMonitor {
  private static instance: ExecutionMonitor;

  private constructor() {}

  static getInstance(): ExecutionMonitor {
    if (!ExecutionMonitor.instance) {
      ExecutionMonitor.instance = new ExecutionMonitor();
    }
    return ExecutionMonitor.instance;
  }

  async record(input: RecordEventInput): Promise<ExecutionEventPayload> {
    const doc = await ExecutionEventModel.create({
      executionId: input.executionId,
      timestamp: new Date(),
      type: input.type,
      tool: input.tool,
      input: this.limit(input.input),
      output: this.limit(input.output),
      status: input.status ?? 'success',
      metadata: input.metadata,
    });

    const payload = this.serialize(doc.toObject() as IExecutionEvent & { _id: unknown });
    eventBus.emit('execution.event', { userId: input.userId, event: payload });
    return payload;
  }

  async setStatus(
    execution: Pick<IExecution, 'userId' | 'agentId'> & { id: string },
    status: ExecutionStatus,
    extra: { error?: string; result?: Record<string, any> } = {}
  ): Promise<void> {
    const update: Record<string, any> = { status };
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      update.completedAt = new Date();
    }
    if (extra.error !== undefined) update.error = extra.error;
    if (extra.result !== undefined) update.result = extra.result;

    await ExecutionModel.findByIdAndUpdate(execution.id, update);

    await this.record({
      executionId: execution.id,
      userId: execution.userId,
      type: 'status_change',
      output: { status, ...(extra.error ? { error: extra.error } : {}) },
      status: status === 'failed' ? 'failure' : 'success',
    });

    eventBus.emit('execution.status', {
      userId: execution.userId,
      executionId: execution.id,
      agentId: execution.agentId,
      status,
      error: extra.error,
    });

    logger.info('Execution status changed', { executionId: execution.id, status });
  }

  async getTimeline(executionId: string): Promise<ExecutionEventPayload[]> {
    const events = await ExecutionEventModel.find({ executionId })
      .sort({ timestamp: 1, _id: 1 })
      .lean();
    return events.map((e) => this.serialize(e as IExecutionEvent & { _id: unknown }));
  }

  serialize(e: IExecutionEvent & { _id: unknown }): ExecutionEventPayload {
    return {
      id: String(e._id),
      executionId: e.executionId,
      timestamp: new Date(e.timestamp).toISOString(),
      type: e.type,
      tool: e.tool,
      input: e.input,
      output: e.output,
      status: e.status,
      metadata: e.metadata,
    };
  }

  /**
   * Keep stored documents bounded; large tool outputs are truncated.
   */
  private limit(value?: Record<string, any>): Record<string, any> | undefined {
    if (value === undefined) return undefined;
    const json = JSON.stringify(value);
    if (json.length <= MAX_STORED_STRING) return value;
    return { truncated: true, preview: truncate(json, MAX_STORED_STRING) };
  }
}

export const executionMonitor = ExecutionMonitor.getInstance();
