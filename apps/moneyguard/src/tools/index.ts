import { z } from 'zod';
import { Tool } from '@athena/core';
import { formatAmount, sendNotificationTool, stripe } from '@athena/integrations';
import {
  fetchCharge,
  fetchCustomer,
  fetchCustomerCharges,
  summarizeCharge,
  StripeCharge,
} from '../stripe-data';
import { assessRisk } from '../risk-rules';
import { CaseModel } from '../models/case.model';

const chargeId = z
  .string()
  .regex(/^(ch|py)_[A-Za-z0-9]+$/, 'Expected a Stripe charge id (ch_...)')
  .describe('Stripe charge id, e.g. ch_3Pxyz...');
const customerId = z
  .string()
  .regex(/^cus_[A-Za-z0-9]+$/, 'Expected a Stripe customer id (cus_...)')
  .describe('Stripe customer id, e.g. cus_Q1abc...');

// ---------- Read tools ----------

const getTransactionInput = z.object({ chargeId });
export const getTransactionDetailsTool: Tool<z.infer<typeof getTransactionInput>> = {
  id: 'get_transaction_details',
  name: 'Get Transaction Details',
  description:
    'Fetch a Stripe charge: amount, status, failure reason, Radar risk outcome, card checks, billing country, refunds and disputes.',
  inputSchema: getTransactionInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ chargeId }) => {
    const charge = await fetchCharge(chargeId);
    return { success: true, data: summarizeCharge(charge) };
  },
};

const getCustomerInput = z.object({ customerId });
export const getCustomerProfileTool: Tool<z.infer<typeof getCustomerInput>> = {
  id: 'get_customer_profile',
  name: 'Get Customer Profile',
  description: 'Fetch a Stripe customer: account age, country, delinquency, balance, metadata.',
  inputSchema: getCustomerInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:customers'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ customerId }) => {
    const c = await fetchCustomer(customerId);
    const ageDays = Math.floor((Date.now() / 1000 - c.created) / 86400);
    return {
      success: true,
      data: {
        id: c.id,
        name: c.name,
        email: c.email,
        createdAt: new Date(c.created * 1000).toISOString(),
        accountAgeDays: ageDays,
        country: c.address?.country ?? null,
        delinquent: c.delinquent,
        balance: c.balance,
        currency: c.currency,
        metadata: c.metadata,
      },
    };
  },
};

const historyInput = z.object({
  customerId,
  limit: z.number().int().min(1).max(100).optional().describe('Max charges to return (default 25)'),
  sinceDays: z.number().int().min(1).max(365).optional().describe('Only charges from the last N days'),
});
export const searchTransactionHistoryTool: Tool<z.infer<typeof historyInput>> = {
  id: 'search_transaction_history',
  name: 'Search Transaction History',
  description:
    "List a customer's recent Stripe charges with aggregate stats (failures, disputes, refunds, card countries).",
  inputSchema: historyInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ customerId, limit, sinceDays }) => {
    const charges = await fetchCustomerCharges(customerId, limit ?? 25, sinceDays);
    const succeeded = charges.filter((c) => c.status === 'succeeded');
    const byCurrency: Record<string, number> = {};
    for (const c of succeeded) byCurrency[c.currency] = (byCurrency[c.currency] ?? 0) + c.amount;

    return {
      success: true,
      data: {
        count: charges.length,
        stats: {
          succeeded: succeeded.length,
          failed: charges.filter((c) => c.status === 'failed').length,
          disputed: charges.filter((c) => c.disputed).length,
          refunded: charges.filter((c) => c.refunded || c.amount_refunded > 0).length,
          totalSucceeded: Object.entries(byCurrency).map(([cur, amt]) => formatAmount(amt, cur)),
          cardCountries: Array.from(
            new Set(charges.map((c) => c.payment_method_details?.card?.country).filter(Boolean))
          ),
        },
        charges: charges.map((c) => ({
          id: c.id,
          amount: formatAmount(c.amount, c.currency),
          status: c.status,
          createdAt: new Date(c.created * 1000).toISOString(),
          failureCode: c.failure_code,
          riskLevel: c.outcome?.risk_level,
          disputed: c.disputed,
          refunded: c.refunded,
        })),
      },
    };
  },
};

