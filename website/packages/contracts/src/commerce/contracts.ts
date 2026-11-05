import { z } from 'zod';
import { parseTnd } from '../domain.js';
import { rfqStates, offerStates, batchStates, paymentStates, orderStates } from './domain.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const text = z.string().trim().min(2).max(2000);
const units = z.number().int().min(1).max(1000000);
const count = z.number().int().min(0).max(1000000);
const version = z.number().int().min(1);
const date = z.iso.datetime({ offset: true });
export const tndSchema = z.string().refine((value) => {
  try {
    parseTnd(value);
    return true;
  } catch {
    return false;
  }
}, 'Use nonnegative TND with at most three decimal places within the supported limit.');
export const rfqCreateSchema = z
  .object({
    buyerOrganizationId: id,
    operatorOrganizationId: id,
    craftSkillId: id,
    title: text.max(120),
    specification: text,
    designRequirements: text,
    quantity: units,
    deliveryAt: date,
    deliveryLocation: text.max(200),
    provenance: z.literal('SYNTHETIC'),
    catalogExampleId: id.optional(),
  })
  .strict();
export const rfqEditSchema = rfqCreateSchema
  .omit({
    buyerOrganizationId: true,
    operatorOrganizationId: true,
    provenance: true,
    catalogExampleId: true,
  })
  .extend({ version })
  .strict();
export const rfqActionSchema = z.discriminatedUnion('next', [
  z
    .object({
      next: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED', 'EXPIRED']),
      version,
    })
    .strict(),
  z
    .object({ next: z.literal('QUOTED'), version, quoteTnd: tndSchema, quoteExpiresAt: date })
    .strict(),
]);
export const offerCreateSchema = z
  .object({
    orderId: id,
    capacityDeclarationId: id,
    quantity: units,
    unitPayTnd: tndSchema,
    estimatedHours: text.max(100),
    expiresAt: date,
    materials: text,
    reworkTerms: text,
    paymentConditions: text,
    provenance: z.literal('SYNTHETIC'),
  })
  .strict();
export const offerActionSchema = z
  .object({
    next: z.enum(offerStates),
    version,
    reviewLanguage: z.enum(['en', 'fr', 'ar']).optional(),
    sourceTermsLanguage: z.literal('en').optional(),
    acknowledgeOriginalTerms: z.literal(true).optional(),
    termsSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const batchActionSchema = z
  .object({ next: z.enum(batchStates), version, reworkAccepted: z.literal(true).optional() })
  .strict();
export const progressSchema = z.object({ version, produced: count }).strict();
export const inspectionSchema = z
  .object({
    version,
    approved: count,
    rejected: count,
    pending: count,
    defectReason: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((v) => v.rejected === 0 || v.defectReason.length >= 2, 'Explain rejected units.');
export const orderActionSchema = z
  .object({
    next: z.enum(orderStates),
    version,
    materialsResolved: z.literal(true).optional(),
    dispositionNote: z.string().trim().min(10).max(1000).optional(),
  })
  .strict()
  .refine(
    (v) => v.next !== 'CLOSED' || (v.materialsResolved && v.dispositionNote),
    'Confirm and describe the synthetic material disposition before closing.',
  );
export const paymentCreateSchema = z
  .object({
    orderId: id,
    batchId: id.optional(),
    kind: z.enum(['BUYER_RECEIPT', 'ARTISAN_PAYOUT']),
    amountTnd: tndSchema,
    provenance: z.literal('SYNTHETIC'),
  })
  .strict()
  .refine(
    (v) => (v.kind === 'ARTISAN_PAYOUT' ? Boolean(v.batchId) : !v.batchId),
    'Artisan payouts require a batch; buyer receipts must not select a batch.',
  );
export const paymentActionSchema = z
  .object({
    next: z.enum(paymentStates),
    version,
    evidenceType: z.literal('SIMULATED_SETTLEMENT').optional(),
  })
  .strict();
export type RfqCreate = z.infer<typeof rfqCreateSchema>;
export type RfqEdit = z.infer<typeof rfqEditSchema>;
export type RfqAction = z.infer<typeof rfqActionSchema>;
export type OfferCreate = z.infer<typeof offerCreateSchema>;
export type OfferAction = z.infer<typeof offerActionSchema>;
export type BatchAction = z.infer<typeof batchActionSchema>;
export type ProgressInput = z.infer<typeof progressSchema>;
export type InspectionInput = z.infer<typeof inspectionSchema>;
export type OrderAction = z.infer<typeof orderActionSchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type PaymentAction = z.infer<typeof paymentActionSchema>;
export type CommercialRfqView = {
  id: string;
  buyerOrganizationId: string;
  operatorOrganizationId: string;
  title: string;
  specification: string;
  designRequirements: string;
  craftSkillId: string;
  quantity: number;
  deliveryAt: string;
  deliveryLocation: string;
  status: (typeof rfqStates)[number];
  version: number;
  quoteTnd: string | null;
  quoteExpiresAt: string | null;
  provenance: 'SYNTHETIC';
};
export type CommercialOrderView = {
  id: string;
  rfqId: string;
  title: string;
  status: (typeof orderStates)[number];
  version: number;
  quantity: number;
  allocated: number;
  produced: number;
  approved: number;
  delivered: number;
  quoteTnd: string | null;
  provenance: 'SYNTHETIC';
  buyerOrganizationId: string;
  operatorOrganizationId: string;
};
export type CommercialOfferView = {
  id: string;
  orderId: string;
  artisanProfileId: string;
  quantity: number;
  unitPayTnd: string | null;
  totalPayTnd: string | null;
  estimatedHours: string;
  expiresAt: string;
  materials: string;
  reworkTerms: string;
  paymentConditions: string;
  specification: string;
  deliveryAt: string;
  status: (typeof offerStates)[number];
  version: number;
  provenance: 'SYNTHETIC';
  termsSha256?: string | null;
  compensationMethod?: string | null;
  collectionArrangement?: string | null;
  instructions?: string | null;
  preferredLanguage?: string | null;
};
export type CommercialBatchView = {
  id: string;
  orderId: string;
  offerId: string;
  artisanProfileId: string;
  status: (typeof batchStates)[number];
  version: number;
  quantity: number;
  produced: number;
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  provenance: 'SYNTHETIC';
};
export type CommercialPaymentView = {
  id: string;
  orderId: string;
  batchId: string | null;
  kind: 'BUYER_RECEIPT' | 'ARTISAN_PAYOUT';
  amountTnd: string;
  status: (typeof paymentStates)[number];
  version: number;
  evidenceType: 'SIMULATED_SETTLEMENT' | null;
  provenance: 'SYNTHETIC';
};
export type CommerceWorkspaceView = {
  buyerOrganizations: { id: string; name: string; permissions?: string[] }[];
  operatorOrganizations: { id: string; name: string; roles: string[] }[];
  operatorCatalog: { id: string; name: string }[];
  crafts: { id: string; name: string }[];
  candidates: {
    capacityDeclarationId: string;
    artisanProfileId: string;
    displayName: string;
    craftSkillId: string;
    quantity: string;
    remaining: string;
    availabilityKnown: boolean;
    effectiveFrom: string;
    effectiveTo: string;
  }[];
  rfqs: CommercialRfqView[];
  orders: CommercialOrderView[];
  offers: CommercialOfferView[];
  batches: CommercialBatchView[];
  payments: CommercialPaymentView[];
  artisanProfileId: string | null;
};
