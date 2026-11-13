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
  env: [
    {
      name: 'OPSGUARD_SERVICES',
      description: 'JSON list of services to monitor: [{"name":"api","url":"https://.../health"}]',
    },
    { name: 'GITHUB_TOKEN', description: 'GitHub token with Issues and Actions access' },
    { name: 'GITHUB_REPO', description: 'Repository for incidents and CI/CD, e.g. acme/shop' },
    {
      name: 'GITHUB_WEBHOOK_SECRET',
      description: 'Secret for the GitHub webhook endpoint',
      optional: true,
    },
    { name: 'OPSGUARD_LOG_FILES', description: 'JSON map of log source name to file path', optional: true },
    { name: 'BACHS_API_KEY', description: 'Bachs key, for order and checkout investigation', optional: true },
    { name: 'SLACK_WEBHOOK_URL', description: 'Slack incoming webhook for notifications', optional: true },
  ],
};

export { opsGuardTools } from './tools';
export { getServices } from './config/services';
export { checkHealth } from './health';
