import Anthropic from '@anthropic-ai/sdk';
import { LLMClient, LLMMessage, LLMRequest, LLMResponse } from './llm.types';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;

/**
 * Convert provider-neutral messages to Anthropic format.
 * - Assistant turns produced by Anthropic are replayed verbatim (thinking blocks
 *   must come back unchanged alongside tool results).
 * - Tool results go in a user message; consecutive results are merged.
 */
function toAnthropicMessages(messages: LLMMessage[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      if (message.provider === 'anthropic' && Array.isArray(message.providerContent)) {
        result.push({
          role: 'assistant',
          content: message.providerContent as ContentBlockParam[],
        });
        continue;
      }
      const blocks: ContentBlockParam[] = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      if (blocks.length === 0) blocks.push({ type: 'text', text: '(no content)' });
      result.push({ role: 'assistant', content: blocks });
      continue;
    }

    const block: Anthropic.Messages.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: message.toolCallId,
      content: message.content,
      is_error: message.isError,
    };
    const last = result[result.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      (last.content as ContentBlockParam[]).push(block);
    } else {
      result.push({ role: 'user', content: [block] });
    }
  }

  return result;
}

/**
 * Anthropic Claude adapter.
 *
 * Current Claude 5.x models reject `temperature`, so it is not sent. Adaptive
 * thinking with summarized display is enabled by default so the execution
 * timeline can show the agent's reasoning; set ANTHROPIC_THINKING=off for
 * models that do not support adaptive thinking.
 */
export class AnthropicClient implements LLMClient {
  readonly provider = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 180000 });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const thinkingEnabled = (process.env.ANTHROPIC_THINKING || 'adaptive') !== 'off';
    const effort = (process.env.ANTHROPIC_EFFORT || 'medium') as
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh'
      | 'max';

    const response = await this.client.messages.create({
      model: request.model,
      system: request.system,
      max_tokens: request.maxTokens ?? 16000,
      messages: toAnthropicMessages(request.messages),
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
      })),
      ...(thinkingEnabled
        ? {
            thinking: { type: 'adaptive' as const, display: 'summarized' as const },
            output_config: { effort },
          }
        : {}),
    });

    let text = '';
    let reasoning = '';
    const toolCalls: LLMResponse['toolCalls'] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'thinking') {
        if (block.thinking) reasoning += (reasoning ? '\n' : '') + block.thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, any>,
        });
      }
    }

    let stopReason: LLMResponse['stopReason'] = 'other';
    switch (response.stop_reason) {
      case 'tool_use':
        stopReason = 'tool_use';
        break;
      case 'end_turn':
      case 'stop_sequence':
        stopReason = 'end_turn';
        break;
      case 'max_tokens':
      case 'model_context_window_exceeded':
        stopReason = 'max_tokens';
        break;
      case 'refusal':
        stopReason = 'refusal';
        break;
    }

    return {
      text,
      reasoning: reasoning || undefined,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      // Replay exactly what the API returned, including signed thinking blocks
      providerContent: response.content,
    };
  }
}
