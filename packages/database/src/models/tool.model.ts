import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { ITool, ToolSchema } from '../schemas/tool.schema';

export const ToolModel: Model<ITool> = defineModel<ITool>('Tool', ToolSchema);
