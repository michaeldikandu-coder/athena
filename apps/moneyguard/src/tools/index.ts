import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Tool } from '@athena/core';
import { bachs, BachsCustomer, BachsRefund, formatMoney, sendNotificationTool } from '@athena/integrations';
import {
  fetchCustomer,
  fetchDispute,
  fetchPayment,
  fetchPaymentsByEmail,
  fetchRecentDisputes,
  fetchRefundForCharge,
  findCustomerByEmail,
  summarizeListItem,
  summarizePayment,
} from '../bachs-data';
import { assessRisk } from '../risk-rules';
import { CaseModel } from '../models/case.model';

// Bachs ids carry resource prefixes (ch_, cust_, dsp_ ...); accept any safe id
const chargeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,100}$/, 'Expected a Bachs charge id such as ch_1a2b3c4d5e6f')
  .describe('Bachs charge id of the payment, e.g. ch_1a2b3c4d5e6f');
const email = z.string().email().max(200).describe('Customer email address');
const customerId = z
  .string()
  .regex(/^cust_[A-Za-z0-9]+$/, 'Expected a Bachs customer id (cust_...)')
  .describe('Bachs customer id, e.g. cust_1a2b3c4d5e6f');
const decimal = z
  .string()
  .regex(/^\d+(\.\d{1,8})?$/, 'Use a decimal string such as "2500.00"');

// ---------- Read tools ----------

const getPaymentInput = z.object({ chargeId });
export const getTransactionDetailsTool: Tool<z.infer<typeof getPaymentInput>> = {
  id: 'get_transaction_details',
  connections: ['bachs'],
  name: 'Get Payment Details',
  description:
    'Fetch a Bachs payment by charge id: amount and currency (decimal strings), status, status history with failure reasons, payment method, payer details (card or bank-transfer sender), customer name/email, fees, refunds.',
  inputSchema: getPaymentInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ chargeId }) => ({ success: true, data: summarizePayment(await fetchPayment(chargeId)) }),
};

const getCustomerInput = z
  .object({ email: email.optional(), customerId: customerId.optional() })
  .refine((v) => v.email || v.customerId, 'Provide email or customerId');
function summarizeCustomer(c: BachsCustomer) {
  return {
    customerId: c.customer_id,
    name: c.name ?? null,
    email: c.email,
    createdAt: c.created_at,
    accountAgeDays: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000),
    country: c.billing_address?.country ?? null,
    city: c.billing_address?.city ?? null,
    hasPhone: Boolean(c.phone_number),
    metadata: c.metadata ?? {},
  };
}
export const getCustomerProfileTool: Tool<z.infer<typeof getCustomerInput>> = {
  id: 'get_customer_profile',
  connections: ['bachs'],
  name: 'Get Customer Profile',
  description:
    'Look up a Bachs customer by email (as shown on the payment) or customer id: account age, billing country, metadata including any previous MoneyGuard flag.',
  inputSchema: getCustomerInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:customers'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ email: e, customerId: id }) => {
    const customer = id ? await fetchCustomer(id) : await findCustomerByEmail(e!);
    if (!customer) {
      return { success: true, data: { found: false, note: 'No Bachs customer record (guest checkout payments have none).' } };
    }
    return { success: true, data: { found: true, ...summarizeCustomer(customer) } };
  },
};

