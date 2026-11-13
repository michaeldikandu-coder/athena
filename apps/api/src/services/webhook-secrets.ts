import { hmacSha256Hex } from '@athena/integrations';
import { config } from '../config';

/**
 * Each workflow gets its own webhook signing secret, derived from the server
 * secret so nothing extra has to be stored. Rotating WEBHOOK_SIGNING_SECRET
 * rotates every workflow secret.
 */
export function workflowWebhookSecret(workflowId: string): string {
  return hmacSha256Hex(config.webhookSigningSecret, `workflow:${workflowId}`);
}

export function workflowWebhookUrl(workflowId: string): string {
  return `${config.publicUrl.replace(/\/$/, '')}/api/webhooks/workflows/${workflowId}`;
}
