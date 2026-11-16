import { AppError } from '@athena/shared';
import { LLMMessage, LLMToolCall } from '../llm/llm.types';

/**
 * A run is checkpointed after every model turn and tool call, so any process
 * can pick it up: after an approval, after a time slice ends, or after a crash.
 */

export interface PendingToolCalls {
  calls: LLMToolCall[];
  /** Next call to run */
  index: number;
  /** Model text that came with the calls, shown to approvers */
  reasoning: string;
  /** Approval the call at `index` is waiting for */
  approvalId?: string;
}

export interface AgentLoopState {
  task: string;
  system: string;
  messages: LLMMessage[];
  iteration: number;
  lastText: string;
  pending?: PendingToolCalls;
}

export interface WorkflowRunState {
  payload: Record<string, any>;
  scope: Record<string, any>;
  /** Step to run next; null once finished */
  currentStepId: string | null;
  stepRuns: number;
  lastSummary?: string;
  /** Progress inside the current step, when it was interrupted */
  step?: {
    started: boolean;
    agent?: AgentLoopState;
    approvalId?: string;
    callId?: string;
  };
}

export type RunState =
  | { version: 1; kind: 'agent'; agent: AgentLoopState }
  | { version: 1; kind: 'workflow'; workflow: WorkflowRunState };

export function serializeRunState(state: RunState): string {
  return JSON.stringify(state);
}

export function parseRunState(json: string | undefined | null): RunState {
  if (!json) {
    throw new AppError('This run has no saved state (it was started before runs became resumable)');
  }
  const state = JSON.parse(json) as RunState;
  if (state.version !== 1) throw new AppError(`Unsupported run state version ${String(state.version)}`);
  return state;
}

/**
 * Time budget for one invocation. Every slice does at least one unit of work
 * (a model turn, tool call, or workflow step) so a run always makes progress,
 * however short the slice.
 */
export class Budget {
  private readonly deadline: number;
  private didWork = false;
  constructor(sliceMs: number) {
    this.deadline = Date.now() + sliceMs;
  }
  /** Checked before each unit of work */
  hasTime(): boolean {
    return !this.didWork || Date.now() < this.deadline;
  }
  /** Record that a unit of work finished */
  worked(): void {
    this.didWork = true;
  }
}

/** Why a run stopped advancing without finishing */
export type Suspension = { suspended: 'approval'; approvalId: string } | { suspended: 'budget' };

export function isSuspension(value: unknown): value is Suspension {
  return typeof value === 'object' && value !== null && 'suspended' in value;
}
