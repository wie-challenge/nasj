import { z } from 'zod';
import { rfqEditSchema, tndSchema } from './commerce/contracts.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const text = z
  .string()
  .trim()
  .min(2)
  .max(2000)
  .refine(
    (value) =>
      Array.from(value).every(
        (c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0)),
      ),
    'Use plain text without control characters.',
  );

const version = z.number().int().positive();
export const procurementPageSchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
export const procurementReviseSchema = rfqEditSchema.extend({ reason: text.max(500) }).strict();
export const procurementAttachmentSchema = z
  .object({
    version,
    filename: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_. -]+$/),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z
      .string()
      .min(4)
      .max(350000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const procurementVersionSchema = z.object({ version }).strict();
export const procurementMessageSchema = z
  .object({ body: text, internal: z.boolean().default(false) })
  .strict();
export const procurementQuestionSchema = z.object({ question: text }).strict();
export const procurementAnswerSchema = z.object({ answer: text }).strict();
export const procurementSampleSchema = z
  .object({ version, evidenceReference: text.max(500), criteria: text })
  .strict();
export const procurementDecisionSchema = z
  .object({
    version,
    sampleId: id,
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
    comments: text,
  })
  .strict();
export const procurementQuoteSchema = z
  .object({
    version,
    totalTnd: tndSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    priceReview: text.max(500),
    capacityReview: text.max(500),
    materialsReview: text.max(500),
    taxPolicyReference: text.max(200),
    taxBasisPoints: z.number().int().min(0).max(10000),
  })
  .strict();
export const procurementAcceptSchema = z
  .object({
    version,
    quoteId: id,
    confirm: z.literal(true),
    termsSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const procurementProductSchema = z
  .object({
    version,
    productCode: z.string().regex(/^[A-Z0-9-]{2,40}$/),
    materials: text,
    leadTimeDays: z.number().int().min(1).max(730),
    leadTimeSampleCount: z.number().int().min(1).max(10000),
    leadTimeContext: text.max(500),
  })
  .strict();
export const procurementProductStatusSchema = z
  .object({ status: z.enum(['SUPERSEDED', 'DISCONTINUED']), reason: text.max(500) })
  .strict();
export const procurementReorderSchema = z
  .object({
    quantity: z.number().int().min(1).max(1000000),
    deliveryAt: z.iso.datetime({ offset: true }),
    deliveryLocation: text.max(200),
    confirm: z.literal(true),
  })
  .strict();
export const procurementDocumentSchema = z
  .object({ kind: z.enum(['INVOICE', 'DELIVERY']) })
  .strict();
export type ProcurementDetail = {
  rfq: {
    id: string;
    title: string;
    specification: string;
    designRequirements: string;
    craftSkillId: string;
    quantity: number;
    deliveryAt: string;
    deliveryLocation: string;
    status: string;
    version: number;
    procurementManaged: boolean;
    sourceProductId: string | null;
  };
  access: {
    buyer: boolean;
    operator: boolean;
    purchasing: boolean;
    negotiating: boolean;
    approving: boolean;
  };
  revisions: {
    id: string;
    version: number;
    reason: string;
    authorId: string;
    createdAt: string;
    snapshot: Record<string, unknown>;
    predecessorId: string | null;
  }[];
  attachments: { id: string; filename: string; mime: string; sha256: string }[];
  questions: {
    id: string;
    question: string;
    answer: string | null;
    createdAt: string;
    answeredAt: string | null;
  }[];
  samples: {
    id: string;
    version: number;
    evidenceReference: string;
    criteria: string;
    revisionId: string;
    createdAt: string;
    snapshot: Record<string, unknown>;
    decision: { decision: string; comments: string; actorId: string; createdAt: string } | null;
  }[];
  quotes: {
    id: string;
    version: number;
    revisionId: string;
    totalTnd: string;
    expiresAt: string;
    current: boolean;
    status: string;
    termsSha256: string | null;
    snapshot: Record<string, unknown>;
  }[];
  feasibility: {
    id: string;
    version: number;
    result: string;
    knownRemaining: string | null;
    shortage: string | null;
    effortMin: string | null;
    effortMax: string | null;
    constraints: { code: string; known: boolean; detail: string }[];
    explanation: string;
    reservation: false;
    createdAt: string;
  }[];
  costs: {
    id: string;
    version: number;
    feasibilityId: string;
    incomplete: boolean;
    status: string;
    subtotalTnd: string;
    sellingTnd: string | null;
    taxStatus: string;
    marginMethod: string;
    components: Record<string, unknown>[] | null;
    createdAt: string;
  }[];
  documents: ProcurementDocumentView[];
  products: { id: string; productCode: string; version: number; status: string }[];
  orderId: string | null;
  currentSampleApproved: boolean;
};
export type ProcurementDocumentView = {
  id: string;
  number: number;
  rfqId: string;
  kind: string;
  version: number;
  status: string;
  createdAt: string;
  superseded: boolean;
};
export type ProcurementList = {
  requests: {
    id: string;
    title: string;
    status: string;
    version: number;
    procurementManaged: boolean;
  }[];
  page: number;
  hasMore: boolean;
  buyerOrganizations: { id: string; name: string }[];
  operators: { id: string; name: string }[];
  crafts: { id: string; name: string }[];
};
export type ProcurementThread = {
  items: { id: string; body: string; authorLabel: string; createdAt: string; internal: boolean }[];
  page: number;
  hasMore: boolean;
  canPost: boolean;
  canPostInternal: boolean;
};
export type ProcurementProducts = {
  items: {
    id: string;
    productCode: string;
    version: number;
    status: string;
    materials: string;
    leadTimeDays: number;
    leadTimeSampleCount: number;
    leadTimeContext: string;
    snapshot: Record<string, unknown>;
  }[];
  page: number;
  hasMore: boolean;
};

export const procurementCloseSchema = z
  .object({ version: z.number().int().positive(), next: z.enum(['DECLINED', 'EXPIRED']) })
  .strict();
