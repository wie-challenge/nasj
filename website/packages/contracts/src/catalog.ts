import { z } from 'zod';

/**
 * Versioned product specifications and paid sampling.
 *
 * Approved revisions are immutable: a change creates a new revision that supersedes the previous
 * one. A sample is never assumed to be unpaid, and its approval is never assumed from production
 * completing. Buyer approval is scoped to the buyer organization that owns the request.
 */

export const specificationStates = [
  'DRAFT',
  'SUBMITTED_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type SpecificationState = (typeof specificationStates)[number];

export const sampleStates = [
  'REQUESTED',
  'TERMS_PENDING',
  'ACCEPTED_FOR_PRODUCTION',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
] as const;
export type SampleState = (typeof sampleStates)[number];

const transitions: Record<SpecificationState, SpecificationState[]> = {
  DRAFT: ['SUBMITTED_FOR_REVIEW'],
  SUBMITTED_FOR_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUPERSEDED'],
  REJECTED: ['SUPERSEDED'],
  SUPERSEDED: [],
};

export function canTransitionSpecification(from: SpecificationState, to: SpecificationState) {
  return transitions[from]?.includes(to) ?? false;
}

const sampleTransitions: Record<SampleState, SampleState[]> = {
  REQUESTED: ['TERMS_PENDING', 'ACCEPTED_FOR_PRODUCTION'],
  TERMS_PENDING: ['ACCEPTED_FOR_PRODUCTION'],
  ACCEPTED_FOR_PRODUCTION: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
  APPROVED: [],
  REJECTED: ['REVISION_REQUESTED'],
  REVISION_REQUESTED: ['TERMS_PENDING', 'ACCEPTED_FOR_PRODUCTION'],
};

export function canTransitionSample(from: SampleState, to: SampleState) {
  return sampleTransitions[from]?.includes(to) ?? false;
}

/**
 * A sample may only enter production when its compensation is positively agreed. A missing or zero
 * amount keeps the request at TERMS_PENDING: sample work is never unpaid by default.
 */
export function sampleMayStart(input: {
  compensationMillimes: string | null;
  compensationBasis: string;
}): { allowed: boolean; reason: string | null } {
  if (input.compensationBasis === 'UNPAID_BY_DEFAULT_BLOCKED')
    return { allowed: false, reason: 'No compensation basis has been agreed.' };
  if (input.compensationMillimes === null)
    return { allowed: false, reason: 'Sample compensation is not recorded.' };
  if (!/^\d+$/.test(input.compensationMillimes))
    return { allowed: false, reason: 'Sample compensation is malformed.' };
  if (BigInt(input.compensationMillimes) <= 0n)
    return { allowed: false, reason: 'Sample work is never unpaid by default.' };
  return { allowed: true, reason: null };
}

/**
 * Production release may only use a sample approval that belongs to the same buyer organization
 * and the same specification revision the release references. A superseded or rejected sample
 * approval never authorizes work.
 */
export function sampleApprovalAuthorizesWork(input: {
  approvalDecision: string;
  approvalBuyerOrganizationId: string;
  releaseBuyerOrganizationId: string;
  approvalRevisionId: string;
  releaseRevisionId: string;
  revisionState: SpecificationState;
}): { authorized: boolean; reason: string | null } {
  if (input.approvalDecision !== 'APPROVED')
    return { authorized: false, reason: 'The recorded sample decision is not an approval.' };
  if (input.approvalBuyerOrganizationId !== input.releaseBuyerOrganizationId)
    return {
      authorized: false,
      reason: 'The sample was approved by a different buyer organization.',
    };
  if (input.approvalRevisionId !== input.releaseRevisionId)
    return {
      authorized: false,
      reason: 'The sample approval belongs to a different specification revision.',
    };
  if (input.revisionState !== 'APPROVED')
    return { authorized: false, reason: 'The specification revision is not current and approved.' };
  return { authorized: true, reason: null };
}

const money = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,3})?$/);
const text = z.string().trim().min(2).max(4000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);

export const specificationMaterialSchema = z
  .object({
    materialCode: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(160),
    quantity: z
      .string()
      .trim()
      .regex(/^\d{1,8}(\.\d{1,3})?$/)
      .refine((value) => /[1-9]/.test(value), 'A positive material quantity is required.'),
    unit: z.enum(['METERS', 'PIECES', 'UNITS']),
  })
  .strict();

export const specificationRevisionSchema = z
  .object({
    revisionNumber: z.number().int().positive(),
    description: text,
    dimensions: z.string().trim().max(160).default(''),
    unit: z.string().trim().min(1).max(24).default('cm'),
    materials: z.array(specificationMaterialSchema).min(1).max(60),
    instructions: text,
    instructionLanguage: z.enum(['en', 'fr', 'ar']).default('en'),
    instructionTranslations: z
      .array(
        z
          .object({
            language: z.enum(['en', 'fr', 'ar']),
            instructions: text,
            reviewReference: z.string().trim().min(2).max(500),
          })
          .strict(),
      )
      .max(3)
      .default([]),
    tolerances: z.string().trim().max(2000).default(''),
    qualityCriteria: text,
    referenceImages: z
      .array(
        z
          .object({
            filename: z.string().trim().min(1).max(160),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            caption: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    sampleReference: z.string().trim().max(200).optional(),
  })
  .strict();
export type SpecificationRevisionInput = z.infer<typeof specificationRevisionSchema>;

export const specificationCreateSchema = z
  .object({
    productCode: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/),
    name: z.string().trim().min(2).max(160),
    craftSkillId: id,
    revision: specificationRevisionSchema,
  })
  .strict();
export type SpecificationCreateInput = z.infer<typeof specificationCreateSchema>;

export const specificationDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    comments: z.string().trim().max(2000).default(''),
  })
  .strict();

