import { Schema } from 'mongoose';

export interface IExecutionTrigger {
  type: string;
  source: string;
  payload: Record<string, any>;
}

export interface IExecution {
  _id: string;
  agentId: string;
  workflowId?: string;
  trigger: IExecutionTrigger;
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, any>;
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
      required: true,
    },
  },
  { _id: false }
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
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'executions',
  }
);

// Indexes
ExecutionSchema.index({ agentId: 1, status: 1 });
ExecutionSchema.index({ userId: 1, startedAt: -1 });
ExecutionSchema.index({ status: 1, startedAt: -1 });
ExecutionSchema.index({ workflowId: 1, startedAt: -1 });
