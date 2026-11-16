import Groq from 'groq-sdk';
import { safeJsonParse } from '@athena/shared';
import { LLMClient, LLMMessage, LLMRequest, LLMResponse } from './llm.types';
import { providerError } from './provider-error';

type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;

function toGroqMessages(system: string, messages: LLMMessage[]): GroqMessage[] {
  const result: GroqMessage[] = [{ role: 'system', content: system }];

  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      const toolCalls = message.toolCalls ?? [];
      const assistant: Groq.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: message.content || null,
      };
      if (toolCalls.length > 0) {
        assistant.tool_calls = toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        }));
      }
      result.push(assistant);
    } else {
      result.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.isError ? `ERROR: ${message.content}` : message.content,
      });
    }
  }

  return result;
}

/**
 * Groq checks generated tool arguments against the JSON Schema and fails the
 * whole request when they do not match. Value constraints (formats, lengths,
 * patterns, ranges) are removed here; types, enums and required fields stay.
 * Athena validates every tool input with Zod itself and returns readable
 * errors to the model, which can then correct the call.
 */
const RELAXED_KEYWORDS = new Set([
  'format', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems',
]);

function relaxSchema(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => relaxSchema(v));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      // Keys inside "properties" are field names, not keywords
      .filter(([key, v]) => parentKey === 'properties' || !(RELAXED_KEYWORDS.has(key) && typeof v !== 'object'))
      .map(([key, v]) => [key, relaxSchema(v, key)])
  );
}

/** Groq answers 400 "tool_use_failed" when the model produced an invalid tool call */
function isToolUseFailure(error: unknown): boolean {
  const err = error as { status?: number; error?: { error?: { code?: string } }; message?: string };
  return err.status === 400 && (err.error?.error?.code === 'tool_use_failed' || /tool call validation failed|tool_use_failed/i.test(err.message ?? ''));
}

const TOOL_RETRIES = 2;

/**
 * Groq adapter (OpenAI-compatible chat completions with function calling)
 */
export class GroqClient implements LLMClient {
  readonly provider = 'groq' as const;
  private client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey, maxRetries: 3, timeout: 120000 });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const tools = request.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: relaxSchema(tool.inputSchema) as Record<string, unknown>,
      },
    }));

    const create = () =>
      this.client.chat.completions.create({
        model: request.model,
        messages: toGroqMessages(request.system, request.messages),
        max_tokens: request.maxTokens ?? 8192,
        temperature: request.temperature,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
      });

    let response: Awaited<ReturnType<typeof create>> | undefined;
    for (let attempt = 0; !response; attempt++) {
      try {
        response = await create();
      } catch (error) {
        // A malformed tool call is a sampling accident; asking again usually works
        if (isToolUseFailure(error) && attempt < TOOL_RETRIES) continue;
        throw providerError('Groq', error);
      }
    }

    const choice = response.choices[0];
    const message = choice?.message;
    const toolCalls = (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      input: safeJsonParse<Record<string, any>>(call.function.arguments || '{}', {}),
    }));

    const finish = choice?.finish_reason;
    const stopReason: LLMResponse['stopReason'] =
      toolCalls.length > 0 || finish === 'tool_calls'
        ? 'tool_use'
        : finish === 'stop'
          ? 'end_turn'
          : finish === 'length'
            ? 'max_tokens'
            : 'other';

    return {
      text: message?.content ?? '',
      reasoning: message?.reasoning ?? undefined,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
