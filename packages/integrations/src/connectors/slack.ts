import axios from 'axios';
import { z } from 'zod';
import { AppError, IntegrationError } from '@athena/shared';
import { Tool } from '@athena/core';

/**
 * Post a message to Slack through an incoming webhook (SLACK_WEBHOOK_URL).
 */
export async function postSlackMessage(text: string, blocks?: unknown[]): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new AppError('SLACK_WEBHOOK_URL is not configured', { statusCode: 503 });

  const response = await axios.post(url, { text, ...(blocks ? { blocks } : {}) }, {
    timeout: 10000,
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new IntegrationError('slack', `Webhook returned ${response.status}: ${String(response.data).slice(0, 200)}`);
  }
}

const sendNotificationInput = z.object({
  title: z.string().min(1).max(150).describe('Short headline'),
  message: z.string().min(1).max(3000).describe('Body of the notification (Slack markdown allowed)'),
  severity: z.enum(['info', 'warning', 'critical']).describe('How urgent this is'),
  link: z.string().url().optional().describe('Optional link to more detail'),
});

const SEVERITY_EMOJI = { info: ':information_source:', warning: ':warning:', critical: ':rotating_light:' };

/**
 * Shared notification tool. Both MoneyGuard and OpsGuard use this exact tool,
 * which shows that tools are reusable across applications.
 */
export const sendNotificationTool: Tool<z.infer<typeof sendNotificationInput>> = {
  id: 'send_notification',
  name: 'Send Team Notification',
  description:
    'Send a notification to the team Slack channel. Use for findings that need human attention.',
  inputSchema: sendNotificationInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:notifications'],
  requiresApproval: false,
  category: 'communication',
  handler: async (input, context) => {
    const header = `${SEVERITY_EMOJI[input.severity]} *${input.title}*`;
    const footer = `_Sent by Athena agent · execution ${context.executionId}_`;
    const text = [header, input.message, input.link ? `<${input.link}|Details>` : '', footer]
      .filter(Boolean)
      .join('\n');
    await postSlackMessage(text);
    return { success: true, data: { delivered: true, channel: 'slack', severity: input.severity } };
  },
};
