import { AppError, LLMProvider } from '@athena/shared';
import { AnthropicClient } from './anthropic-client';
import { GroqClient } from './groq-client';
import { LLMClient } from './llm.types';

/**
 * Default model per provider. Override with ANTHROPIC_MODEL / GROQ_MODEL,
 * or per agent through modelConfig.model.
 */
export function defaultModel(provider: LLMProvider): string {
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  }
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}

export function defaultProvider(): LLMProvider {
  const configured = process.env.LLM_PROVIDER;
  if (configured === 'anthropic' || configured === 'groq') return configured;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'groq';
}

const clients = new Map<LLMProvider, LLMClient>();

/**
 * Return a cached client for the provider. API keys come from the environment
 * and are never stored in the database.
 */
export function getLLMClient(provider: LLMProvider): LLMClient {
  const cached = clients.get(provider);
  if (cached) return cached;

  let client: LLMClient;
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AppError('ANTHROPIC_API_KEY is not configured', { statusCode: 500 });
    client = new AnthropicClient(key);
  } else if (provider === 'groq') {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new AppError('GROQ_API_KEY is not configured', { statusCode: 500 });
    client = new GroqClient(key);
  } else {
    throw new AppError(`Unsupported LLM provider: ${String(provider)}`, { statusCode: 400 });
  }

  clients.set(provider, client);
  return client;
}

/**
 * Allow tests or embedding apps to inject a client implementation
 */
export function setLLMClient(provider: LLMProvider, client: LLMClient): void {
  clients.set(provider, client);
}
