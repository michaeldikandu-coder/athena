import { model, Model } from 'mongoose';
import { IMemory, MemorySchema } from '../schemas/memory.schema';

export const MemoryModel: Model<IMemory> = model<IMemory>('Memory', MemorySchema);
