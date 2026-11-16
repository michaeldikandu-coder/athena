// Connection
export {
  DatabaseConnection,
  connectDatabase,
  disconnectDatabase,
  getDatabaseHealth,
  getDatabaseStatus,
  explainMongoError,
  isMongoUnavailableError,
  redactMongoUri,
} from './connection';

// Models
export { UserModel } from './models/user.model';
export { AgentModel } from './models/agent.model';
export { ToolModel } from './models/tool.model';
export { AgentToolModel } from './models/agent-tool.model';
export { WorkflowModel } from './models/workflow.model';
export { ExecutionModel } from './models/execution.model';
export { ExecutionEventModel } from './models/execution-event.model';
export { MemoryModel } from './models/memory.model';
export { ApprovalModel } from './models/approval.model';
export { ConnectionModel } from './models/connection.model';
export { WebhookDeliveryModel, SystemLockModel } from './models/system.model';
export { CustomToolModel } from './models/custom-tool.model';

// Schema Interfaces
export type { IUser } from './schemas/user.schema';
export type { IAgent, IModelConfig } from './schemas/agent.schema';
export type { ITool } from './schemas/tool.schema';
export type { IAgentTool } from './schemas/agent-tool.schema';
export type { IWorkflow, IWorkflowTrigger, IWorkflowStep } from './schemas/workflow.schema';
export type { IExecution, IExecutionTrigger } from './schemas/execution.schema';
export type { IExecutionEvent } from './schemas/execution-event.schema';
export type { IMemory } from './schemas/memory.schema';
export type { IApproval, IApprovalRequestedAction } from './schemas/approval.schema';
export type { IConnection } from './schemas/connection.schema';
export type { ICustomTool, ICustomToolInput } from './schemas/custom-tool.schema';
