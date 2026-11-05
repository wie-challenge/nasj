import { z } from 'zod';
import { DIRECTORY_COHORT_MINIMUM } from './directory.js';
import { formatTnd } from './domain.js';
import { requireRule, quantity } from './commerce/domain.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const count = z.number().int().min(0).max(1_000_000);
const positive = z.number().int().min(1).max(1_000_000);
const note = z.string().trim().max(240).default('');
const when = z.iso.datetime();

export const shipmentStatuses = [
  'PICKUP_SCHEDULED',
  'COLLECTED',
  'IN_TRANSIT',
  'DELIVERY_REPORTED',
  'BUYER_CONFIRMED',
  'DISCREPANCY',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];
const shippedStatuses: readonly ShipmentStatus[] = [
  'IN_TRANSIT',
  'DELIVERY_REPORTED',
  'BUYER_CONFIRMED',
  'DISCREPANCY',
];
export function countsAsShipped(status: string) {
  return shippedStatuses.includes(status as ShipmentStatus);
}
export function fulfillmentStage(
  statuses: string[],
):
  | 'NOT_STARTED'
  | 'PICKUP_SCHEDULED'
  | 'IN_TRANSIT'
  | 'DELIVERY_REPORTED'
  | 'BUYER_CONFIRMED'
  | 'DISCREPANCY' {
  if (statuses.includes('DISCREPANCY')) return 'DISCREPANCY';
  if (statuses.includes('DELIVERY_REPORTED')) return 'DELIVERY_REPORTED';
  if (statuses.includes('IN_TRANSIT')) return 'IN_TRANSIT';
  if (statuses.includes('BUYER_CONFIRMED')) return 'BUYER_CONFIRMED';
  if (statuses.includes('COLLECTED') || statuses.includes('PICKUP_SCHEDULED'))
    return 'PICKUP_SCHEDULED';
  return 'NOT_STARTED';
}
export function assertShipmentEdge(from: ShipmentStatus, to: ShipmentStatus) {
  const allowed: Record<ShipmentStatus, ShipmentStatus[]> = {
    PICKUP_SCHEDULED: ['COLLECTED', 'CANCELLED'],
    COLLECTED: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERY_REPORTED'],
    DELIVERY_REPORTED: ['BUYER_CONFIRMED', 'DISCREPANCY'],
    BUYER_CONFIRMED: [],
    DISCREPANCY: [],
    CANCELLED: [],
  };
  requireRule(
    allowed[from].includes(to),
    'INVALID_TRANSITION',
    'That shipment change is not allowed from the current milestone.',
  );
}

export function allocatePieces(parts: { id: string; quantity: number }[], accepted: number) {
  for (const part of parts) quantity(part.quantity, true);
  quantity(accepted);
  const total = parts.reduce((sum, part) => sum + part.quantity, 0);
  requireRule(
    accepted <= total,
    'EXCESS_RECEIPT',
    'Accepted pieces cannot exceed the shipped pieces.',
  );
  if (total === 0) return parts.map((part) => ({ id: part.id, pieces: 0 }));
  const rows = parts.map((part) => {
    const product = accepted * part.quantity;
    return { ...part, pieces: Math.floor(product / total), remainder: product % total };
  });
  let left = accepted - rows.reduce((sum, row) => sum + row.pieces, 0);
  for (const row of [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
  )) {
    if (left <= 0) break;
    if (row.pieces < row.quantity) {
      row.pieces += 1;
      left -= 1;
    }
  }
  requireRule(left === 0, 'EXCESS_RECEIPT', 'Accepted pieces could not be allocated.');
  return rows.map((row) => ({ id: row.id, pieces: row.pieces }));
}

export type ProducerShareAvailability =
  | 'AVAILABLE'
  | 'UNAVAILABLE_SMALL_GROUP'
  | 'UNAVAILABLE_DENOMINATOR';
