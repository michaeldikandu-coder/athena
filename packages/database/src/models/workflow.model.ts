import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IWorkflow, WorkflowSchema } from '../schemas/workflow.schema';

export const WorkflowModel: Model<IWorkflow> = defineModel<IWorkflow>('Workflow', WorkflowSchema);
