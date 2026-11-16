import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  Tool,
  ToolDescriptor,
  ToolRegistrationOptions,
  ToolExecutionOptions,
  ToolExecutionResult,
} from '../types/tool.types';
import {
  ToolNotFoundError,
  ToolExecutionError,
  ToolValidationError,
  ConflictError,
  logger,
  ToolContext,
  PermissionLevel,
} from '@athena/shared';

const TOOL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Tool Registry - Manages tool registration, description, and execution.
 * Permission and approval checks happen in the AgentRuntime, which owns the
 * execution context; the registry only validates input and runs handlers.
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private static instance: ToolRegistry;

  private constructor() {}

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  register(tool: Tool, options: ToolRegistrationOptions = {}): void {
    if (this.tools.has(tool.id) && !options.override) {
      throw new ConflictError(`Tool already registered: ${tool.id}`, { toolId: tool.id });
    }
    this.validateTool(tool);
    this.tools.set(tool.id, tool);
    logger.debug(`Tool registered: ${tool.id}`, {
      toolId: tool.id,
      permissionLevel: tool.permissionLevel,
    });
  }

  registerMany(tools: Tool[], options: ToolRegistrationOptions = {}): void {
    tools.forEach((tool) => this.register(tool, options));
  }

  get(toolId: string): Tool {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new ToolNotFoundError(toolId);
    }
    return tool;
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): Tool[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  getByPermissionLevel(level: PermissionLevel): Tool[] {
    return this.getAll().filter((tool) => tool.permissionLevel === level);
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  clear(): void {
    this.tools.clear();
  }

  get size(): number {
    return this.tools.size;
  }

  /**
   * Whether calling this tool needs a human approval
   */
  requiresApproval(toolId: string): boolean {
    const tool = this.get(toolId);
    return tool.permissionLevel === 'high' || tool.requiresApproval;
  }

  /**
   * Validate input against the tool schema, returning the parsed value
   */
  validateInput(toolId: string, input: unknown): any {
    const tool = this.get(toolId);
    const result = tool.inputSchema.safeParse(input);
    if (!result.success) {
      throw new ToolValidationError(tool.id, result.error.errors);
    }
    return result.data;
  }

  /**
   * Execute a tool. Input is validated before the handler runs.
   */
  async execute<TOutput = any>(
    toolId: string,
    input: unknown,
    context: ToolContext,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();
    const tool = this.get(toolId);
    const validatedInput = this.validateInput(toolId, input);

    try {
      const result = await this.withTimeout(
        tool.handler(validatedInput, context),
        options.timeout ?? DEFAULT_TIMEOUT_MS,
        toolId
      );
      const executionTime = Date.now() - startTime;

      logger.info(`Tool executed: ${toolId}`, {
        toolId,
        executionId: context.executionId,
        executionTime,
        success: result.success,
      });

      return { ...result, tool: toolId, executionTime, timestamp: new Date() };
    } catch (error) {
      logger.error(`Tool execution failed: ${toolId}`, error as Error, {
        toolId,
        executionId: context.executionId,
      });
      throw new ToolExecutionError(toolId, error as Error);
    }
  }

  /**
   * Describe a tool with its input schema converted to JSON Schema
   */
  describe(toolId: string): ToolDescriptor {
    const tool = this.get(toolId);
    // Cast avoids a TS deep-instantiation error from zod-to-json-schema's generics
    const jsonSchema = (zodToJsonSchema as (schema: unknown, options: object) => object)(tool.inputSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    delete jsonSchema.$schema;

    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: jsonSchema,
      permissionLevel: tool.permissionLevel,
      requiredPermissions: tool.requiredPermissions,
      requiresApproval: this.requiresApproval(tool.id),
      category: tool.category,
      connections: tool.connections ?? [],
    };
  }

  describeAll(): ToolDescriptor[] {
    return this.getAll().map((tool) => this.describe(tool.id));
  }

  private validateTool(tool: Tool): void {
    if (!tool.id || !TOOL_ID_PATTERN.test(tool.id)) {
      throw new Error(`Tool id must match ${TOOL_ID_PATTERN}: ${tool.id}`);
    }
    if (!tool.name) {
      throw new Error(`Tool ${tool.id} must have a name`);
    }
    if (!tool.description) {
      throw new Error(`Tool ${tool.id} must have a description`);
    }
    if (!tool.inputSchema) {
      throw new Error(`Tool ${tool.id} must have an input schema`);
    }
    if (typeof tool.handler !== 'function') {
      throw new Error(`Tool ${tool.id} must have a handler function`);
    }
    if (!['low', 'medium', 'high'].includes(tool.permissionLevel)) {
      throw new Error(`Tool ${tool.id} has an invalid permission level`);
    }
    if (!Array.isArray(tool.requiredPermissions)) {
      throw new Error(`Tool ${tool.id} must declare requiredPermissions`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolId: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tool ${toolId} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}

export const toolRegistry = ToolRegistry.getInstance();
