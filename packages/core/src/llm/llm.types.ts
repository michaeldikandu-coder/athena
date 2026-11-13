import { LLMProvider } from '@athena/shared';

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export type LLMMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: LLMToolCall[];
      /**
       * Raw provider content for this turn. Anthropic requires thinking blocks to be
       * sent back unchanged with tool results, so adapters replay this when present.
       */
      providerContent?: unknown;
      provider?: LLMProvider;
    }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string; isError?: boolean };

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool input */
  inputSchema: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  system: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  /** Visible assistant text */
  text: string;
  /** Reasoning summary, when the provider returns one */
  reasoning?: string;
  toolCalls: LLMToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';
  usage: { inputTokens: number; outputTokens: number };
  /** Raw content to replay in the next request (see LLMMessage.providerContent) */
  providerContent?: unknown;
}

export interface LLMClient {
  readonly provider: LLMProvider;
  chat(request: LLMRequest): Promise<LLMResponse>;
}
