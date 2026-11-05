import { z } from 'zod';
import { tndSchema } from './commerce/contracts.js';
import { parseTnd } from './domain.js';
import { requireRule } from './commerce/domain.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const reason = z.string().trim().min(2).max(2000);
const amount = tndSchema.refine((value) => parseTnd(value) > 0n, 'Amount must be positive.');
export const depositRecordSchema = z
  .object({
    amountTnd: amount,
    paymentReference: z.string().trim().min(2).max(200),
    paymentDate: z.iso.datetime({ offset: true }),
    evidence: reason,
    provenance: z.enum(['SYNTHETIC', 'PENDING_VERIFICATION']),
  })
  .strict();
export const depositReviewSchema = z
  .object({ decision: z.enum(['REJECTED', 'DISPUTED', 'PENDING_VERIFICATION']), reason })
  .strict();
export const payoutRequestSchema = z.object({ payableId: id, amountTnd: amount, reason }).strict();
export const financeReasonSchema = z.object({ reason }).strict();
export const payoutExecutionSchema = z
  .object({
    amountTnd: amount,
    reference: z.string().trim().min(2).max(200),
    evidence: reason,
    occurredAt: z.iso.datetime({ offset: true }),
    outcome: z.enum(['REPORTED', 'FAILED']),
  })
  .strict();
export const paymentDisputeSchema = z
  .object({
    batchId: id,
    payableId: id.optional(),
    amountTnd: amount,
    reason,
    description: reason,
    evidence: reason,
  })
  .strict();
export const disputeReviewSchema = z
  .object({
    status: z.enum([
      'UNDER_REVIEW',
      'AWAITING_EVIDENCE',
      'PROPOSED_RESOLUTION',
      'RESOLVED',
      'CLOSED',
    ]),
    reason,
  })
  .strict();
export const adjustmentProposalSchema = z
  .object({
    amountTnd: amount,
    kind: z.enum(['CANCELLATION', 'PARTIAL_FULFILLMENT', 'REFUND']),
    direction: z.enum(['INCREASE', 'DECREASE', 'REVIEW_ONLY']).default('REVIEW_ONLY'),
    evidence: reason.optional(),
    reason,
  })
  .strict();
export function assertPayoutCapacity(payable: bigint, committed: bigint, requested: bigint) {
  requireRule(
    requested > 0n && committed + requested <= payable,
    'PAYOUT_EXCEEDS_OUTSTANDING',
    'The payout exceeds the eligible outstanding payable.',
  );
}
export function assertIndependentApproval(makerId: string, checkerId: string) {
  requireRule(
    makerId !== checkerId,
    'SELF_APPROVAL_DENIED',
    'An independent reviewer must approve this request.',
  );
}
export function assertDisputeTransition(from: string, to: string, ownClaim: boolean) {
  const edges: Record<string, string[]> = {
    OPEN: ['UNDER_REVIEW', 'AWAITING_EVIDENCE'],
    UNDER_REVIEW: ['AWAITING_EVIDENCE', 'PROPOSED_RESOLUTION'],
    AWAITING_EVIDENCE: ['UNDER_REVIEW', 'PROPOSED_RESOLUTION'],
    PROPOSED_RESOLUTION: ['UNDER_REVIEW', 'RESOLVED'],
    RESOLVED: ['CLOSED'],
  };
  requireRule(
    Boolean(edges[from]?.includes(to)),
    'INVALID_TRANSITION',
    'This dispute transition is not allowed.',
  );
  requireRule(
    !['RESOLVED', 'CLOSED'].includes(to) || ownClaim,
    'CLAIMANT_CONFIRMATION_REQUIRED',
    'Only the authenticated claimant can accept or close a proposed resolution.',
  );
}
