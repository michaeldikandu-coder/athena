import { z } from 'zod';
import { Tool } from '../types/tool.types';
import { memoryManager } from './memory-manager';

const rememberInput = z.object({
  content: z.string().min(1).max(2000).describe('The fact to remember, written as a full sentence'),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_:.-]{1,100}$/)
    .optional()
    .describe('Optional lookup key, such as a customer id or service name'),
});

const recallInput = z.object({
  search: z.string().max(200).optional().describe('Text to search for in stored memories'),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_:.-]{1,100}$/)
    .optional()
    .describe('Lookup key used when the memory was stored'),
  limit: z.number().int().min(1).max(20).optional().describe('Maximum results (default 10)'),
});

/**
 * Built-in tools available to every Athena agent
 */
export const rememberFactTool: Tool<z.infer<typeof rememberInput>> = {
  id: 'remember_fact',
  name: 'Remember Fact',
  description:
    'Store a fact in long-term memory so future executions of this agent can use it. ' +
    'Use for durable findings, such as "Customer cus_123 had two disputed charges in May".',
  inputSchema: rememberInput,
  permissionLevel: 'low',
  requiredPermissions: ['write:memory'],
  requiresApproval: false,
  category: 'memory',
  handler: async (input, context) => {
    const memory = await memoryManager.store({
      agentId: context.agentId,
      executionId: context.executionId,
      type: 'fact',
      content: input.content,
      metadata: input.key ? { key: input.key } : undefined,
    });
    return { success: true, data: { id: String(memory._id), stored: true } };
  },
};

export const recallMemoryTool: Tool<z.infer<typeof recallInput>> = {
  id: 'recall_memory',
  name: 'Recall Memory',
  description:
    'Search long-term memory for facts and decisions from previous executions of this agent.',
  inputSchema: recallInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:memory'],
  requiresApproval: false,
  category: 'memory',
  handler: async (input, context) => {
    const memories = await memoryManager.retrieve({
      agentId: context.agentId,
      types: ['fact', 'decision'],
      search: input.search,
      metadata: input.key ? { key: input.key } : undefined,
      limit: input.limit ?? 10,
    });
    return {
      success: true,
      data: memories.map((m) => ({
        type: m.type,
        content: m.content,
        key: m.metadata?.key,
        createdAt: m.createdAt,
      })),
    };
  },
};

export const builtInTools: Tool[] = [rememberFactTool, recallMemoryTool];
