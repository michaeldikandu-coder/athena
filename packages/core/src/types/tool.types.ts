import { z, ZodSchema } from 'zod';
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
  id: string;
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema?: ZodSchema<TOutput>;
  permissionLevel: PermissionLevel;
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
  skipPermissionCheck?: boolean;
  skipApprovalCheck?: boolean;
  timeout?: number;
}

/**
 * Tool call request
 */
export interface ToolCall {
  tool: string;
  input: Record<string, any>;
  requestId?: string;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult<T = any> extends ToolResult<T> {
  tool: string;
  executionTime: number;
  timestamp: Date;
  requestId?: string;
}
