import { z } from 'zod';
import { tndSchema } from './commerce/contracts.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const note = z.string().trim().min(2).max(2000);
export const prospectDetailsSchema = z
  .object({
    segment: note,
    needs: note,
    qualificationNotes: note,
    status: z.enum(['LEAD', 'QUALIFIED', 'PROPOSAL', 'CONTRACTED', 'LOST']),
    ownerId: id,
    nextAction: note,
    followUpAt: z.iso.datetime({ offset: true }).nullable(),
    contactBasis: z.enum(['CONSENT', 'DOCUMENTED_OTHER_BASIS', 'DO_NOT_CONTACT']),
    basisEvidence: note,
    contactReviewAt: z.iso.datetime({ offset: true }),
    reason: note,
  })
  .strict();
export const prospectCreateSchema = prospectDetailsSchema
  .extend({
    operatorOrganizationId: id,
    buyerOrganizationId: id.optional(),
    organizationName: note.optional(),
    contactEmail: z.email().max(200).optional(),
  })
  .refine(
    (v) => Boolean(v.buyerOrganizationId) !== Boolean(v.organizationName),
    'Select an existing organization or provide a new prospect organization.',
  );
export const prospectUpdateSchema = prospectDetailsSchema.extend({
  version: z.number().int().positive(),
  organizationName: note.optional(),
});
export const pilotProposalSchema = z
  .object({
    groupId: id.optional(),
    version: z.number().int().positive(),
    specificationRevisionId: id,
    quantity: z.number().int().positive().max(1000000),
    proposedPriceTnd: tndSchema,
    estimatedCostTnd: tndSchema.nullable(),
    validUntil: z.iso.datetime({ offset: true }),
    timing: note,
    responsibilities: note,
    status: z.enum(['DRAFT', 'SENT', 'WON', 'LOST', 'NO_DECISION']),
    buyerResponse: note,
    reason: note,
    feedback: z.string().trim().max(2000),
    decisionAt: z.iso.datetime({ offset: true }).nullable(),
    rfqId: id.optional(),
  })
  .strict();
export const financialCostSchema = z
  .object({
    category: z.enum(['MATERIAL', 'QA', 'PACKING', 'LOGISTICS', 'OTHER']),
    amountTnd: tndSchema,
    sourceReference: note,
    occurredAt: z.iso.datetime({ offset: true }),
    provenance: z.enum(['SYNTHETIC', 'RECORDED_UNVERIFIED']),
    reason: note,
  })
  .strict();
export const cashModelSchema = z
  .object({
    reason: note,
    costCoverage: z.enum(['INCOMPLETE', 'RECORDED_SCOPE_COMPLETE']),
    varianceReason: note,
    events: z
      .array(
        z
          .object({
            sourceReference: note,
            direction: z.enum(['IN', 'OUT']),
            amountTnd: tndSchema,
            date: z.iso.datetime({ offset: true }).nullable(),
            basis: note,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const financePeriodSchema = z
  .object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .strict()
  .refine(
    (v) =>
      new Date(v.to) > new Date(v.from) &&
      new Date(v.to).getTime() - new Date(v.from).getTime() <= 366 * 86400000,
    'Use a positive period no longer than 366 days.',
  );
export const rfqFinanceReviewSchema = z
  .object({
    quoteId: id,
    decision: z.enum(['APPROVE_ADVISORY', 'HOLD', 'REJECT']),
    fundingStatus: z.enum(['DOCUMENTED_PLAN', 'UNFUNDED']),
    fundingEvidence: note,
    reason: note,
  })
  .strict();
export const closureDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    reason: note,
    exceptionReference: note.optional(),
  })
  .strict();

export const contractualDueDateSchema = z
  .object({
    payableId: id,
    version: z.number().int().positive(),
    basis: z.enum(['ACCEPTED_TERMS_EVIDENCE', 'UNKNOWN']),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    sourceEvidence: note,
    reason: note,
  })
  .strict()
  .refine(
    (v) => (v.basis === 'UNKNOWN') === (v.dueAt === null),
    'Unknown requires no date; accepted-terms evidence requires an exact date.',
  );
