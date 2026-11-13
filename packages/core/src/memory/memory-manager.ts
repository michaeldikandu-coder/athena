import { MemoryModel, IMemory } from '@athena/database';
import { MemoryType, logger } from '@athena/shared';

export interface StoreMemoryInput {
  agentId: string;
  executionId?: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, any>;
  /** Time to live; omitted means the memory persists */
  ttlMs?: number;
}

export interface RetrieveMemoryInput {
  agentId: string;
  types?: MemoryType[];
  executionId?: string;
  /** Exact-match filters on metadata keys, e.g. { customerId: "cus_123" } */
  metadata?: Record<string, string | number | boolean>;
  /** Case-insensitive substring search on content */
  search?: string;
  limit?: number;
}

const MAX_LIMIT = 50;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Memory Manager - persists agent memories in MongoDB.
 * Expired memories are removed by the TTL index on expiresAt.
 */
export class MemoryManager {
  private static instance: MemoryManager;

  private constructor() {}

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  async store(input: StoreMemoryInput): Promise<IMemory & { _id: unknown }> {
    const doc = await MemoryModel.create({
      agentId: input.agentId,
      executionId: input.executionId,
      type: input.type,
      content: input.content,
      metadata: input.metadata,
      expiresAt: input.ttlMs ? new Date(Date.now() + input.ttlMs) : undefined,
    });
    logger.debug('Memory stored', { agentId: input.agentId, type: input.type });
    return doc.toObject();
  }

  async retrieve(input: RetrieveMemoryInput): Promise<Array<IMemory & { _id: unknown }>> {
    const query: Record<string, any> = { agentId: input.agentId };

    if (input.types?.length) query.type = { $in: input.types };
    if (input.executionId) query.executionId = input.executionId;
    if (input.search) query.content = { $regex: escapeRegex(input.search), $options: 'i' };
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        if (!/^[a-zA-Z0-9_]+$/.test(key)) continue; // prevent operator injection via keys
        query[`metadata.${key}`] = value;
      }
    }
    // Exclude expired memories that the TTL monitor has not yet removed
    query.$or = [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }];

    return MemoryModel.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(input.limit ?? 10, MAX_LIMIT))
      .lean();
  }

  /**
   * Build a prompt section summarizing what the agent remembers
   */
  async buildContext(agentId: string, limit = 10): Promise<string> {
    const memories = await this.retrieve({
      agentId,
      types: ['fact', 'decision'],
      limit,
    });
    if (memories.length === 0) return '';

    const lines = memories
      .reverse()
      .map((m) => `- [${m.type}, ${new Date(m.createdAt).toISOString()}] ${m.content}`);
    return `Relevant memory from previous executions (oldest first):\n${lines.join('\n')}`;
  }

  async clearAgent(agentId: string): Promise<number> {
    const result = await MemoryModel.deleteMany({ agentId });
    return result.deletedCount;
  }
}

export const memoryManager = MemoryManager.getInstance();
