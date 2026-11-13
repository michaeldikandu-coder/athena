import { LLMProvider, ExecutionStatus } from '@athena/shared';

/**
 * Model configuration
 */
export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  tools: string[]; // Tool IDs
  permissions: string[];
  userId: string;
}

/**
 * Agent execution request
 */
export interface AgentExecutionRequest {
  agentId: string;
  task: string;
  context?: Record<string, any>;
  workflowId?: string;
  userId: string;
}

/**
 * Agent execution state
 */
export interface AgentExecutionState {
  executionId: string;
  agentId: string;
  status: ExecutionStatus;
  currentStep?: string;
  toolCalls: number;
  startedAt: Date;
  lastActivity: Date;
  error?: string;
}

/**
 * Agent message
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: AgentToolCall[];
  toolResults?: AgentToolResult[];
}

/**
 * Agent tool call
 */
export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Agent tool result
 */
export interface AgentToolResult {
  toolCallId: string;
  output: any;
  error?: string;
}

/**
 * Agent reasoning step
 */
export interface ReasoningStep {
  thought: string;
  action?: string;
  actionInput?: Record<string, any>;
  observation?: string;
}
