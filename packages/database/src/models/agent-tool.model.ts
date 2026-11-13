import { model, Model } from 'mongoose';
import { IAgentTool, AgentToolSchema } from '../schemas/agent-tool.schema';

export const AgentToolModel: Model<IAgentTool> = model<IAgentTool>('AgentTool', AgentToolSchema);
