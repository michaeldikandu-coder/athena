import { model, Model } from 'mongoose';
import { IAgent, AgentSchema } from '../schemas/agent.schema';

export const AgentModel: Model<IAgent> = model<IAgent>('Agent', AgentSchema);
