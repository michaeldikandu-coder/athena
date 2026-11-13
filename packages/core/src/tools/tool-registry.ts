import {
  Tool,
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
} from '@athena/shared';

/**
 * Tool Registry - Manages tool registration and execution
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

  /**
   * Register a tool
   */
  register(tool: Tool, options: ToolRegistrationOptions = {}): void {
    const { override = false } = options;

    if (this.tools.has(tool.id) && !override) {
      throw new ConflictError(`Tool already registered: ${tool.id}`, { toolId: tool.id });
    }

    // Validate tool definition
    this.validateTool(tool);

    this.tools.set(tool.id, tool);
    logger.info(`Tool registered: ${tool.id}`, {
      toolId: tool.id,
      name: tool.name,
      permissionLevel: tool.permissionLevel,
    });
  }

  /**
   * Register multiple tools
   */
  registerMany(tools: Tool[], options: ToolRegistrationOptions = {}): void {
    tools.forEach((tool) => this.register(tool, options));
  }

  /**
   * Get a tool by ID
   */
  get(toolId: string): Tool {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new ToolNotFoundError(toolId);
    }
    return tool;
  }

  /**
   * Check if a tool exists
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): Tool[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  /**
   * Get tools by permission level
   */
  getByPermissionLevel(level: 'low' | 'medium' | 'high'): Tool[] {
    return this.getAll().filter((tool) => tool.permissionLevel === level);
  }

  /**
   * Remove a tool
   */
  unregister(toolId: string): boolean {
    const existed = this.tools.has(toolId);
    this.tools.delete(toolId);
    if (existed) {
      logger.info(`Tool unregistered: ${toolId}`, { toolId });
    }
    return existed;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    logger.info('All tools cleared from registry');
  }

  /**
   * Execute a tool
   */
  async execute<TOutput = any>(
    toolId: string,
    input: any,
    context: ToolContext,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();
    const tool = this.get(toolId);

    logger.debug(`Executing tool: ${toolId}`, {
      toolId,
      executionId: context.executionId,
      input,
    });

    try {
      // Validate input
      const validatedInput = this.validateInput(tool, input);

      // Execute tool handler with timeout
      const result = await this.executeWithTimeout(
        tool.handler(validatedInput, context),
        options.timeout || 30000
      );

      const executionTime = Date.now() - startTime;

      logger.info(`Tool executed successfully: ${toolId}`, {
        toolId,
        executionId: context.executionId,
        executionTime,
        success: result.success,
      });

      return {
        ...result,
        tool: toolId,
        executionTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(`Tool execution failed: ${toolId}`, error as Error, {
        toolId,
        executionId: context.executionId,
        executionTime,
      });

      if (error instanceof ToolValidationError) {
        throw error;
      }

      throw new ToolExecutionError(toolId, error as Error);
    }
  }

  /**
   * Validate tool definition
   */
  private validateTool(tool: Tool): void {
    if (!tool.id || typeof tool.id !== 'string') {
      throw new Error('Tool must have a valid ID');
    }

    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a description');
    }

    if (!tool.inputSchema) {
      throw new Error('Tool must have an input schema');
    }

    if (typeof tool.handler !== 'function') {
      throw new Error('Tool must have a handler function');
    }

    if (!['low', 'medium', 'high'].includes(tool.permissionLevel)) {
      throw new Error('Tool must have a valid permission level');
    }
  }

  /**
   * Validate tool input against schema
   */
  private validateInput(tool: Tool, input: any): any {
    try {
      return tool.inputSchema.parse(input);
    } catch (error) {
      throw new ToolValidationError(tool.id, error);
    }
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Export tools as JSON (for serialization)
   */
  toJSON(): any[] {
    return this.getAll().map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      permissionLevel: tool.permissionLevel,
      requiresApproval: tool.requiresApproval,
      category: tool.category,
      metadata: tool.metadata,
    }));
  }
}

// Export singleton instance
export const toolRegistry = ToolRegistry.getInstance();
