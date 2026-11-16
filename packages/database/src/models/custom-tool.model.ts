import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { CustomToolSchema, ICustomTool } from '../schemas/custom-tool.schema';

export const CustomToolModel: Model<ICustomTool> = defineModel<ICustomTool>('CustomTool', CustomToolSchema);
