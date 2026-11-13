import { EventEmitter } from 'events';
import { logger } from '@athena/shared';

/**
 * Serialized execution event, as broadcast to clients
 */
export interface ExecutionEventPayload {
  id: string;
  executionId: string;
  timestamp: string;
  type: string;
  tool?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  status: string;
  metadata?: Record<string, any>;
}

/**
 * External or internal event that can trigger workflows
 */
export interface TriggerEvent {
  /** Event name, e.g. "stripe.charge.failed" or "opsguard.service_down" */
  event: string;
  source: string;
  payload: Record<string, any>;
  /** Restrict to workflows owned by this user. Omit for system-wide events (e.g. Stripe webhooks). */
  userId?: string;
  /** Restrict to one workflow (used by per-workflow webhooks) */
  workflowId?: string;
}

export interface AthenaEvents {
  'execution.event': { userId: string; event: ExecutionEventPayload };
  'execution.status': {
    userId: string;
    executionId: string;
    agentId: string;
    status: string;
    error?: string;
  };
  'approval.requested': {
    userId: string;
    approvalId: string;
    executionId: string;
    tool: string;
  };
  'approval.decided': {
    userId: string;
    approvalId: string;
    executionId: string;
    status: 'approved' | 'rejected' | 'expired';
  };
  trigger: TriggerEvent;
}

type EventName = keyof AthenaEvents;
type Listener<K extends EventName> = (payload: AthenaEvents[K]) => void;

/**
 * Typed, in-process event bus. Listener errors are logged and never
 * propagate to the emitter, so a failing subscriber cannot break an execution.
 */
export class EventBus {
  private static instance: EventBus;
  private emitter = new EventEmitter();

  private constructor() {
    this.emitter.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emit<K extends EventName>(name: K, payload: AthenaEvents[K]): void {
    for (const listener of this.emitter.listeners(name)) {
      try {
        (listener as Listener<K>)(payload);
      } catch (error) {
        logger.error(`Event listener failed for ${name}`, error as Error);
      }
    }
  }

  on<K extends EventName>(name: K, listener: Listener<K>): () => void {
    this.emitter.on(name, listener);
    return () => this.emitter.off(name, listener);
  }

  once<K extends EventName>(name: K, listener: Listener<K>): () => void {
    this.emitter.once(name, listener);
    return () => this.emitter.off(name, listener);
  }
}

export const eventBus = EventBus.getInstance();
