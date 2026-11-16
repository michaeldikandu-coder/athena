import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IAgent, AgentSchema } from '../schemas/agent.schema';

export const AgentModel: Model<IAgent> = defineModel<IAgent>('Agent', AgentSchema);
