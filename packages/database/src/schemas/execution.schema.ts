import { Schema } from 'mongoose';

export interface IExecutionTrigger {
  type: string;
  source: string;
  payload: Record<string, any>;
}

export interface IExecution {
  agentId: string;
  workflowId?: string;
  trigger: IExecutionTrigger;
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, any>;
  task?: string;
  application?: string;
  iterations: number;
  toolCallCount: number;
  usage: { inputTokens: number; outputTokens: number };
  cancelRequested: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionTriggerSchema = new Schema<IExecutionTrigger>(
  {
    type: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { _id: false, minimize: false }
);

export const ExecutionSchema = new Schema<IExecution>(
  {
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    workflowId: {
      type: String,
      index: true,
    },
    trigger: {
      type: ExecutionTriggerSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      index: true,
    },
    error: {
      type: String,
    },
    result: {
      type: Schema.Types.Mixed,
    },
    task: {
      type: String,
    },
    application: {
      type: String,
      index: true,
    },
    iterations: {
      type: Number,
      default: 0,
    },
    toolCallCount: {
      type: Number,
      default: 0,
    },
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },
    cancelRequested: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'executions',
    minimize: false,
  }
);

// Indexes
ExecutionSchema.index({ agentId: 1, status: 1 });
ExecutionSchema.index({ userId: 1, startedAt: -1 });
ExecutionSchema.index({ status: 1, startedAt: -1 });
ExecutionSchema.index({ workflowId: 1, startedAt: -1 });
