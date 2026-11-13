import { ZodSchema } from 'zod';
import { PermissionLevel, ToolContext, ToolResult } from '@athena/shared';

/**
 * Tool handler function signature
 */
export type ToolHandler<TInput = any, TOutput = any> = (
  input: TInput,
  context: ToolContext
) => Promise<ToolResult<TOutput>>;

/**
 * Tool definition
 */
export interface Tool<TInput = any, TOutput = any> {
  /** Unique id, also the name exposed to the LLM. Must match ^[a-zA-Z0-9_-]{1,64}$ */
  id: string;
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema?: ZodSchema<TOutput>;
  permissionLevel: PermissionLevel;
  /** Permissions the calling agent must hold, e.g. ["read:transactions"] */
  requiredPermissions: string[];
  /** Force a human approval before execution. High permission level always requires approval. */
  requiresApproval: boolean;
  category?: string;
  handler: ToolHandler<TInput, TOutput>;
  metadata?: Record<string, any>;
}

/**
 * Tool registration options
 */
export interface ToolRegistrationOptions {
  override?: boolean;
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  timeout?: number;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult<T = any> extends ToolResult<T> {
  tool: string;
  executionTime: number;
  timestamp: Date;
}

/**
 * Serializable tool description (for APIs and LLM providers)
 */
export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permissionLevel: PermissionLevel;
  requiredPermissions: string[];
  requiresApproval: boolean;
  category?: string;
}