export function agreedProducerShare(input: {
  compensationMillimes: bigint;
  quotationMillimes: bigint;
  refundMillimes: bigint;
  artisanCount: number;
}) {
  requireRule(
    input.refundMillimes >= 0n && input.refundMillimes <= input.quotationMillimes,
    'INVALID_QUANTITY',
    'A refund cannot exceed the quotation.',
  );
  const denominator = input.quotationMillimes - input.refundMillimes;
  const base = {
    basis: 'AGREED_NOT_PAID' as const,
    numeratorMillimes: input.compensationMillimes,
    denominatorMillimes: denominator,
    cohortMinimum: DIRECTORY_COHORT_MINIMUM,
  };
  if (input.artisanCount < DIRECTORY_COHORT_MINIMUM)
    return { ...base, availability: 'UNAVAILABLE_SMALL_GROUP' as const, basisPoints: null };
  if (denominator <= 0n)
    return { ...base, availability: 'UNAVAILABLE_DENOMINATOR' as const, basisPoints: null };
  const scaled = input.compensationMillimes * 10_000n;
  const basisPoints = scaled / denominator + (2n * (scaled % denominator) >= denominator ? 1n : 0n);
  requireRule(
    basisPoints <= 100_000n,
    'INVALID_QUANTITY',
    'The producer share is outside the supported range.',
  );
  return { ...base, availability: 'AVAILABLE' as const, basisPoints: Number(basisPoints) };
}
export function formatShare(basisPoints: number | null) {
  if (basisPoints === null) return null;
  return `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, '0')}%`;
}
export function formatMillimes(value: bigint) {
  return formatTnd(value);
}
export function plannedContribution(revenueMillimes: bigint, costMillimes: bigint) {
  if (costMillimes > revenueMillimes) return { status: 'UNAVAILABLE' as const, millimes: null };
  return { status: 'PLANNED' as const, millimes: revenueMillimes - costMillimes };
}
/**
 * The delivery report states how many pieces the operator handed over at the destination. It is not
 * the shipped quantity. A short report used to redefine "reported", which let the buyer's receipt
 * reconcile against the short figure and made the shortfall disappear: shipped 100, reported 80,
 * received 80, missing 0 read as a clean delivery. Conservation therefore reconciles against the
 * shipped quantity, and any unexplained difference is an explicit shortage that cannot be netted out.
 */
export function buyerReceipt(input: {
  shipped: number;
  reported: number;
  received: number;
  accepted: number;
  missing: number;
  damaged?: number;
}) {
  const damaged = input.damaged ?? input.received - input.accepted;
  // Every ordering invariant is established before any subtraction. `reported > shipped` used to be
  // checked here while `notReported = shipped - reported` was computed before the non-negative
  // assertion that guarded it; the ordering checks now come first so no negative can be produced.
  requireRule(
    input.shipped >= 0 &&
      input.reported >= 0 &&
      input.received >= 0 &&
      input.accepted >= 0 &&
      input.missing >= 0 &&
      damaged >= 0,
    'DELIVERY_MISMATCH',
    'Quantities cannot be negative.',
  );
  requireRule(
    input.reported <= input.shipped,
    'DELIVERY_MISMATCH',
    'A delivery report cannot exceed the quantity shipped.',
  );
  requireRule(
    input.received <= input.reported,
    'DELIVERY_MISMATCH',
    'The buyer cannot receive more pieces than the operator reported delivering.',
  );
  requireRule(
    input.received + input.missing === input.reported,
    'DELIVERY_MISMATCH',
    'Received and missing pieces must equal the reported delivery.',
  );
  requireRule(
    input.accepted + damaged === input.received,
    'DELIVERY_MISMATCH',
    'Accepted plus damaged pieces must equal the received pieces.',
  );
  // Everything shipped that the operator did not report arriving is unaccounted for, and everything
  // received but not accepted is damaged. Neither may be silently absorbed.
  const notReported = input.shipped - input.reported;
  const shortage = notReported + input.missing;
  return {
    damaged,
    shortage,
    notReported,
    discrepancy: shortage > 0 || damaged > 0,
  };
}

/* ------------------------------------------------------- shipment provenance */

/**
 * The separated quantities behind a shipment's delivery. Each has its own source and its own
 * meaning; none may be netted into another.
 *
 *   operatorNotReported  - shipped but never reported delivered by the operator
 *   buyerDeclaredMissing - declared missing by the buyer
 *   totalUnaccounted     - the sum of the two
 *
 * `damaged` is deliberately outside `totalUnaccounted`: a damaged piece arrived and was received,
 * it was not unaccounted for.
 */
export type ShipmentProvenance = {
  shipped: number;
  operatorReported: number;
  buyerReceived: number;
  accepted: number;
  damaged: number;
  operatorNotReported: number;
  buyerDeclaredMissing: number;
  totalUnaccounted: number;
  discrepancy: boolean;
};

