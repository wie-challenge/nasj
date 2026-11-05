import { MAX_TND_MILLIMES } from '../domain.js';

export class CommerceRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new CommerceRuleError(code, message);
}
export const rfqStates = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;
export const offerStates = [
  'PLANNED',
  'PREPARED',
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;
export const batchStates = [
  'ACCEPTED',
  'MATERIAL_READY',
  'IN_PROGRESS',
  'SUBMITTED',
  'INSPECTION',
  'APPROVED',
  'REWORK_REQUESTED',
  'DISPUTED',
  'COMPLETED',
] as const;
export const paymentStates = [
  'SCHEDULED',
  'APPROVED',
  'INITIATED',
  'SETTLED',
  'FAILED',
  'CANCELLED',
  'DISPUTED',
] as const;
export const orderStates = [
  'APPROVED',
  'FUNDING_CONFIRMED',
  'PLANNING',
  'IN_PRODUCTION',
  'QUALITY_REVIEW',
  'READY_TO_SHIP',
  'IN_TRANSIT',
  'DELIVERED',
  'BUYER_ACCEPTED',
  'SETTLED',
  'CLOSED',
  'DISPUTED',
  'CANCELLED',
  'AMENDED',
] as const;
export type RfqState = (typeof rfqStates)[number];
export type OfferState = (typeof offerStates)[number];
export type BatchState = (typeof batchStates)[number];
export type PaymentState = (typeof paymentStates)[number];
export type OrderState = (typeof orderStates)[number];
export type CommerceRole =
  | 'BUYER'
  | 'ARTISAN'
  | 'PRODUCTION_MANAGER'
  | 'QUALITY_INSPECTOR'
  | 'FINANCE_MANAGER'
  | 'INVENTORY_LOGISTICS_COORDINATOR';
type Edge<S extends string> = readonly [S, S, readonly CommerceRole[]];
export const rfqEdges: readonly Edge<RfqState>[] = [
  ['DRAFT', 'SUBMITTED', ['BUYER']],
  ['SUBMITTED', 'UNDER_REVIEW', ['PRODUCTION_MANAGER']],
  ['UNDER_REVIEW', 'QUOTED', ['FINANCE_MANAGER']],
  ['QUOTED', 'ACCEPTED', ['BUYER']],
  ['QUOTED', 'DECLINED', ['BUYER']],
  ['QUOTED', 'EXPIRED', ['FINANCE_MANAGER']],
];
export const offerEdges: readonly Edge<OfferState>[] = [
  ['PLANNED', 'OFFERED', ['PRODUCTION_MANAGER']],
  ['PREPARED', 'OFFERED', ['PRODUCTION_MANAGER']],
  ['OFFERED', 'ACCEPTED', ['ARTISAN']],
  ['OFFERED', 'DECLINED', ['ARTISAN']],
  ['OFFERED', 'EXPIRED', ['PRODUCTION_MANAGER']],
];
export const batchEdges: readonly Edge<BatchState>[] = [
  ['ACCEPTED', 'MATERIAL_READY', ['PRODUCTION_MANAGER']],
  ['MATERIAL_READY', 'IN_PROGRESS', ['ARTISAN']],
  ['IN_PROGRESS', 'SUBMITTED', ['ARTISAN']],
  ['SUBMITTED', 'INSPECTION', ['QUALITY_INSPECTOR']],
  ['INSPECTION', 'APPROVED', ['QUALITY_INSPECTOR']],
  ['INSPECTION', 'REWORK_REQUESTED', ['QUALITY_INSPECTOR']],
  ['INSPECTION', 'DISPUTED', ['ARTISAN', 'QUALITY_INSPECTOR']],
  ['REWORK_REQUESTED', 'IN_PROGRESS', ['ARTISAN']],
  ['REWORK_REQUESTED', 'DISPUTED', ['ARTISAN']],
  ['APPROVED', 'COMPLETED', ['PRODUCTION_MANAGER']],
];
export const paymentEdges: readonly Edge<PaymentState>[] = [
  ['SCHEDULED', 'APPROVED', ['FINANCE_MANAGER']],
  ['APPROVED', 'INITIATED', ['FINANCE_MANAGER']],
  ['INITIATED', 'SETTLED', ['FINANCE_MANAGER']],
  ['INITIATED', 'FAILED', ['FINANCE_MANAGER']],
  ['SCHEDULED', 'CANCELLED', ['FINANCE_MANAGER']],
  ['APPROVED', 'CANCELLED', ['FINANCE_MANAGER']],
  ['INITIATED', 'DISPUTED', ['FINANCE_MANAGER']],
];
export const orderEdges: readonly Edge<OrderState>[] = [
  ['APPROVED', 'FUNDING_CONFIRMED', ['FINANCE_MANAGER']],
  ['FUNDING_CONFIRMED', 'PLANNING', ['PRODUCTION_MANAGER']],
  ['PLANNING', 'IN_PRODUCTION', ['PRODUCTION_MANAGER']],
  ['IN_PRODUCTION', 'QUALITY_REVIEW', ['PRODUCTION_MANAGER']],
  ['QUALITY_REVIEW', 'READY_TO_SHIP', ['QUALITY_INSPECTOR']],
  ['READY_TO_SHIP', 'IN_TRANSIT', ['INVENTORY_LOGISTICS_COORDINATOR']],
  ['IN_TRANSIT', 'DELIVERED', ['INVENTORY_LOGISTICS_COORDINATOR']],
  ['DELIVERED', 'BUYER_ACCEPTED', ['BUYER']],
  ['BUYER_ACCEPTED', 'SETTLED', ['FINANCE_MANAGER']],
  ['SETTLED', 'CLOSED', ['FINANCE_MANAGER']],
  ['APPROVED', 'CANCELLED', ['BUYER']],
  ['IN_PRODUCTION', 'DISPUTED', ['PRODUCTION_MANAGER']],
  ['QUALITY_REVIEW', 'DISPUTED', ['QUALITY_INSPECTOR']],
  ['DELIVERED', 'DISPUTED', ['BUYER']],
];
function transition<S extends string>(
  current: S,
  next: S,
  roles: readonly CommerceRole[],
  edges: readonly Edge<S>[],
): S {
  const edge = edges.find(([from, to]) => from === current && to === next);
  requireRule(edge, 'INVALID_TRANSITION', 'This action is unavailable in the current state.');
  requireRule(
    edge[2].some((role) => roles.includes(role)),
    'FORBIDDEN',
    'Your current resource role cannot perform this action.',
  );
  return next;
}
export function transitionRfq(
  current: RfqState,
  next: RfqState,
  roles: readonly CommerceRole[],
  context: { quoteValid?: boolean; quoteExpired?: boolean } = {},
) {
  transition(current, next, roles, rfqEdges);
  if (next === 'ACCEPTED')
    requireRule(context.quoteValid, 'QUOTE_UNAVAILABLE', 'Accept the current unexpired quote.');
  if (next === 'EXPIRED')
    requireRule(context.quoteExpired, 'NOT_EXPIRED', 'The quote has not expired.');
  return next;
}
export function transitionOffer(
  current: OfferState,
  next: OfferState,
  roles: readonly CommerceRole[],
  context: { expiresAt: number; now: number },
) {
  transition(current, next, roles, offerEdges);
  requireRule(
    Number.isFinite(context.now) && Number.isFinite(context.expiresAt),
    'INVALID_DATE',
    'Valid offer timestamps are required.',
  );
  if (next === 'ACCEPTED')
    requireRule(context.now < context.expiresAt, 'OFFER_EXPIRED', 'This offer has expired.');
  if (next === 'EXPIRED')
    requireRule(context.now >= context.expiresAt, 'NOT_EXPIRED', 'This offer has not expired.');
  return next;
}
export function quantity(value: number, positive = false): number {
  requireRule(
    Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= 1000000,
    'INVALID_QUANTITY',
    'Use whole quantities between zero and one million.',
  );
  return value;
}
export type Fulfillment = {
  requested: number;
  reserved: number;
  allocated: number;
  produced: number;
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  delivered: number;
};
export function reconcileFulfillment(q: Fulfillment): void {
  quantity(q.requested, true);
  for (const name of [
    'requested',
    'reserved',
    'allocated',
    'produced',
    'submitted',
    'approved',
    'rejected',
    'pending',
    'delivered',
  ] as const) {
    const value = q[name];
    quantity(value);
    requireRule(value <= q.requested, 'EXCESS_QUANTITY', `${name} exceeds requested quantity.`);
  }
  requireRule(
    q.allocated + q.reserved <= q.requested,
    'EXCESS_ALLOCATION',
    'Accepted and reserved quantities exceed this order.',
  );
  requireRule(
    q.produced <= q.allocated && q.submitted <= q.produced,
    'EXCESS_PRODUCTION',
    'Production cannot exceed accepted assignments.',
  );
  requireRule(
    q.approved + q.rejected + q.pending === q.submitted,
    'QA_MISMATCH',
    'Approved, rejected and pending quantities must equal submitted quantity.',
  );
  requireRule(
    q.delivered <= q.approved,
    'UNAPPROVED_DELIVERY',
    'Only QA-approved units may be delivered.',
  );
}
export function validateProgress(assigned: number, previous: number, cumulative: number) {
  quantity(assigned, true);
  quantity(previous);
  quantity(cumulative);
  requireRule(
    previous <= cumulative && cumulative <= assigned,
    'EXCESS_PRODUCTION',
    'Cumulative production must not decrease or exceed the accepted quantity.',
  );
}
export function reconcileInspection(
  submitted: number,
  approved: number,
  rejected: number,
  pending: number,
  previousApproved = 0,
) {
  for (const value of [submitted, approved, rejected, pending, previousApproved]) quantity(value);
  requireRule(
    approved + rejected + pending === submitted && approved >= previousApproved,
    'QA_MISMATCH',
    'QA totals must reconcile to submitted units and preserve previous approvals.',
  );
}
export function payableForUnits(unitMillimes: bigint, units: number): bigint {
  quantity(units);
  requireRule(
    unitMillimes >= 0n && unitMillimes <= MAX_TND_MILLIMES,
    'INVALID_AMOUNT',
    'Invalid TND unit amount.',
  );
  const total = unitMillimes * BigInt(units);
  requireRule(
    total <= MAX_TND_MILLIMES,
    'AMOUNT_OVERFLOW',
    'The total exceeds the supported TND limit.',
  );
  return total;
}
export function reconcileSettlement(
  eligible: bigint,
  settled: bigint,
  reserved: bigint,
  additional: bigint = 0n,
) {
  for (const value of [eligible, settled, reserved, additional])
    requireRule(
      value >= 0n && value <= MAX_TND_MILLIMES,
      'INVALID_AMOUNT',
      'Invalid settlement amount.',
    );
  requireRule(
    settled + reserved + additional <= eligible,
    'EXCESS_SETTLEMENT',
    'Payment exceeds the eligible outstanding amount.',
  );
}
export function transitionBatch(
  current: BatchState,
  next: BatchState,
  roles: readonly CommerceRole[],
  context: {
    assigned: number;
    produced: number;
    approved: number;
    pending: number;
    reworkAccepted?: boolean;
  },
) {
  transition(current, next, roles, batchEdges);
  validateProgress(context.assigned, 0, context.produced);
  quantity(context.approved);
  quantity(context.pending);
  requireRule(
    context.approved + context.pending <= context.produced,
    'QA_MISMATCH',
    'Quality counts cannot exceed produced units.',
  );
  if (next === 'SUBMITTED')
    requireRule(context.produced > 0, 'EMPTY_SUBMISSION', 'Produce units before submitting.');
  if (next === 'APPROVED' || next === 'COMPLETED')
    requireRule(
      context.approved === context.assigned && context.pending === 0,
      'QUALITY_REQUIRED',
      'All assigned units must be QA-approved.',
    );
  if (current === 'REWORK_REQUESTED' && next === 'IN_PROGRESS')
    requireRule(
      context.reworkAccepted,
      'CONSENT_REQUIRED',
      'The artisan must explicitly accept rework under the agreed terms.',
    );
  return next;
}
export function transitionPayment(
  current: PaymentState,
  next: PaymentState,
  roles: readonly CommerceRole[],
  context: { provenance: 'SYNTHETIC'; evidenceType?: 'SIMULATED_SETTLEMENT' },
) {
  transition(current, next, roles, paymentEdges);
  requireRule(
    context.provenance === 'SYNTHETIC',
    'LIVE_PAYMENT_FORBIDDEN',
    'Only isolated synthetic payments are supported.',
  );
  if (next === 'SETTLED')
    requireRule(
      context.evidenceType === 'SIMULATED_SETTLEMENT',
      'EVIDENCE_REQUIRED',
      'Synthetic settlement must be explicitly labelled as simulated.',
    );
  return next;
}
export type OrderContext = Fulfillment & {
  buyerDue: bigint;
  buyerSettled: bigint;
  artisanDue: bigint;
  artisanSettled: bigint;
  openDisputes: number;
  pendingPayments: number;
  materialsResolved: boolean;
};
export function transitionOrder(
  current: OrderState,
  next: OrderState,
  roles: readonly CommerceRole[],
  context: OrderContext,
) {
  transition(current, next, roles, orderEdges);
  quantity(context.openDisputes);
  quantity(context.pendingPayments);
  reconcileFulfillment(context);
  reconcileSettlement(context.buyerDue, context.buyerSettled, 0n);
  reconcileSettlement(context.artisanDue, context.artisanSettled, 0n);
  if (next === 'CANCELLED')
    requireRule(
      context.allocated === 0 &&
        context.reserved === 0 &&
        context.buyerSettled === 0n &&
        context.artisanDue === 0n &&
        context.pendingPayments === 0,
      'OBLIGATIONS_REMAIN',
      'Cancellation cannot erase accepted work or financial obligations.',
    );
  if (next === 'FUNDING_CONFIRMED')
    requireRule(
      context.buyerSettled === context.buyerDue,
      'FUNDING_REQUIRED',
      'Reconcile full simulated buyer funding first.',
    );
  if (next === 'IN_PRODUCTION')
    requireRule(
      context.allocated === context.requested && context.reserved === 0,
      'ALLOCATION_REQUIRED',
      'All requested units need explicit accepted assignments.',
    );
  if (next === 'QUALITY_REVIEW')
    requireRule(
      context.submitted === context.requested,
      'SUBMISSION_REQUIRED',
      'Submit all requested units before quality review.',
    );
  if (
    ['READY_TO_SHIP', 'IN_TRANSIT', 'DELIVERED', 'BUYER_ACCEPTED', 'SETTLED', 'CLOSED'].includes(
      next,
    )
  )
    requireRule(
      context.approved === context.requested && context.rejected === 0 && context.pending === 0,
      'QUALITY_REQUIRED',
      'Full QA approval is required.',
    );
  if (['BUYER_ACCEPTED', 'SETTLED', 'CLOSED'].includes(next))
    requireRule(
      context.delivered === context.requested,
      'DELIVERY_REQUIRED',
      'Reconcile delivered quantity first.',
    );
  if (next === 'SETTLED' || next === 'CLOSED')
    requireRule(
      context.buyerSettled === context.buyerDue &&
        context.artisanSettled === context.artisanDue &&
        context.openDisputes === 0 &&
        context.pendingPayments === 0,
      'OBLIGATIONS_REMAIN',
      'Outstanding balances and disputes block settlement/closure.',
    );
  if (next === 'CLOSED')
    requireRule(
      context.materialsResolved,
      'MATERIALS_UNRESOLVED',
      'Record the synthetic material disposition before closure.',
    );
  return next;
}