export const sampleRequestSchema = z
  .object({
    revisionId: id,
    buyerOrganizationId: id,
    operatorOrganizationId: id,
    sampleQuantity: z.number().int().positive().max(1000),
    responsibleArtisanProfileId: id,
    workTerms: text,
    materialResponsibility: text,
    plannedCompletion: z.iso.datetime({ offset: true }),
  })
  .strict();

export const sampleTermsSchema = z
  .object({
    compensationTnd: money,
    compensationBasis: z.enum(['PER_SAMPLE', 'HOURLY_ESTIMATE', 'PIECE_RATE']),
    materialCostTnd: money,
    reimburseMaterials: z.boolean().default(false),
    workTerms: text,
    evidenceReference: z.string().trim().min(2).max(500),
  })
  .strict();

export const sampleWorkSchema = z
  .object({
    actualRecordedMinutes: z.number().int().min(0).max(100000).nullable(),
    actualMaterialCostTnd: money.nullable().default(null),
    actualMaterialUsage: z.string().trim().max(2000).default(''),
    timeEvidence: z.enum(['SYNTHETIC', 'OBSERVED', 'UNKNOWN']),
    evidenceReference: z.string().trim().min(2).max(500),
  })
  .strict();

export const sampleEvaluationSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
    criteria: text,
    comments: z.string().trim().max(2000).default(''),
    evidenceReference: z.string().trim().min(2).max(500),
  })
  .strict();

export const sampleApprovalSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    comments: z.string().trim().max(2000).default(''),
    evidenceReference: z.string().trim().min(2).max(500),
  })
  .strict();

export type SampleRequestInput = z.infer<typeof sampleRequestSchema>;
export type SampleTermsInput = z.infer<typeof sampleTermsSchema>;
export type SampleWorkInput = z.infer<typeof sampleWorkSchema>;
export type SampleEvaluationInput = z.infer<typeof sampleEvaluationSchema>;
export type SampleApprovalInput = z.infer<typeof sampleApprovalSchema>;

export type SpecificationRevisionView = {
  id: string;
  revisionNumber: number;
  status: SpecificationState;
  description: string;
  dimensions: string;
  unit: string;
  materials: { materialCode: string; name: string; quantity: string; unit: string }[];
  instructions: string;
  tolerances: string;
  qualityCriteria: string;
  referenceImages: { filename: string; sha256: string; caption: string }[];
  sampleReference: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectionReason: string;
  supersededByRevisionNumber: number | null;
};

export type SpecificationView = {
  id: string;
  productCode: string;
  name: string;
  craftSkillId: string;
  craftName: string;
  ownerOrganizationId: string;
  revisions: SpecificationRevisionView[];
};

export type SampleRequestView = {
  id: string;
  revisionId: string;
  revisionNumber: number;
  specification: {
    description: string;
    dimensions: string;
    tolerances: string;
    qualityCriteria: string;
    instructions: string;
  };
  specificationName: string;
  productCode: string;
  buyerOrganizationId: string;
  operatorOrganizationId: string;
  sampleQuantity: number;
  status: SampleState;
  workTerms: string;
  termsSha256: string | null;
  canAcceptTerms: boolean;
  canIssueTerms: boolean;
  canRecordWork: boolean;
  canEvaluate: boolean;
  canApprove: boolean;
  acceptedAt: string | null;
  compensationTnd: string | null;
  compensationBasis: string;
  materialCostTnd: string | null;
  payable: { id: string; amountTnd: string; status: string } | null;
  materialResponsibility: string;
  plannedCompletion: string | null;
  actualRecordedMinutes: number | null;
  actualMaterialCostTnd: string | null;
  actualMaterialUsage: string;
  timeEvidence: string;
  evidenceReference: string;
  evaluations: {
    id: string;
    decision: string;
    criteria: string;
    comments: string;
    evidenceReference: string;
    createdAt: string;
  }[];
  approvals: {
    id: string;
    decision: string;
    comments: string;
    evidenceReference: string;
    createdAt: string;
    buyerOrganizationId: string;
  }[];
  /** Why this sample cannot yet enter production, when true. */
  compensationBlocker: string | null;
};

export const bindRevisionSchema = z
  .object({
    catalogueRevisionId: id,
  })
  .strict();

export type CatalogWorkspaceView = {
  specifications: SpecificationView[];
  samples: SampleRequestView[];
  canApprove: boolean;
  limitations: string[];
};
