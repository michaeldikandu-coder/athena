import { model, Model } from 'mongoose';
import { IExecutionEvent, ExecutionEventSchema } from '../schemas/execution-event.schema';

export const ExecutionEventModel: Model<IExecutionEvent> = model<IExecutionEvent>(
  'ExecutionEvent',
  ExecutionEventSchema
);