const historyInput = z.object({
  email,
  sinceDays: z.number().int().min(1).max(365).optional().describe('Only payments from the last N days (default 90)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max payments to return (default 30)'),
});
export const searchTransactionHistoryTool: Tool<z.infer<typeof historyInput>> = {
  id: 'search_transaction_history',
  connections: ['bachs'],
  name: 'Search Payment History',
  description:
    "List a customer's recent Bachs payments (matched by email) with counts of failed, refunded, and underpaid payments and totals per currency.",
  inputSchema: historyInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ email: e, sinceDays, limit }) => {
    const { payments, scanned, complete } = await fetchPaymentsByEmail(e, { sinceDays: sinceDays ?? 90, limit: limit ?? 30 });
    const totals: Record<string, number> = {};
    for (const p of payments.filter((x) => x.status === 'succeeded')) {
      totals[p.currency] = (totals[p.currency] ?? 0) + Number(p.amount || 0);
    }
    return {
      success: true,
      data: {
        email: e,
        count: payments.length,
        stats: {
          succeeded: payments.filter((p) => p.status === 'succeeded').length,
          failed: payments.filter((p) => ['failed', 'expired', 'cancelled'].includes(p.status)).length,
          refunded: payments.filter((p) => p.status.includes('refunded')).length,
          underOrOverpaid: payments.filter((p) => ['underpaid', 'overpaid', 'accepted'].includes(p.status)).length,
          totalSucceeded: Object.entries(totals).map(([cur, amt]) => formatMoney(amt.toFixed(2), cur)),
        },
        payments: payments.map(summarizeListItem),
        coverage: complete
          ? `complete for the window (${scanned} account payments scanned)`
          : `partial: scanned the ${scanned} most recent account payments`,
      },
    };
  },
};

const disputesInput = z.object({
  chargeId: chargeId.optional().describe('Only disputes on this charge'),
  disputeId: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/).optional().describe('Fetch one dispute by id'),
});
export const getDisputesTool: Tool<z.infer<typeof disputesInput>> = {
  id: 'get_disputes',
  connections: ['bachs'],
  name: 'Get Disputes',
  description:
    'Fetch chargeback disputes from Bachs: one by id, those on a charge, or the most recent on the account. Includes status, reason, and response deadline.',
  inputSchema: disputesInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:disputes'],
  requiresApproval: false,
  category: 'payments',
  handler: async ({ chargeId: charge, disputeId }) => {
    if (disputeId) return { success: true, data: [await fetchDispute(disputeId)] };
    const disputes = await fetchRecentDisputes(100);
    const filtered = charge ? disputes.filter((d) => d.charge_id === charge) : disputes.slice(0, 20);
    return {
      success: true,
      data: filtered.map((d) => ({
        disputeId: d.dispute_id,
        chargeId: d.charge_id,
        amount: formatMoney(d.amount, d.currency),
        status: d.status,
        reason: d.reason ?? null,
        responseDeadline: d.response_deadline_at ?? null,
        canRespond: d.is_response_editable ?? null,
        createdAt: d.created_at ?? null,
      })),
    };
  },
};

const riskInput = z.object({ chargeId });
export const checkRiskRulesTool: Tool<z.infer<typeof riskInput>> = {
  id: 'check_risk_rules',
  connections: ['bachs'],
  name: 'Check Risk Rules',
  description:
    'Evaluate the MoneyGuard risk rules against a Bachs payment: amount vs per-currency threshold, failure reasons, attempts, payer/customer name match, velocity, prior disputes and refunds, account age, previous flags. Returns score 0-100, level, evidence per triggered rule, and rules skipped for missing data.',
  inputSchema: riskInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:transactions', 'read:customers', 'read:disputes'],
  requiresApproval: false,
  category: 'risk',
  handler: async ({ chargeId }) => {
    const payment = await fetchPayment(chargeId);
    const customerEmail = payment.customer?.email;
    const [customer, historyResult, disputes] = await Promise.all([
      customerEmail ? findCustomerByEmail(customerEmail) : Promise.resolve(null),
      customerEmail
        ? fetchPaymentsByEmail(customerEmail, { sinceDays: 90, limit: 100 })
        : Promise.resolve({ payments: [], scanned: 0, complete: true }),
      fetchRecentDisputes(100),
    ]);
    return {
      success: true,
      data: assessRisk({
        payment,
        customer,
        history: historyResult.payments,
        historyComplete: historyResult.complete,
        disputes,
      }),
    };
  },
};

// ---------- Write tools ----------

