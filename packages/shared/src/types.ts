/**
 * Common types used across the application
 */

export type Status = 'active' | 'inactive' | 'error';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PermissionLevel = 'low' | 'medium' | 'high';

export type MemoryType = 'context' | 'conversation' | 'fact' | 'decision';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type WorkflowTriggerType = 'event' | 'webhook' | 'schedule' | 'manual';

export type WorkflowStepType = 'agent_task' | 'tool_call' | 'approval' | 'condition';

export type ExecutionEventType =
  | 'agent_reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'approval_request'
  | 'approval_decision'
  | 'error'
  | 'status_change';

export type LLMProvider = 'anthropic' | 'groq';

export type UserRole = 'admin' | 'user';

/**
 * Utility types
 */
export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/**
 * Context types
 */
export interface ExecutionContext {
  executionId: string;
  agentId: string;
  userId: string;
  startedAt: Date;
}

export interface ToolContext extends ExecutionContext {
  toolName: string;
  permissions: string[];
}

/**
 * Tool result types
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Webhook payload types
 */
export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
  signature?: string;
}

/**
 * Event types
 */
export interface SystemEvent {
  type: string;
  timestamp: Date;
  data: Record<string, any>;
  source?: string;
}

/**
 * Filter and query types
 */
export interface QueryFilter {
  [key: string]: any;
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface QueryOptions {
  filter?: QueryFilter;
  sort?: SortOptions;
  pagination?: PaginationOptions;
  select?: string[];
}
