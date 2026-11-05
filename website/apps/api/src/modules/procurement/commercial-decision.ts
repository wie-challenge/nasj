import { createHash } from 'node:crypto';
import type { CommercialRfq, Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import type { Db } from '../foundation/transaction.js';
import type { DirectoryService } from '../directory/directory.service.js';
import { audit } from '../foundation/audit.js';
import { procurementAudit, specificationSnapshot } from './records.js';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
const dec = (value: { toFixed(digits: number): string } | null) =>
  value ? value.toFixed(2) : null;
export function commercialTermsHash(terms: Record<string, string | number | boolean | null>) {
  return createHash('sha256')
    .update(
      Object.keys(terms)
        .sort()
        .map((key) => `${key}=${String(terms[key] ?? '')}`)
        .join('\n'),
    )
    .digest('hex');
}
function quotedTerms(
  input: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return {
    ...input,
    provenance: 'SYNTHETIC',
    legalStatus: 'DEMO_ONLY_NOT_A_BINDING_CONTRACT',
  };
}
async function sampleState(tx: Db, row: CommercialRfq) {
  const [sample, revision] = await Promise.all([
    tx.procurementSample.findFirst({
      where: { rfqId: row.id },
      orderBy: { version: 'desc' },
      include: { decision: true },
    }),
    tx.procurementRevision.findFirst({ where: { rfqId: row.id }, orderBy: { version: 'desc' } }),
  ]);
  if (!sample || sample.revisionId !== revision?.id || !sample.decision) return 'NONE' as const;
  if (sample.decision.decision === 'APPROVED') return 'APPROVED' as const;
  if (sample.decision.decision === 'REJECTED') return 'REJECTED' as const;
  if (sample.decision.decision === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED' as const;
  return 'PENDING' as const;
}
type FeasibilityInput = {
  version: number;
  effectiveFrom: string;
  effectiveTo: string;
  unit: 'HOURS' | 'PIECES';
  region?: string;
  materialStatus: 'UNKNOWN' | 'CONFIRMED_AVAILABLE' | 'SHORT';
  materialSource?: string;
  logisticsLeadDays?: number;
  calendarCleared: boolean;
  calendarSource?: string;
};
export async function recordFeasibility(
  tx: Db,
  directory: DirectoryService,
  actor: Actor,
  row: CommercialRfq,
  input: FeasibilityInput,
) {
  if (!['UNDER_REVIEW', 'QUOTED'].includes(row.status))
    fail(409, 'INVALID_TRANSITION', 'Review the request before assessing feasibility.');
  const capacity = await directory.publishedCapacity({
    craft: row.craftSkillId,
    unit: input.unit,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    region: input.region,
  });
  const effort = await tx.effortAssumption.findFirst({
    where: { craftSkillId: row.craftSkillId, unitType: 'PIECES', status: 'APPROVED' },
    orderBy: { version: 'desc' },
  });
  const decision = C.assessFeasibility({
    quantity: row.quantity,
    unit: input.unit,
    deliveryAt: row.deliveryAt,
    periodFrom: new Date(input.effectiveFrom),
    periodTo: new Date(input.effectiveTo),
    capacityKnown: capacity.capacityKnown,
    knownRemaining: capacity.knownRemaining,
    capacityConstraints: capacity.constraints,
    effort: effort
      ? {
          minPerUnit: effort.minPerUnit.toFixed(2),
          maxPerUnit: effort.maxPerUnit.toFixed(2),
          version: effort.version,
          source: effort.source,
        }
      : null,
    materialStatus: input.materialStatus,
    sample: await sampleState(tx, row),
    logisticsLeadDays: input.logisticsLeadDays ?? null,
    calendarCleared: input.calendarCleared,
  });
  const previous = await tx.feasibilityAssessment.findFirst({
    where: { rfqId: row.id },
    orderBy: { version: 'desc' },
  });
  const created = await tx.feasibilityAssessment.create({
    data: {
      rfqId: row.id,
      version: (previous?.version ?? 0) + 1,
      rfqVersion: row.version,
      result: decision.result,
      unitType: input.unit,
      requestedQuantity: row.quantity.toFixed(2),
      knownRemaining: decision.knownRemaining,
      shortage: decision.shortage,
      effortMin: decision.effortMin,
      effortMax: decision.effortMax,
      effortAssumptionId: effort?.id,
      constraints: json(decision.constraints),
      explanation: decision.explanation,
      assumptions: json({
        reservation: false,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        region: input.region ?? null,
        unit: input.unit,
        effortSource: effort?.source ?? null,
        effortVersion: effort?.version ?? null,
        materialStatus: input.materialStatus,
        materialSource: input.materialSource ?? null,
        logisticsLeadDays: input.logisticsLeadDays ?? null,
        calendarSource: input.calendarSource ?? null,
        provenance: 'SYNTHETIC',
      }),
      authorId: actor.id,
    },
  });
  await procurementAudit(tx, actor, row, 'feasibility.assessed', created.id);
  return { id: created.id, version: created.version, result: created.result };
}
export async function recordEffort(
  tx: Db,
  actor: Actor,
  input: {
    craftSkillId: string;
    unitType: string;
    minPerUnit: string;
    maxPerUnit: string;
    source: string;
  },
) {
  if (!(await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } })))
    fail(400, 'INVALID_CRAFT', 'Choose an active craft.');
  const previous = await tx.effortAssumption.findFirst({
    where: { craftSkillId: input.craftSkillId, unitType: input.unitType },
    orderBy: { version: 'desc' },
  });
  const created = await tx.effortAssumption.create({
    data: {
      craftSkillId: input.craftSkillId,
      unitType: input.unitType,
      minPerUnit: input.minPerUnit,
      maxPerUnit: input.maxPerUnit,
      source: input.source,
      version: (previous?.version ?? 0) + 1,
      authorId: actor.id,
    },
  });
  await audit(tx, actor, {
    action: 'effort.recorded',
    targetType: 'EffortAssumption',
    targetId: created.id,
    after: { version: created.version, unitType: input.unitType, provenance: 'SYNTHETIC' },
  });
  return { id: created.id, version: created.version };
}
export async function recordCost(
  tx: Db,
  actor: Actor,
  row: CommercialRfq,
  input: {
    feasibilityId: string;
    marginMethod: 'NONE' | 'MARKUP_ON_COST' | 'MARGIN_ON_SELLING_PRICE';
    marginBasisPoints: number;
    lines: {
      category: C.PricedCost['components'][number]['category'];
      basis: 'FIXED' | 'VARIABLE';
      rateTnd: string;
    }[];
  },
) {
  if (!['UNDER_REVIEW', 'QUOTED'].includes(row.status))
    fail(409, 'INVALID_TRANSITION', 'Review the request before costing it.');
  const feasibility = await tx.feasibilityAssessment.findFirst({
    where: { id: input.feasibilityId, rfqId: row.id },
  });
  if (!feasibility) fail(404, 'NOT_FOUND', 'Choose a feasibility assessment for this request.');
  let priced: C.PricedCost;
  try {
    priced = C.priceCost({
      quantity: row.quantity,
      marginMethod: input.marginMethod,
      marginBasisPoints: input.marginBasisPoints,
      lines: input.lines,
    });
  } catch {
    fail(400, 'INVALID_COST', 'Check the cost lines and margin rule.');
  }
  const previous = await tx.costEstimate.findFirst({
    where: { rfqId: row.id },
    orderBy: { version: 'desc' },
  });
  const created = await tx.costEstimate.create({
    data: {
      rfqId: row.id,
      version: (previous?.version ?? 0) + 1,
      feasibilityAssessmentId: feasibility.id,
      quantity: row.quantity,
      components: json(priced.components),
      subtotalMillimes: C.parseTnd(priced.subtotalTnd),
      marginMethod: priced.marginMethod,
      marginBasisPoints: priced.marginBasisPoints,
      sellingMillimes: priced.sellingTnd ? C.parseTnd(priced.sellingTnd) : null,
      incomplete: priced.incomplete,
      status: priced.incomplete ? 'DRAFT' : 'APPROVED',
      authorId: actor.id,
      snapshot: json({
        ...priced,
        feasibilityVersion: feasibility.version,
        provenance: 'SYNTHETIC',
      }),
    },
  });
  await procurementAudit(tx, actor, row, 'cost.recorded', created.id);
  return {
    id: created.id,
    version: created.version,
    incomplete: created.incomplete,
    sellingTnd: priced.sellingTnd,
  };
}
export async function issueCostedQuote(
  tx: Db,
  directory: DirectoryService,
  actor: Actor,
  row: CommercialRfq,
  input: {
    costEstimateId: string;
    expiresAt: string;
    paymentTerms: string;
    deliveryConditions: string;
  },
) {
  if (!['UNDER_REVIEW', 'QUOTED'].includes(row.status))
    fail(409, 'INVALID_TRANSITION', 'Start review before issuing a quotation.');
  if (await tx.commercialOrder.findUnique({ where: { rfqId: row.id } }))
    fail(409, 'ALREADY_ACCEPTED', 'An accepted quotation already exists for this request.');
  const cost = await tx.costEstimate.findFirst({
    where: { id: input.costEstimateId, rfqId: row.id },
    include: { feasibilityAssessment: true },
  });
  if (!cost || cost.incomplete || cost.status !== 'APPROVED' || cost.sellingMillimes === null)
    fail(409, 'COST_INCOMPLETE', 'Issue a quotation only from a complete approved cost version.');
  if (cost.feasibilityAssessment.result === 'NOT_FEASIBLE')
    fail(409, 'NOT_FEASIBLE', 'A blocked feasibility result cannot be issued as a quotation.');
  const expires = new Date(input.expiresAt);
  if (expires <= new Date() || expires >= row.deliveryAt || row.deliveryAt <= new Date())
    fail(400, 'INVALID_QUOTE', 'Use a future expiry before the delivery deadline.');
  const assumptions = cost.feasibilityAssessment.assumptions as {
    effectiveFrom?: string;
    effectiveTo?: string;
    region?: string | null;
    unit?: 'HOURS' | 'PIECES';
  };
  if (!assumptions.effectiveFrom || !assumptions.effectiveTo || !assumptions.unit)
    fail(409, 'CAPACITY_CHANGED', 'The feasibility period is missing. Assess the request again.');
  const capacity = await directory.publishedCapacity({
    craft: row.craftSkillId,
    unit: assumptions.unit,
    effectiveFrom: assumptions.effectiveFrom,
    effectiveTo: assumptions.effectiveTo,
    region: assumptions.region ?? undefined,
  });
  if (
    cost.feasibilityAssessment.result === 'FEASIBLE' &&
    (!capacity.capacityKnown ||
      capacity.knownRemaining === null ||
      C.capacityHundredths(capacity.knownRemaining) < C.capacityHundredths(row.quantity.toFixed(2)))
  )
    fail(
      409,
      'CAPACITY_CHANGED',
      'Known capacity changed. Assess feasibility again before issuing.',
    );
  if (
    capacity.capacityKnown &&
    capacity.knownRemaining !== null &&
    C.capacityHundredths(capacity.knownRemaining) < C.capacityHundredths(row.quantity.toFixed(2))
  )
    fail(409, 'CAPACITY_SHORTAGE', 'Known remaining capacity no longer covers this quantity.');
  const buyer = await tx.organization.findUniqueOrThrow({
    where: { id: row.buyerOrganizationId },
    select: { id: true, name: true },
  });
  const selling = C.formatTnd(cost.sellingMillimes);
  const snapshot = cost.snapshot as { unitPriceTnd?: string };
  const previous = await tx.procurementQuote.findFirst({
    where: { rfqId: row.id },
    orderBy: { version: 'desc' },
  });
  const quoteVersion = (previous?.version ?? 0) + 1;
  const terms = quotedTerms({
    quoteVersion,
    buyer: buyer.name,
    title: row.title,
    specification: row.specification,
    craftSkillId: row.craftSkillId,
    quantity: row.quantity,
    unit: 'PIECES',
    unitPriceTnd: snapshot.unitPriceTnd ?? selling,
    totalTnd: selling,
    currency: 'TND',
    deliveryAt: row.deliveryAt.toISOString(),
    deliveryLocation: row.deliveryLocation,
    deliveryConditions: input.deliveryConditions,
    paymentTerms: input.paymentTerms,
    expiresAt: expires.toISOString(),
    taxStatus: 'PENDING_LEGAL_REVIEW',
    taxTnd: '',
    conditional: cost.feasibilityAssessment.result !== 'FEASIBLE',
    feasibilityVersion: cost.feasibilityAssessment.version,
    costVersion: cost.version,
    capacityReserved: false,
    artisanAccepted: false,
    paymentReceived: false,
  });
  const hash = commercialTermsHash(terms);
  const quote = await tx.procurementQuote.create({
    data: {
      rfqId: row.id,
      revisionId:
        (
          await tx.procurementRevision.findFirst({
            where: { rfqId: row.id },
            orderBy: { version: 'desc' },
          })
        )?.id ?? fail(409, 'REVISION_REQUIRED', 'Record the current specification before quoting.'),
      authorId: actor.id,
      version: quoteVersion,
      totalMillimes: cost.sellingMillimes,
      expiresAt: expires,
      feasibilityAssessmentId: cost.feasibilityAssessmentId,
      costEstimateId: cost.id,
      status: 'ISSUED',
      termsSha256: hash,
      snapshot: json({
        ...specificationSnapshot(row),
        buyer,
        buyerTerms: { ...terms, termsSha256: hash },
        internal: {
          components: cost.components,
          subtotalTnd: C.formatTnd(cost.subtotalMillimes),
          marginMethod: cost.marginMethod,
          marginBasisPoints: cost.marginBasisPoints,
          feasibilityResult: cost.feasibilityAssessment.result,
        },
        totalTnd: selling,
        currency: 'TND',
        taxStatus: 'PENDING_LEGAL_REVIEW',
      }),
    },
  });
  const updated = await tx.commercialRfq.update({
    where: { id: row.id },
    data: {
      status: 'QUOTED',
      procurementManaged: true,
      quoteMillimes: cost.sellingMillimes,
      quoteExpiresAt: expires,
      version: { increment: 1 },
    },
  });
  await tx.procurementDocument.create({
    data: {
      rfqId: row.id,
      authorId: actor.id,
      kind: 'QUOTE',
      version:
        ((
          await tx.procurementDocument.findFirst({
            where: { rfqId: row.id, kind: 'QUOTE' },
            orderBy: { version: 'desc' },
          })
        )?.version ?? 0) + 1,
      content: json({
        quoteId: quote.id,
        quoteVersion: quote.version,
        termsSha256: hash,
        provenance: 'SYNTHETIC',
        legalStatus: 'DEMO_ONLY_NOT_A_TAX_OR_LEGAL_DOCUMENT',
      }),
    },
  });
  await procurementAudit(tx, actor, updated, 'quote.issued', quote.id);
  return { id: quote.id, version: updated.version, quoteVersion, termsSha256: hash };
}
export function viewAssessment(row: {
  id: string;
  version: number;
  result: string;
  knownRemaining: { toFixed(digits: number): string } | null;
  shortage: { toFixed(digits: number): string } | null;
  effortMin: { toFixed(digits: number): string } | null;
  effortMax: { toFixed(digits: number): string } | null;
  constraints: Prisma.JsonValue;
  explanation: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    version: row.version,
    result: row.result,
    knownRemaining: dec(row.knownRemaining),
    shortage: dec(row.shortage),
    effortMin: dec(row.effortMin),
    effortMax: dec(row.effortMax),
    constraints: row.constraints as { code: string; known: boolean; detail: string }[],
    explanation: row.explanation,
    reservation: false as const,
    createdAt: row.createdAt.toISOString(),
  };
}
export function viewCost(
  row: {
    id: string;
    version: number;
    feasibilityAssessmentId: string;
    incomplete: boolean;
    status: string;
    subtotalMillimes: bigint;
    sellingMillimes: bigint | null;
    taxStatus: string;
    marginMethod: string;
    components: Prisma.JsonValue;
    createdAt: Date;
  },
  internal: boolean,
) {
  return {
    id: row.id,
    version: row.version,
    feasibilityId: row.feasibilityAssessmentId,
    incomplete: row.incomplete,
    status: row.status,
    subtotalTnd: C.formatTnd(row.subtotalMillimes),
    sellingTnd: row.sellingMillimes === null ? null : C.formatTnd(row.sellingMillimes),
    taxStatus: row.taxStatus,
    marginMethod: row.marginMethod,
    components: internal ? (row.components as Record<string, unknown>[]) : null,
    createdAt: row.createdAt.toISOString(),
  };
}
