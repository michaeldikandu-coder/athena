import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IAgentTool, AgentToolSchema } from '../schemas/agent-tool.schema';

export const AgentToolModel: Model<IAgentTool> = defineModel<IAgentTool>('AgentTool', AgentToolSchema);
