import { model, Model } from 'mongoose';
import { IExecution, ExecutionSchema } from '../schemas/execution.schema';

export const ExecutionModel: Model<IExecution> = model<IExecution>('Execution', ExecutionSchema);