const flagInput = z.object({
  customerId,
  riskLevel: z.enum(['medium', 'high']).describe('Risk level you assessed'),
  reason: z.string().min(5).max(300).describe('Short explanation stored on the customer'),
  chargeId: chargeId.optional().describe('The payment that prompted the flag'),
});
export const flagCustomerTool: Tool<z.infer<typeof flagInput>> = {
  id: 'flag_customer',
  connections: ['bachs'],
  name: 'Flag Customer',
  description:
    'Mark a Bachs customer as risky by writing MoneyGuard flag fields to the customer metadata, so future payments and investigations see it. Existing metadata is kept. Requires human approval.',
  inputSchema: flagInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:customers'],
  requiresApproval: true,
  category: 'payments',
  handler: async ({ customerId: id, riskLevel, reason, chargeId: charge }, context) => {
    // PATCH replaces metadata, so merge with what is already stored
    const current = await fetchCustomer(id);
    const metadata = {
      ...(current.metadata ?? {}),
      moneyguard_risk: riskLevel,
      moneyguard_reason: reason,
      moneyguard_charge: charge ?? null,
      moneyguard_execution: context.executionId,
      moneyguard_flagged_at: new Date().toISOString(),
    };
    const updated = await bachs().patch<BachsCustomer>(
      `/v1/customers/${encodeURIComponent(id)}`,
      { metadata },
      { idempotencyKey: `flag-${context.executionId}-${id}` }
    );
    return { success: true, data: { customerId: updated.customer_id, metadata: updated.metadata } };
  },
};

const refundInput = z.object({
  chargeId,
  amount: decimal
    .optional()
    .describe('Partial refund in the settlement currency as a decimal string. Omit for the full refundable balance.'),
  reason: z.string().min(3).max(500).describe('Why the refund is issued'),
});
export const refundTransactionTool: Tool<z.infer<typeof refundInput>> = {
  id: 'refund_transaction',
  connections: ['bachs'],
  name: 'Refund Payment',
  description:
    'Refund a completed Bachs payment. Moves money back to the customer and cannot be undone once it succeeds. Bachs allows one refund per charge. Always requires human approval.',
  inputSchema: refundInput,
  permissionLevel: 'high',
  requiredPermissions: ['write:refunds'],
  requiresApproval: true,
  category: 'payments',
  handler: async ({ chargeId: charge, amount, reason }, context) => {
    const existing = await fetchRefundForCharge(charge);
    if (existing && existing.status !== 'failed') {
      return {
        success: false,
        error: `Charge already has a refund ${existing.refund_id} with status ${existing.status}`,
      };
    }
    const payment = await fetchPayment(charge);
    if (payment.is_refundable === false) {
      return { success: false, error: `Payment ${charge} is not refundable (status ${payment.status})` };
    }

    // Stable per execution and charge, so a retried request cannot refund twice
    const idempotencyKey = `mg-${context.executionId}-${charge}`;
    const refund = await bachs().post<BachsRefund>(
      '/v1/refunds',
      {
        charge_id: charge,
        reference: `mg_${context.executionId.slice(-12)}_${randomUUID().slice(0, 8)}`,
        amount,
        reason,
        idempotency_key: idempotencyKey,
      },
      { idempotencyKey }
    );
    return {
      success: true,
      data: {
        refundId: refund.refund_id,
        status: refund.status,
        requested: formatMoney(refund.requested_amount, payment.currency),
        refunded: refund.refunded_amount ?? null,
        fee: refund.refund_fee_amount ?? null,
        note: refund.status === 'processing' ? 'Accepted; the final outcome arrives as refund.paid or refund.failed.' : undefined,
      },
    };
  },
};

const caseInput = z.object({
  chargeId,
  // Models often send "" when they have no email; treat that as not given
  customerEmail: z.union([email, z.literal('').transform(() => undefined)]).optional(),
  disputeId: z.string().max(100).optional(),
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
  getDisputesTool,
  checkRiskRulesTool,
  flagCustomerTool,
  refundTransactionTool,
  createCaseTool,
  sendNotificationTool,
];
