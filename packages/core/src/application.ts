import { CONNECTION_LABELS, ConflictError, ConnectionProvider, NotFoundError, logger } from '@athena/shared';
import { Tool } from './types/tool.types';
import { toolRegistry } from './tools/tool-registry';
import { builtInTools } from './memory/memory-tools';

/**
 * Agent definition an application installs for a user
 */
export interface AgentTemplate {
  name: string;
  description: string;
  systemPrompt: string;
  permissions: string[];
  /** Tool ids to assign. Built-in memory tools are added automatically when permitted. */
  tools: string[];
  maxIterations?: number;
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  trigger: { type: 'event' | 'webhook' | 'schedule' | 'manual'; config: Record<string, any> };
  steps: Array<{
    id: string;
    type: 'agent_task' | 'tool_call' | 'approval' | 'condition';
    config: Record<string, any>;
    nextSteps?: string[];
  }>;
}

/** Server-level setting the operator configures in the environment */
export interface EnvRequirement {
  name: string;
  description: string;
  optional?: boolean;
}

/** Service each user connects from the dashboard (Settings > Connections) */
export interface ConnectionRequirement {
  provider: ConnectionProvider;
  description: string;
  optional?: boolean;
}

/**
 * The contract every Athena application implements. An application is only
 * configuration plus tools: it never contains its own execution logic.
 */
export interface AthenaApplication {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Tools contributed by the application (may be shared with other applications) */
  tools: Tool[];
  agent: AgentTemplate;
  workflows: WorkflowTemplate[];
  /** Per-user services the application uses */
  connections: ConnectionRequirement[];
  /** Optional server-level settings (operator only) */
  env: EnvRequirement[];
}

export interface ApplicationStatus {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tools: string[];
  workflows: Array<Pick<WorkflowTemplate, 'key' | 'name' | 'description' | 'trigger'>>;
  connections: Array<ConnectionRequirement & { label: string; connected: boolean }>;
  env: Array<EnvRequirement & { configured: boolean }>;
  ready: boolean;
}

const applications = new Map<string, AthenaApplication>();
let builtInsRegistered = false;

/**
 * Register built-in tools once
 */
export function registerBuiltInTools(): void {
  if (builtInsRegistered) return;
  toolRegistry.registerMany(builtInTools);
  builtInsRegistered = true;
}

/**
 * Register an application and its tools. Tools shared between applications
 * (same object, same id) are registered once.
 */
export function registerApplication(app: AthenaApplication): void {
  if (applications.has(app.id)) {
    throw new ConflictError(`Application already registered: ${app.id}`);
  }
  registerBuiltInTools();

  for (const tool of app.tools) {
    if (toolRegistry.has(tool.id)) {
      if (toolRegistry.get(tool.id) !== tool) {
        throw new ConflictError(`Tool id collision: ${tool.id}`, { application: app.id });
      }
      continue;
    }
    toolRegistry.register(tool);
  }

  for (const toolId of app.agent.tools) {
    if (!toolRegistry.has(toolId)) {
      throw new NotFoundError(`Tool "${toolId}" used by application ${app.id}`);
    }
  }

  applications.set(app.id, app);
  logger.info(`Application registered: ${app.id}`, { tools: app.tools.length });
}

export function getApplication(id: string): AthenaApplication {
  const app = applications.get(id);
  if (!app) throw new NotFoundError('Application', id);
  return app;
}

export function listApplications(): AthenaApplication[] {
  return Array.from(applications.values());
}

/**
 * Describe an application for one user. `connected` lists the providers that
 * user has connected; readiness depends on them, not on server env.
 */
export function describeApplication(
  app: AthenaApplication,
  connected: ReadonlySet<ConnectionProvider> = new Set()
): ApplicationStatus {
  const env = app.env.map((e) => ({ ...e, configured: Boolean(process.env[e.name]) }));
  const connections = app.connections.map((c) => ({
    ...c,
    label: CONNECTION_LABELS[c.provider],
    connected: connected.has(c.provider),
  }));
  return {
    id: app.id,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    tools: app.tools.map((t) => t.id),
    workflows: app.workflows.map(({ key, name, description, trigger }) => ({
      key,
      name,
      description,
      trigger,
    })),
    connections,
    env,
    ready: connections.every((c) => c.optional || c.connected) && env.every((e) => e.optional || e.configured),
  };
}
