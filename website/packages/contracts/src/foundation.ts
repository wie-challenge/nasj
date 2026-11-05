import { z } from 'zod';
import type { OperationalPersona, Permission } from './permissions.js';
import { capacityFields, validCapacityPeriod } from './capacity.js';
const id = z.string().min(1).max(128);
const reason = z.string().trim().min(10).max(1000);
export const authorizationMethods = [
  'SIGNED',
  'WITNESSED_VERBAL',
  'SMS_CONFIRMATION',
  'APPROVED_ACCESSIBLE',
] as const;
export const authorizationEvidenceSchema = z
  .object({
    policyId: id,
    purpose: z.enum(['PARTICIPATION', 'CAPACITY', 'OFFER_DECISION']),
    method: z.enum(authorizationMethods),
    occurredAt: z.iso.datetime(),
    language: z.string().trim().min(2).max(40),
    witnessReference: z.string().trim().min(5).max(200).optional(),
    evidenceReference: z.string().trim().min(10).max(300),
  })
  .strict()
  .refine(
    (v) => v.method !== 'WITNESSED_VERBAL' || Boolean(v.witnessReference),
    'A separate witness is required.',
  );
export const authorizationPolicySchema = z
  .object({
    version: z.string().trim().min(2).max(80),
    methods: z.array(z.enum(authorizationMethods)).min(1).max(4),
    reviewReference: reason,
  })
  .strict();
const profileFields = {
  displayName: z.string().trim().min(2).max(120),
  region: z.string().trim().min(1).max(120),
  preferredLanguage: z.enum(['en', 'fr', 'ar']),
  contactPhone: z.string().trim().max(40).default(''),
  experienceDescription: z.string().trim().max(2000).default(''),
  equipment: z.array(z.string().trim().min(1).max(120)).max(30),
  availabilityStatus: z.enum(['AVAILABLE', 'PAUSED']),
};
export const registryCreateSchema = z
  .object({
    ...profileFields,
    skills: z.array(id).min(1).max(30),
    authorization: authorizationEvidenceSchema,
    duplicateReviewId: id.optional(),
  })
  .strict();
export const registryUpdateSchema = z.object({ ...profileFields, reason }).strict();
export const assistedCapacitySchema = z
  .object({
    ...capacityFields,
    quantity: z
      .string()
      .regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/)
      .refine((v) => Number(v) <= 100000, 'Capacity cannot exceed 100000.'),
    authorizationId: id,
  })
  .strict()
  .refine(validCapacityPeriod, 'Capacity period must increase.');
export const affiliationChangeSchema = z.object({ organizationId: id, reason }).strict();
export const affiliationStatusSchema = z
  .object({
    organizationId: id.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']),
    reason,
  })
  .strict();
export const assignmentSchema = z.object({ coordinatorId: id, reason }).strict();
export const artisanTransferSchema = z
  .object({
    organizationId: id,
    coordinatorId: id,
    authorization: authorizationEvidenceSchema,
    reason,
  })
  .strict();
export const accountLinkSchema = z
  .object({ userId: id, verificationReference: reason, reason })
  .strict();
export const explicitGrantSchema = z
  .object({
    permission: z.enum([
      'buyer.rfq.create',
      'buyer.quotation.negotiate',
      'buyer.quotation.approve',
      'operator.payout.initiate',
      'operator.payout.approve',
      'finance.payable.reconcile',
      'finance.deposit.record',
      'finance.deposit.review',
      'finance.payout.request',
      'finance.payout.approve',
      'finance.payout.execute',
      'finance.dispute.manage',
      'finance.adjustment.propose',
      'finance.adjustment.approve',
      'finance.closure.assess',
      'inventory.stock.read',
      'inventory.stock.register',
      'inventory.stock.reserve',
      'inventory.stock.handover',
      'inventory.stock.receive',
      'inventory.stock.adjust',
    ]),
    enabled: z.boolean(),
    reason,
  })
  .strict();
export const privilegedInviteSchema = z
  .object({
    organizationId: id,
    email: z.email().toLowerCase(),
    persona: z.enum(['NASJ_OPERATOR', 'ASSOCIATION_COORDINATOR']),
    reason,
  })
  .strict();
export const operatorAssignmentSchema = z
  .object({ operatorId: id, organizationId: id, enabled: z.boolean(), reason })
  .strict();
export const authorizationWithdrawalSchema = z.object({ reason }).strict();
export const policyStatusSchema = z.object({ active: z.boolean(), reason }).strict();
export const participantSkillsSchema = z
  .object({ skills: z.array(id).min(1).max(30), reason })
  .strict();
// Future offer module must validate this against the exact offer and authorization, never infer acceptance from an assignment.
export const artisanDecisionEvidenceSchema = z
  .object({
    artisanId: id,
    offerId: id,
    termsVersion: z.number().int().positive(),
    decision: z.enum(['ACCEPTED', 'DECLINED']),
    method: z.enum(authorizationMethods),
    occurredAt: z.iso.datetime(),
    recordedByCoordinatorId: id,
    confirmationReference: reason,
    authorizationId: id,
    reviewStatus: z.enum(['PENDING_REVIEW', 'REVIEWED', 'DISPUTED']),
  })
  .strict();
export type ArtisanDecisionEvidence = z.infer<typeof artisanDecisionEvidenceSchema>;
export type AuthorizationEvidence = z.infer<typeof authorizationEvidenceSchema>;
export type RegistryCreate = z.infer<typeof registryCreateSchema>;
export type RegistryUpdate = z.infer<typeof registryUpdateSchema>;
export type AssistedCapacity = z.infer<typeof assistedCapacitySchema>;
export type IdentityContext = {
  personas: OperationalPersona[];
  linkedArtisanProfileId: string | null;
  landingPath: string;
  organizations: {
    id: string;
    name: string;
    type: string;
    approvalStatus: string;
    permissions: Permission[];
  }[];
  coordinatorOrganizationId: string | null;
  realPayoutsEnabled: false;
  independentContactPath: string;
};

export const duplicateReviewSchema = z.object({ artisanId: id, reason }).strict();

export const participantConcernSchema = z
  .object({
    subjectReference: z.string().trim().min(1).max(128),
    concernType: z.enum(['AUTHORIZATION', 'OFFER_DECISION', 'ACCESS', 'OTHER']),
    description: z.string().trim().min(20).max(2000),
    contactMethod: z.string().trim().max(200).optional(),
  })
  .strict();
export const concernReviewSchema = z
  .object({
    status: z.enum(['IN_REVIEW', 'RESOLVED']),
    resolution: z.string().trim().min(10).max(1000),
  })
  .strict();
