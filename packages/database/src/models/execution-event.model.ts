import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IExecutionEvent, ExecutionEventSchema } from '../schemas/execution-event.schema';

export const ExecutionEventModel: Model<IExecutionEvent> = defineModel<IExecutionEvent>('ExecutionEvent',
  ExecutionEventSchema
);
