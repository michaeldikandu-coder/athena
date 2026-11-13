import { Schema } from 'mongoose';

export interface IWorkflowTrigger {
  type: 'event' | 'webhook' | 'schedule' | 'manual';
  config: Record<string, any>;
}

export interface IWorkflowStep {
  id: string;
  type: 'agent_task' | 'tool_call' | 'approval' | 'condition';
  config: Record<string, any>;
  nextSteps?: string[]; // For conditional branching
}

export interface IWorkflow {
  name: string;
  description: string;
  agentId: string;
  trigger: IWorkflowTrigger;
  steps: IWorkflowStep[];
  status: 'active' | 'inactive';
  application?: string;
  lastRunAt?: Date;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowTriggerSchema = new Schema<IWorkflowTrigger>(
  {
    type: {
      type: String,
      enum: ['event', 'webhook', 'schedule', 'manual'],
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { _id: false, minimize: false }
);

const WorkflowStepSchema = new Schema<IWorkflowStep>(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['agent_task', 'tool_call', 'approval', 'condition'],
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
    },
    nextSteps: {
      type: [String],
      default: undefined,
    },
  },
  { _id: false, minimize: false }
);

export const WorkflowSchema = new Schema<IWorkflow>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    trigger: {
      type: WorkflowTriggerSchema,
      required: true,
    },
    steps: {
      type: [WorkflowStepSchema],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    application: {
      type: String,
      index: true,
    },
    lastRunAt: {
      type: Date,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'workflows',
    minimize: false,
  }
);

// Indexes
WorkflowSchema.index({ agentId: 1, status: 1 });
WorkflowSchema.index({ 'trigger.type': 1 });
