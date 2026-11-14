import { AthenaApplication } from '@athena/core';
import { opsGuardTools } from './tools';
import { opsGuardAgent } from './config/agent';
import { opsGuardWorkflows } from './workflows';

export const opsGuardApp: AthenaApplication = {
  id: 'opsguard',
  name: 'OpsGuard',
  tagline: 'Business operations agent',
  description:
    'Monitors services, deployments, and orders. Diagnoses incidents across systems, opens and updates tickets, notifies the team, and retries deployments after approval.',
  tools: opsGuardTools,
  agent: opsGuardAgent,
  workflows: opsGuardWorkflows,
  connections: [
    { provider: 'services', description: 'The health-check URLs OpsGuard watches' },
    {
      provider: 'github',
      description: 'A token and repository for CI/CD runs and incident issues. Add the webhook to react to failed runs.',
    },
    { provider: 'bachs', description: 'Your Bachs key, to investigate abandoned checkouts and orders', optional: true },
    { provider: 'slack', description: 'Incoming webhook so the agent can notify your team', optional: true },
  ],
  env: [
    {
      name: 'OPSGUARD_LOG_FILES',
      description: 'Server setting: JSON map of log source name to a file on the Athena server',
      optional: true,
    },
  ],
};

export { opsGuardTools } from './tools';
export { getServices, serviceSchema, servicesListSchema } from './config/services';
export type { ServiceConfig } from './config/services';
export { checkHealth, isPrivateAddress, privateUrlsAllowed } from './health';
