export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelConfig: { provider: 'anthropic' | 'groq'; model: string; temperature?: number; maxTokens?: number };
  permissions: string[];
  application: string | null;
  maxIterations: number;
  status: 'active' | 'inactive' | 'error';
  tools: string[];
  createdAt: string;
}

export interface AgentDetail extends Agent {
  missingConnections: Array<{ provider: ConnectionProvider; label: string; tools: string[] }>;
  stats: { executions: number };
  memories: Array<{ id: string; type: string; content: string; createdAt: string }>;
}

export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  permissionLevel: 'low' | 'medium' | 'high';
  requiredPermissions: string[];
  requiresApproval: boolean;
  category?: string;
  connections?: ConnectionProvider[];
  usedBy: string[];
}

export interface Execution {
  id: string;
  agentId: string;
  agentName: string | null;
  workflowId: string | null;
  application: string | null;
  task: string | null;
  trigger: { type: string; source: string; payload: Record<string, any> };
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  result: { summary?: string; incomplete?: boolean; steps?: Record<string, unknown> } | null;
  iterations: number;
  toolCallCount: number;
  usage: { inputTokens: number; outputTokens: number };
}

export interface TimelineEvent {
  id: string;
  executionId: string;
  timestamp: string;
  type:
    | 'agent_reasoning'
    | 'tool_call'
    | 'tool_result'
    | 'approval_request'
    | 'approval_decision'
    | 'error'
    | 'status_change';
  tool?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  status: 'success' | 'failure' | 'pending';
  metadata?: Record<string, any>;
}

export interface Approval {
  id: string;
  executionId: string;
  agentId: string;
  agentName?: string | null;
  task?: string | null;
  application?: string | null;
  requestedAction: { tool: string; input: Record<string, any>; reason: string };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewerComment: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  expiresAt: string;
}

export interface ExecutionDetail extends Execution {
  timeline: TimelineEvent[];
  approvals: Approval[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  agentId: string;
  application: string | null;
  trigger: { type: 'event' | 'webhook' | 'schedule' | 'manual'; config: Record<string, any> };
  steps: Array<{ id: string; type: string; config: Record<string, any>; nextSteps?: string[] }>;
  status: 'active' | 'inactive';
  lastRunAt: string | null;
  webhook?: { url: string; secret: string };
}

export interface Application {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tools: string[];
  workflows: Array<{ key: string; name: string; description: string; trigger: Workflow['trigger'] }>;
  connections: Array<{ provider: ConnectionProvider; label: string; description: string; optional?: boolean; connected: boolean }>;
  env: Array<{ name: string; description: string; optional?: boolean; configured: boolean }>;
  ready: boolean;
  installed: boolean;
  agentId: string | null;
}

export interface Stats {
  windowDays: number;
  byStatus: Partial<Record<ExecutionStatus, number>>;
  byApplication: Array<{ application: string; executions: number; toolCalls: number }>;
  pendingApprovals: number;
  activeExecutions: number;
}

export type ConnectionProvider = 'bachs' | 'github' | 'slack' | 'services';

export interface MonitoredService {
  name: string;
  url: string;
  expectStatus?: number;
  timeoutMs?: number;
}

export interface Connection {
  provider: ConnectionProvider;
  label: string;
  connected: boolean;
  status: 'connected' | 'error' | 'not_connected';
  hints: Record<string, string>;
  config: {
    environment?: 'sandbox' | 'production';
    repo?: string;
    canWrite?: boolean;
    services?: MonitoredService[];
  };
  lastVerifiedAt: string | null;
  lastError: string | null;
  lastWebhookAt: string | null;
  updatedAt: string | null;
  webhook: { url: string; events: string[]; secret?: string; secretConfigured?: boolean } | null;
}

export interface ConnectionsResponse {
  connections: Connection[];
  server: { privateUrlsAllowed: boolean; apiUrl: string };
}