export function shipmentProvenance(input: {
  shipped: number;
  operatorReported: number;
  buyerReceived: number;
  buyerDeclaredMissing: number;
  accepted: number;
  damaged: number;
}): ShipmentProvenance {
  requireRule(
    input.shipped >= 0 &&
      input.operatorReported >= 0 &&
      input.buyerReceived >= 0 &&
      input.buyerDeclaredMissing >= 0 &&
      input.accepted >= 0 &&
      input.damaged >= 0,
    'DELIVERY_MISMATCH',
    'Quantities cannot be negative.',
  );
  requireRule(
    input.operatorReported <= input.shipped,
    'DELIVERY_MISMATCH',
    'A delivery report cannot exceed the quantity shipped.',
  );
  requireRule(
    input.buyerReceived + input.buyerDeclaredMissing === input.operatorReported,
    'DELIVERY_MISMATCH',
    'Received and buyer-declared missing pieces must equal the operator-reported delivery.',
  );
  requireRule(
    input.accepted + input.damaged === input.buyerReceived,
    'DELIVERY_MISMATCH',
    'Accepted plus damaged pieces must equal the received pieces.',
  );
  const operatorNotReported = input.shipped - input.operatorReported;
  const totalUnaccounted = operatorNotReported + input.buyerDeclaredMissing;
  return {
    shipped: input.shipped,
    operatorReported: input.operatorReported,
    buyerReceived: input.buyerReceived,
    accepted: input.accepted,
    damaged: input.damaged,
    operatorNotReported,
    buyerDeclaredMissing: input.buyerDeclaredMissing,
    totalUnaccounted,
    discrepancy: totalUnaccounted > 0 || input.damaged > 0,
  };
}

/**
 * Reconstruction of a stored receipt's separated quantities.
 *
 * The stored `missing` column changed meaning in Batch 1: before the change it held the buyer's
 * declaration, after it holds the total shortage. Neither version is read here - both are derived
 * from immutable facts, so reconstruction is exact under either rule:
 *
 *   buyerDeclaredMissing = operatorReported - buyerReceived
 *   operatorNotReported  = shipped - operatorReported
 *   totalUnaccounted     = shipped - buyerReceived
 */
export type ReceiptRuleVersion = 'BUYER_DECLARATION' | 'TOTAL_SHORTAGE' | 'AMBIGUOUS';

export type ReconstructedReceipt = {
  shipped: number;
  operatorReported: number;
  buyerReceived: number;
  operatorNotReported: number;
  buyerDeclaredMissing: number;
  totalUnaccounted: number;
  /** Which stored-value rule the row's `missing` column is consistent with, if determinable. */
  storedValueRule: ReceiptRuleVersion;
};

export function reconstructReceipt(input: {
  shipped: number;
  operatorReported: number;
  buyerReceived: number;
  /** The value persisted in BuyerDeliveryConfirmation.missing. Used only for classification. */
  storedMissing: number;
}): ReconstructedReceipt {
  requireRule(
    input.shipped >= 0 && input.operatorReported >= 0 && input.buyerReceived >= 0,
    'DELIVERY_MISMATCH',
    'Quantities cannot be negative.',
  );
  requireRule(
    input.operatorReported <= input.shipped,
    'DELIVERY_MISMATCH',
    'A delivery report cannot exceed the quantity shipped.',
  );
  requireRule(
    input.buyerReceived <= input.operatorReported,
    'DELIVERY_MISMATCH',
    'The buyer cannot have received more pieces than were reported delivered.',
  );
  const buyerDeclaredMissing = input.operatorReported - input.buyerReceived;
  const operatorNotReported = input.shipped - input.operatorReported;
  return {
    shipped: input.shipped,
    operatorReported: input.operatorReported,
    buyerReceived: input.buyerReceived,
    operatorNotReported,
    buyerDeclaredMissing,
    totalUnaccounted: operatorNotReported + buyerDeclaredMissing,
    storedValueRule: receiptRuleVersion(input),
  };
}

/**
 * Classify which rule a stored `missing` value is consistent with. This is a reporting aid, not
 * an input to reconstruction. Where both rules coincide (a clean delivery, or a receipt whose
 * declaration happens to equal the total) the answer is AMBIGUOUS and must not be over-claimed.
 */
