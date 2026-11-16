import axios from 'axios';
import { z, ZodTypeAny } from 'zod';
import { CustomToolModel, ICustomTool } from '@athena/database';
import { AppError, decryptSecret, truncate } from '@athena/shared';
import { Tool } from '@athena/core';
import { assertPublicUrl, guardedAgents } from '../net/safe-http';

/**
 * User-defined HTTP tools. A user describes one API call in the dashboard
 * (method, URL with {placeholders}, inputs, headers, an optional secret
 * header); the agent fills in the inputs and Athena sends the request.
 *
 * Safety: requests go only to public addresses in production, never follow
 * redirects, time out after 15 s, and read at most 1 MB. A tool only runs for
 * its owner. Tools that change data (POST, PUT, PATCH, DELETE) need the
 * write:http permission and ask for approval unless the owner turns it off.
 */

export const CUSTOM_TOOL_PREFIX = 'custom_';
const MAX_RESPONSE_CHARS = 8000;
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]{0,40})\}/g;

/** Registry id for a new tool: readable slug plus a random suffix */
export function customToolId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'tool';
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${CUSTOM_TOOL_PREFIX}${slug}_${suffix}`;
}

function inputSchemaFor(doc: Pick<ICustomTool, 'inputs'>): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const input of doc.inputs) {
    let field: ZodTypeAny =
      input.type === 'number' ? z.number() : input.type === 'boolean' ? z.boolean() : z.string().max(2000);
    if (input.description) field = field.describe(input.description);
    shape[input.name] = input.required ? field : field.optional();
  }
  return z.object(shape);
}

function readsOnly(method: ICustomTool['method']): boolean {
  return method === 'GET';
}

/**
 * Send the request for one call. Inputs named in the URL fill the
 * placeholders; the rest go to the query string (GET, DELETE) or the JSON body.
 */
export async function sendCustomRequest(
  doc: ICustomTool,
  input: Record<string, unknown>,
  secret: string | null
): Promise<{ status: number; ok: boolean; body: unknown; url: string }> {
  const used = new Set<string>();
  const url = doc.url.replace(PLACEHOLDER, (_m, name: string) => {
    used.add(name);
    const value = input[name];
    if (value === undefined || value === null || value === '') {
      throw new AppError(`Input "${name}" is needed to build the URL`, { statusCode: 400 });
    }
    return encodeURIComponent(String(value));
  });
  const rest = Object.fromEntries(Object.entries(input).filter(([k, v]) => !used.has(k) && v !== undefined));
  const withBody = doc.method === 'POST' || doc.method === 'PUT' || doc.method === 'PATCH';

  assertPublicUrl(url);
  const headers: Record<string, string> = { 'User-Agent': 'athena-agent/1.0', Accept: 'application/json, text/plain, */*', ...doc.headers };
  if (doc.secretHeaderName && secret) headers[doc.secretHeaderName] = secret;
  if (withBody) headers['Content-Type'] = 'application/json';

  const response = await axios.request({
    method: doc.method,
    url,
    params: withBody ? undefined : rest,
    data: withBody ? rest : undefined,
    headers,
    timeout: 15000,
    maxRedirects: 0,
    maxContentLength: 1024 * 1024,
    responseType: 'text',
    transformResponse: (data) => data,
    validateStatus: () => true,
    ...guardedAgents,
    proxy: false,
  });

  let body: unknown = response.data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = truncate(response.data as string, MAX_RESPONSE_CHARS);
    }
  }
  const serialized = JSON.stringify(body ?? null);
  if (serialized.length > MAX_RESPONSE_CHARS) body = { truncated: true, preview: truncate(serialized, MAX_RESPONSE_CHARS) };
  return { status: response.status, ok: response.status >= 200 && response.status < 300, body, url: url.split('?')[0] };
}

async function loadSecret(toolId: string, userId: string): Promise<{ doc: ICustomTool; secret: string | null }> {
  const doc = (await CustomToolModel.findOne({ toolId, userId }).select('+secretEncrypted').lean()) as ICustomTool | null;
  if (!doc) throw new AppError('This custom tool does not belong to this account or was deleted', { statusCode: 404 });
  return { doc, secret: doc.secretEncrypted ? decryptSecret(doc.secretEncrypted) : null };
}

/** Turn a stored definition into a runtime tool */
export function buildCustomTool(doc: ICustomTool): Tool {
  const reads = readsOnly(doc.method);
  return {
    id: doc.toolId,
    name: doc.name,
    description: `${doc.description} (${doc.method} ${new URL(doc.url.replace(PLACEHOLDER, 'x')).host})`,
    inputSchema: inputSchemaFor(doc),
    permissionLevel: reads ? 'low' : 'medium',
    requiredPermissions: [reads ? 'read:http' : 'write:http'],
    requiresApproval: doc.requiresApproval,
    category: 'custom',
    metadata: { owner: doc.userId, method: doc.method },
    handler: async (input, context) => {
      // Always the latest definition, and only for the tool's owner
      const { doc: current, secret } = await loadSecret(doc.toolId, context.userId);
      const result = await sendCustomRequest(current, input as Record<string, unknown>, secret);
      return {
        success: result.ok,
        data: { status: result.status, body: result.body },
        ...(result.ok ? {} : { error: `${current.method} ${result.url} returned HTTP ${result.status}` }),
      };
    },
  };
}

/** Definitions for some of a user's tool ids, as runtime tools */
export async function loadCustomTools(userId: string, toolIds?: string[]): Promise<Tool[]> {
  const query: Record<string, unknown> = { userId };
  if (toolIds) query.toolId = { $in: toolIds.filter((id) => id.startsWith(CUSTOM_TOOL_PREFIX)) };
  const docs = (await CustomToolModel.find(query).lean()) as ICustomTool[];
  return docs.map(buildCustomTool);
}
