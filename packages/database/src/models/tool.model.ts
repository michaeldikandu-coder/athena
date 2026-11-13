import { model, Model } from 'mongoose';
import { ITool, ToolSchema } from '../schemas/tool.schema';

export const ToolModel: Model<ITool> = model<ITool>('Tool', ToolSchema);
