import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IMemory, MemorySchema } from '../schemas/memory.schema';

export const MemoryModel: Model<IMemory> = defineModel<IMemory>('Memory', MemorySchema);
