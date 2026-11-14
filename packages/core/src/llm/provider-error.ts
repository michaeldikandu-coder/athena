import { AppError } from '@athena/shared';

/**
 * Turn an Anthropic or Groq SDK error into one readable sentence, e.g.
 * "Anthropic rejected the request (400): Your credit balance is too low ..."
 */
export function providerError(provider: 'Anthropic' | 'Groq', error: unknown): AppError {
  const err = error as { status?: number; error?: unknown; message?: string; name?: string };
  let detail: string | undefined;

  const body = err.error as { error?: { message?: string }; message?: string } | undefined;
  if (body && typeof body === 'object') {
    detail = body.error?.message ?? body.message;
  }
  if (!detail && typeof err.message === 'string') {
    // SDK messages look like: 400 {"type":"error","error":{"message":"..."}}
    const match = err.message.match(/\{.*\}/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        detail = parsed?.error?.message ?? parsed?.message;
      } catch {
        // keep the raw message below
      }
    }
    detail = detail ?? err.message;
  }

  const status = typeof err.status === 'number' ? err.status : undefined;
  let hint = '';
  if (status === 401) hint = ` Check the ${provider === 'Anthropic' ? 'ANTHROPIC_API_KEY' : 'GROQ_API_KEY'} value.`;
  if (status === 404) hint = ` Check the model name (${provider === 'Anthropic' ? 'ANTHROPIC_MODEL' : 'GROQ_MODEL'} or the agent’s model).`;
  if (status === 429) hint = ' The provider is rate limiting this key; try again shortly.';

  const message = `${provider} rejected the request${status ? ` (${status})` : ''}: ${detail ?? 'unknown error'}.${hint}`
    .replace(/\.\./g, '.');
  return new AppError(message, { statusCode: 502, cause: error instanceof Error ? error : undefined });
}
