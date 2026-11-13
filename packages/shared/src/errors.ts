/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      isOperational?: boolean;
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode || 500;
    this.isOperational = options.isOperational ?? true;
    this.context = options.context;

    if (options.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Tool-related errors
 */
export class ToolError extends AppError {
  constructor(message: string, options?: { context?: Record<string, any>; cause?: Error }) {
    super(message, { ...options, statusCode: 400 });
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, { context: { toolName } });
  }
}

export class ToolExecutionError extends ToolError {
  constructor(toolName: string, cause: Error) {
    super(`Tool execution failed: ${toolName}`, {
      context: { toolName },
      cause,
    });
  }
}

export class ToolValidationError extends ToolError {
  constructor(toolName: string, validationErrors: any) {
    super(`Tool input validation failed: ${toolName}`, {
      context: { toolName, validationErrors },
    });
  }
}

/**
 * Permission-related errors
 */
export class PermissionError extends AppError {
  constructor(message: string, options?: { context?: Record<string, any> }) {
    super(message, { ...options, statusCode: 403 });
  }
}

export class PermissionDeniedError extends PermissionError {
  constructor(action: string, reason?: string) {
    super(`Permission denied: ${action}`, {
      context: { action, reason },
    });
  }
}

/**
 * Approval-related errors
 */
export class ApprovalError extends AppError {
  constructor(message: string, options?: { context?: Record<string, any>; statusCode?: number }) {
    super(message, { statusCode: 403, ...options });
  }
}

export class ApprovalDeniedError extends ApprovalError {
  constructor(reason?: string) {
    super('Approval was denied', { context: { reason } });
  }
}

export class ApprovalExpiredError extends ApprovalError {
  constructor(approvalId: string) {
    super('Approval request has expired', { context: { approvalId } });
  }
}

export class ApprovalPendingError extends ApprovalError {
  constructor(approvalId: string) {
    super('Waiting for approval', { context: { approvalId }, statusCode: 202 });
  }
}

/**
 * Workflow-related errors
 */
export class WorkflowError extends AppError {
  constructor(message: string, options?: { context?: Record<string, any>; cause?: Error }) {
    super(message, { ...options, statusCode: 400 });
  }
}

export class WorkflowStepError extends WorkflowError {
  constructor(stepId: string, cause: Error) {
    super(`Workflow step failed: ${stepId}`, {
      context: { stepId },
      cause,
    });
  }
}

/**
 * Agent-related errors
 */
export class AgentError extends AppError {
  constructor(
    message: string,
    options?: { context?: Record<string, any>; cause?: Error; statusCode?: number }
  ) {
    super(message, { statusCode: 400, ...options });
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, { context: { agentId }, statusCode: 404 });
  }
}

export class AgentExecutionError extends AgentError {
  constructor(agentId: string, cause: Error) {
    super(`Agent execution failed: ${agentId}`, {
      context: { agentId },
      cause,
    });
  }
}

/**
 * Authentication-related errors
 */
export class AuthError extends AppError {
  constructor(message: string, options?: { context?: Record<string, any> }) {
    super(message, { ...options, statusCode: 401 });
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password');
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super('Token has expired');
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, errors?: any) {
    super(message, {
      statusCode: 400,
      context: { validationErrors: errors },
    });
  }
}

/**
 * Database errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, {
      statusCode: 500,
      isOperational: false,
      cause,
    });
  }
}

/**
 * Integration errors
 */
export class IntegrationError extends AppError {
  constructor(
    service: string,
    message: string,
    options?: { context?: Record<string, any>; cause?: Error }
  ) {
    super(`Integration error (${service}): ${message}`, {
      ...options,
      statusCode: 502,
      context: { service, ...options?.context },
    });
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', {
      statusCode: 429,
      context: { retryAfter },
    });
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource} not found`, {
      statusCode: 404,
      context: { resource, id },
    });
  }
}

/**
 * Conflict errors
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, {
      statusCode: 409,
      context,
    });
  }
}
