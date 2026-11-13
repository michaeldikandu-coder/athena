import { Schema } from 'mongoose';

export interface IExecutionEvent {
  executionId: string;
  timestamp: Date;
  type: 'agent_reasoning' | 'tool_call' | 'tool_result' | 'approval_request' | 'approval_decision' | 'error' | 'status_change';
  tool?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  status: 'success' | 'failure' | 'pending';
  metadata?: Record<string, any>;
  createdAt: Date;
}

export const ExecutionEventSchema = new Schema<IExecutionEvent>(
  {
    executionId: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'agent_reasoning',
        'tool_call',
        'tool_result',
        'approval_request',
        'approval_decision',
        'error',
        'status_change',
      ],
      required: true,
      index: true,
    },
    tool: {
      type: String,
      index: true,
    },
    input: {
      type: Schema.Types.Mixed,
    },
    output: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['success', 'failure', 'pending'],
      default: 'success',
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'execution_events',
    minimize: false,
  }
);

// Indexes
ExecutionEventSchema.index({ executionId: 1, timestamp: 1 });
ExecutionEventSchema.index({ executionId: 1, type: 1 });
ExecutionEventSchema.index({ type: 1, timestamp: -1 });