export function receiptRuleVersion(input: {
  shipped: number;
  operatorReported: number;
  buyerReceived: number;
  storedMissing: number;
}): ReceiptRuleVersion {
  const declared = input.operatorReported - input.buyerReceived;
  const total = input.shipped - input.buyerReceived;
  const matchesDeclared = input.storedMissing === declared;
  const matchesTotal = input.storedMissing === total;
  if (matchesDeclared && matchesTotal) return 'AMBIGUOUS';
  if (matchesDeclared) return 'BUYER_DECLARATION';
  if (matchesTotal) return 'TOTAL_SHORTAGE';
  return 'AMBIGUOUS';
}

/**
 * Custody conservation: the pieces leaving a holder must equal the pieces arriving with the next
 * holder, and no handover may move more than the shipment contains. The caller sums earlier
 * movements on the same custody leg, keeping confirmations and subsequent legs separate.
 */
export function custodyConservation(input: {
  shipped: number;
  previousHandovers: number;
  quantity: number;
}) {
  requireRule(
    input.quantity > 0 &&
      input.previousHandovers >= 0 &&
      input.previousHandovers + input.quantity <= input.shipped,
    'EXCESS_HANDOVER',
    'Custody movement cannot exceed the quantity shipped, counting every earlier handover.',
  );
  return {
    moved: input.previousHandovers + input.quantity,
    remaining: input.shipped - input.previousHandovers - input.quantity,
  };
}

export const shipmentCreateSchema = z
  .object({
    items: z
      .array(z.object({ preparationItemId: id, quantity: positive }).strict())
      .min(1)
      .max(20),
    hub: z.string().trim().min(2).max(120),
    windowStart: when,
    windowEnd: when,
    coordinatorId: id,
  })
  .strict();
export const pickupSchema = z
  .object({
    version: z.number().int().min(1),
    hub: z.string().trim().min(2).max(120),
    windowStart: when,
    windowEnd: when,
    coordinatorId: id,
  })
  .strict();
export const handoverSchema = z
  .object({
    version: z.number().int().min(1),
    eventType: z.enum(['COLLECTED_FROM_ASSOCIATION', 'RECEIVED_AT_HUB', 'HANDED_TO_TRANSPORT']),
    quantity: positive,
    occurredAt: when,
    note,
    priorHandoverId: id.optional(),
  })
  .strict();
export const deliveryReportSchema = z
  .object({ version: z.number().int().min(1), quantity: positive, occurredAt: when, note })
  .strict();
export const buyerConfirmationSchema = z
  .object({
    version: z.number().int().min(1),
    received: count,
    accepted: count,
    missing: count,
    damaged: count.optional(),
    occurredAt: when,
    note,
  })
  .strict();
export const shipmentCancelSchema = z.object({ version: z.number().int().min(1) }).strict();
export const traceabilityDraftSchema = z
  .object({ story: z.string().trim().min(20).max(400) })
  .strict();
export const traceabilityReasonSchema = z
  .object({ reason: z.string().trim().min(2).max(240) })
  .strict();
export const payableReconcileSchema = z
  .object({ milestone: z.enum(['BUYER_ACCEPTED_PIECE', 'QUALITY_APPROVED']) })
  .strict();
export const simulationSchema = z
  .object({
    side: z.enum(['BUYER', 'ARTISAN']),
    payableId: id.optional(),
    dueAt: when,
    retryOf: id.optional(),
  })
  .strict();
export const simulationAdvanceSchema = z
  .object({ next: z.enum(['SIMULATED_INITIATED', 'SIMULATED_SETTLED', 'SIMULATED_FAILED']) })
  .strict();

export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;
export type PickupInput = z.infer<typeof pickupSchema>;
export type HandoverInput = z.infer<typeof handoverSchema>;
export type DeliveryReportInput = z.infer<typeof deliveryReportSchema>;
export type BuyerConfirmationInput = z.infer<typeof buyerConfirmationSchema>;
export type ShipmentCancelInput = z.infer<typeof shipmentCancelSchema>;
export type TraceabilityDraftInput = z.infer<typeof traceabilityDraftSchema>;
export type PayableReconcileInput = z.infer<typeof payableReconcileSchema>;
export type SimulationInput = z.infer<typeof simulationSchema>;
export type SimulationAdvanceInput = z.infer<typeof simulationAdvanceSchema>;
