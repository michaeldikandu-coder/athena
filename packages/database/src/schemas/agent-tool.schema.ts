import { Schema } from 'mongoose';

export interface IAgentTool {
  _id: string;
  agentId: string;
  toolId: string;
  enabled: boolean;
  customConfig?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const AgentToolSchema = new Schema<IAgentTool>(
  {
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    toolId: {
      type: String,
      required: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    customConfig: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'agent_tools',
  }
);

// Indexes
AgentToolSchema.index({ agentId: 1, toolId: 1 }, { unique: true });
AgentToolSchema.index({ agentId: 1, enabled: 1 });
AgentToolSchema.index({ toolId: 1 });
