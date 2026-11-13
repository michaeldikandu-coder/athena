import { model, Model } from 'mongoose';
import { IWorkflow, WorkflowSchema } from '../schemas/workflow.schema';

export const WorkflowModel: Model<IWorkflow> = model<IWorkflow>('Workflow', WorkflowSchema);
