import { Schema } from 'mongoose';

export interface IModelConfig {
  provider: 'anthropic' | 'groq';
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface IAgent {
  name: string;
  description: string;
  systemPrompt: string;
  modelConfig: IModelConfig;
  /** Permission grants such as "read:transactions" or "write:*" */
  permissions: string[];
  /** Application that installed this agent, e.g. "moneyguard". Empty for custom agents. */
  application?: string;
  maxIterations: number;
  status: 'active' | 'inactive' | 'error';
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ModelConfigSchema = new Schema<IModelConfig>(
  {
    provider: {
      type: String,
      enum: ['anthropic', 'groq'],
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    temperature: {
      type: Number,
      min: 0,
      max: 2,
      default: 0.7,
    },
    maxTokens: {
      type: Number,
      min: 1,
      max: 100000,
      default: 4096,
    },
  },
  { _id: false }
);

export const AgentSchema = new Schema<IAgent>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    systemPrompt: {
      type: String,
      required: true,
    },
    modelConfig: {
      type: ModelConfigSchema,
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    application: {
      type: String,
      index: true,
    },
    maxIterations: {
      type: Number,
      min: 1,
      max: 50,
      default: 15,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'error'],
      default: 'active',
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'agents',
  }
);

// Indexes
AgentSchema.index({ userId: 1, status: 1 });
AgentSchema.index({ name: 1, userId: 1 });
