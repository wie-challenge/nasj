import { z } from 'zod';
import { quantity, requireRule } from './commerce/domain.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const code = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,40}$/);
const count = z.number().int().min(0).max(1000000);
const version = z.number().int().min(1);
export const materialUnits = ['METERS', 'PIECES', 'UNITS'] as const;
export type MaterialUnit = (typeof materialUnits)[number];
export const productionStages = [
  'NOT_STARTED',
  'PARTIALLY_COMMITTED',
  'READY_FOR_PRODUCTION',
  'IN_PRODUCTION',
  'UNDER_QUALITY_REVIEW',
  'PARTIALLY_APPROVED',
  'READY_FOR_FULFILLMENT',
] as const;
export type ProductionStage = (typeof productionStages)[number];

// Thousandths of the material unit. 500 means 0.500 of that unit per finished piece.
export function requiredMilli(perItemMilli: number, pieces: number, wastageBps: number): number {
  requireRule(
    Number.isSafeInteger(perItemMilli) && perItemMilli >= 1 && perItemMilli <= 1_000_000_000,
    'INVALID_QUANTITY',
    'Material usage must be a positive exact amount.',
  );
  requireRule(
    Number.isSafeInteger(wastageBps) && wastageBps >= 0 && wastageBps <= 1000,
    'INVALID_QUANTITY',
    'Wastage must be an explicit allowance from 0 to 10 percent.',
  );
  quantity(pieces, true);
  const scaled = BigInt(perItemMilli) * BigInt(pieces) * BigInt(10_000 + wastageBps);
  const result = (scaled + 5_000n) / 10_000n;
  requireRule(
    result <= BigInt(Number.MAX_SAFE_INTEGER),
    'INVALID_QUANTITY',
    'The material requirement is too large.',
  );
  return Number(result);
}
export function formatMilli(value: number): string {
  requireRule(Number.isSafeInteger(value), 'INVALID_QUANTITY', 'Material quantity is not exact.');
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`;
}
export function fundingDecision(provenance: string, attestation: string | undefined) {
  if (provenance !== 'SYNTHETIC' || attestation !== 'SYNTHETIC_DEMO_NOT_A_PAYMENT')
    return 'FUNDING_UNCONFIRMED' as const;
  return 'SYNTHETIC_DEMO' as const;
}
export function netAfterReinspection(
  current: { approved: number; rejected: number; pending: number; submitted: number },
  attempt: { scope: number; approved: number; rejected: number; pending: number },
) {
  for (const value of [
    current.approved,
    current.rejected,
    current.pending,
    current.submitted,
    attempt.scope,
    attempt.approved,
    attempt.rejected,
    attempt.pending,
  ])
    quantity(value);
  requireRule(
    attempt.scope >= 1 &&
      attempt.approved + attempt.rejected + attempt.pending === attempt.scope &&
      attempt.scope <= current.rejected,
    'QA_MISMATCH',
    'Reinspection covers previously rejected pieces only, without adding new production.',
  );
  const approved = current.approved + attempt.approved;
  const rejected = current.rejected - attempt.scope + attempt.rejected;
  const pending = current.pending + attempt.pending;
  requireRule(
    approved + rejected + pending === current.submitted && approved <= current.submitted,
    'QA_MISMATCH',
    'Reinspection must keep the original submitted total.',
  );
  return { approved, rejected, pending };
}
export function productionStage(input: {
  committed: number;
  released: number;
  inProgress: number;
  inQuality: number;
  approved: number;
  shippable: number;
}): ProductionStage {
  if (input.committed <= 0) return 'NOT_STARTED';
  if (input.inProgress > 0) return 'IN_PRODUCTION';
  if (input.inQuality > 0) return 'UNDER_QUALITY_REVIEW';
  if (input.shippable > 0) return 'READY_FOR_FULFILLMENT';
  if (input.approved > 0) return 'PARTIALLY_APPROVED';
  if (input.released > 0) return 'READY_FOR_PRODUCTION';
  return 'PARTIALLY_COMMITTED';
}
export function assertInspectionTotals(
  submitted: number,
  approved: number,
  rejected: number,
  pending: number,
) {
  for (const value of [submitted, approved, rejected, pending]) quantity(value);
  requireRule(
    approved + rejected + pending === submitted,
    'QA_MISMATCH',
    'Approved, rejected and pending pieces must equal the submitted pieces.',
  );
}

export const materialLinesSchema = z
  .object({
    revisionId: id,
    lines: z
      .array(
        z
          .object({
            materialCode: code,
            name: z.string().trim().min(2).max(80),
            unit: z.enum(materialUnits),
            perItemMilli: z.number().int().min(1).max(1_000_000_000),
            wastageBps: z.number().int().min(0).max(1000).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const inspectionCriteriaSchema = z
  .object({
    revisionId: id,
    criteria: z
      .array(
        z
          .object({
            code,
            description: z.string().trim().min(2).max(240),
            expected: z.string().trim().min(2).max(240),
            tolerance: z.string().trim().max(80).default(''),
            required: z.boolean(),
            evidenceRequired: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const batchReleaseSchema = z
  .object({
    version,
    fundingAttestation: z.literal('SYNTHETIC_DEMO_NOT_A_PAYMENT').optional(),
    materialAttestation: z.literal('SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT').optional(),
  })
  .strict();
export const batchStartSchema = z.object({ version }).strict();
export const progressReportSchema = z
  .object({
    version,
    produced: count,
    occurredAt: z.iso.datetime(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export const progressCorrectionSchema = z
  .object({
    version,
    eventId: id,
    produced: count,
    occurredAt: z.iso.datetime(),
    reason: z.string().trim().min(2).max(500),
  })
  .strict();
export const progressFlagSchema = z
  .object({ eventId: id, reason: z.string().trim().min(2).max(500) })
  .strict();
const criterionResult = z
  .object({
    criterionId: id,
    outcome: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
    note: z.string().trim().max(240).default(''),
  })
  .strict();
export const executionInspectionSchema = z
  .object({
    version,
    approved: count,
    rejected: count,
    pending: count,
    defectReason: z.string().trim().max(1000).default(''),
    results: z.array(criterionResult).min(1).max(20),
  })
  .strict();
export const reinspectionSchema = executionInspectionSchema.extend({
  scope: z.number().int().min(1).max(1000000),
});
export const consolidationSchema = z
  .object({
    items: z
      .array(z.object({ batchId: id, quantity: z.number().int().min(1).max(1000000) }).strict())
      .min(1)
      .max(20),
  })
  .strict();

export type MaterialLinesInput = z.infer<typeof materialLinesSchema>;
export type InspectionCriteriaInput = z.infer<typeof inspectionCriteriaSchema>;
export type BatchReleaseInput = z.infer<typeof batchReleaseSchema>;
export type ProgressReportInput = z.infer<typeof progressReportSchema>;
export type ProgressCorrectionInput = z.infer<typeof progressCorrectionSchema>;
export type ExecutionInspectionInput = z.infer<typeof executionInspectionSchema>;
export type ReinspectionInput = z.infer<typeof reinspectionSchema>;
export type ConsolidationInput = z.infer<typeof consolidationSchema>;

export type ExecutionSummary = {
  orderId: string;
  commercialStatus: string;
  productionStage: ProductionStage;
  requested: number;
  committed: number;
  reported: number;
  submitted: number;
  approved: number;
  rejected: number;
  pendingInspection: number;
  consolidated: number;
  shippable: number;
  shipped: number;
  delivered: number;
  buyerAccepted: number;
  shipment:
    | 'NOT_STARTED'
    | 'PICKUP_SCHEDULED'
    | 'IN_TRANSIT'
    | 'DELIVERY_REPORTED'
    | 'BUYER_CONFIRMED'
    | 'DISCREPANCY';
  provenance: 'SYNTHETIC';
  warnings: string[];
};
export type ExecutionMaterial = {
  materialCode: string;
  name: string;
  unit: MaterialUnit;
  perItem: string;
  required: string;
  wastageBps: number;
  readiness:
    | 'AVAILABILITY_UNKNOWN'
    | 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT'
    | 'RECEIPT_INCOMPLETE'
    | 'DISCREPANCY_BLOCKED'
    | 'SYNTHETIC_RECEIPT_ACKNOWLEDGED'
    | 'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION';
};
export type ExecutionCriterion = {
  id: string;
  code: string;
  description: string;
  expected: string;
  tolerance: string;
  required: boolean;
};
export type ExecutionBatch = {
  id: string;
  artisanName: string | null;
  status: string;
  version: number;
  quantity: number;
  produced: number;
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  consolidated: number;
  shippable: number;
  blockers: string[];
};
export type ExecutionView = {
  summary: ExecutionSummary;
  revisionId: string | null;
  specificationVersion: number | null;
  materials: ExecutionMaterial[];
  criteria: ExecutionCriterion[];
  batches: ExecutionBatch[];
  preparations: {
    id: string;
    quantity: number;
    createdAt: string;
    status: 'PREPARED';
    items: { id: string; quantity: number }[];
  }[];
  buyerView: boolean;
};
export type WorkInstruction = {
  batchId: string;
  version: number;
  status: string;
  orderReference: string;
  productTitle: string;
  craft: string;
  quantity: number;
  unit: 'PIECES';
  deadline: string;
  periodFrom: string | null;
  periodTo: string | null;
  specificationVersion: number | null;
  specification: string;
  materials: ExecutionMaterial[];
  instructions: string;
  qualityCriteria: ExecutionCriterion[];
  images: { filename: string; caption: string; sha256: string; dataUrl: string | null }[];
  catalogueRevisionId: string | null;
  instructionAmendment: string | null;
  translationNotice: string | null;
  compensationTnd: string | null;
  supportContact: string;
  preferredLanguage: string;
  termsLanguage: string;
  produced: number;
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  progressSource: 'ARTISAN' | 'COORDINATOR' | 'OPERATOR' | null;
  flags: { id: string; reason: string; recordedAt: string }[];
};
export type ProductionEventView = {
  id: string;
  action: string;
  source: string;
  quantity: number | null;
  reason: string;
  occurredAt: string;
  recordedAt: string;
};