const riskInput = z.object({ chargeId });
export const checkRiskRulesTool: Tool<z.infer<typeof riskInput>> = {
  id: 'check_risk_rules',
  name: 'Check Risk Rules',
  description:
    'Evaluate the MoneyGuard risk rules (amount, Radar, verification, velocity, disputes, account age) against a charge. Returns score 0-100, level, and evidence for each triggered rule.',
  inputSchema: riskInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions', 'read:customers'],
  requiresApproval: false,
  category: 'risk',
  handler: async ({ chargeId }) => {
    const charge = await fetchCharge(chargeId);
    let customer = null;
    let history: StripeCharge[] = [];
    if (charge.customer) {
      [customer, history] = await Promise.all([
        fetchCustomer(charge.customer),
        fetchCustomerCharges(charge.customer, 100, 90),
      ]);
    }
    return { success: true, data: assessRisk({ charge, customer, history }) };
  },
};

// ---------- Write tools ----------

const flagInput = z.object({
  chargeId,
  riskLevel: z.enum(['low', 'medium', 'high']).describe('Risk level you assessed'),
  reason: z.string().min(5).max(450).describe('Short explanation stored on the charge'),
});
export const flagTransactionTool: Tool<z.infer<typeof flagInput>> = {
  id: 'flag_transaction',
  name: 'Flag Transaction',
  description:
    'Mark a Stripe charge for review by writing MoneyGuard flag metadata to the charge. Requires human approval.',
  inputSchema: flagInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:transactions'],
  requiresApproval: true,
  category: 'payments',
  handler: async ({ chargeId, riskLevel, reason }, context) => {
    const updated = await stripe().post<StripeCharge>(
      `/v1/charges/${encodeURIComponent(chargeId)}`,
      {
        metadata: {
          moneyguard_flag: 'review',
          moneyguard_risk_level: riskLevel,
          moneyguard_reason: reason,
          moneyguard_execution: context.executionId,
          moneyguard_flagged_at: new Date().toISOString(),
        },
      },
      { form: true, idempotencyKey: `flag-${context.executionId}-${chargeId}` }
    );
    return { success: true, data: { chargeId: updated.id, metadata: updated.metadata } };
  },
};

const refundInput = z.object({
  chargeId,
  amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Amount in minor units (cents). Omit for a full refund.'),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).describe('Stripe refund reason'),
});
export const refundTransactionTool: Tool<z.infer<typeof refundInput>> = {
  id: 'refund_transaction',
  name: 'Refund Transaction',
  description:
    'Issue a Stripe refund for a charge. Moves money and cannot be undone. Always requires human approval.',
  inputSchema: refundInput,
  permissionLevel: 'high',
  requiredPermissions: ['write:refunds'],
  requiresApproval: true,
  category: 'payments',
  handler: async ({ chargeId, amount, reason }, context) => {
    const refund = await stripe().post<{
      id: string;
      amount: number;
      currency: string;
      status: string;
    }>(
      '/v1/refunds',
      {
        charge: chargeId,
        amount,
        reason,
        metadata: { moneyguard_execution: context.executionId },
      },
      // Idempotency key prevents a double refund if the request is retried
      { form: true, idempotencyKey: `refund-${context.executionId}-${chargeId}-${amount ?? 'full'}` }
    );
    return {
      success: true,
      data: {
        refundId: refund.id,
        amount: formatAmount(refund.amount, refund.currency),
        status: refund.status,
      },
    };
  },
};

const caseInput = z.object({
  chargeId,
  customerId: customerId.optional(),
  title: z.string().min(5).max(150),
  summary: z.string().min(20).max(4000).describe('Findings and evidence'),
  riskLevel: z.enum(['low', 'medium', 'high']),
  recommendedAction: z.string().min(3).max(500),
});
export const createCaseTool: Tool<z.infer<typeof caseInput>> = {
  id: 'create_case',
  name: 'Create Investigation Case',
  description: 'Open a MoneyGuard investigation case with your findings so the team can follow up.',
  inputSchema: caseInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:cases'],
  requiresApproval: false,
  category: 'cases',
  handler: async (input, context) => {
    const doc = await CaseModel.create({
      ...input,
      userId: context.userId,
      agentId: context.agentId,
      executionId: context.executionId,
      status: 'open',
    });
    return { success: true, data: { caseId: String(doc._id), status: doc.status } };
  },
};

export const moneyGuardTools: Tool[] = [
  getTransactionDetailsTool,
  getCustomerProfileTool,
  searchTransactionHistoryTool,
  checkRiskRulesTool,
  flagTransactionTool,
  refundTransactionTool,
  createCaseTool,
  sendNotificationTool,
];
