import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IExecution, ExecutionSchema } from '../schemas/execution.schema';

export const ExecutionModel: Model<IExecution> = defineModel<IExecution>('Execution', ExecutionSchema);
