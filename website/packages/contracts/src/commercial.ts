import { z } from 'zod';
import { capacityDecimal, capacityHundredths } from './capacity.js';
import { tndSchema } from './commerce/contracts.js';
import { parseTnd, addTnd, prorateTnd, formatTnd } from './domain.js';

export const feasibilityResults = ['FEASIBLE', 'NOT_FEASIBLE', 'NEEDS_REVIEW'] as const;
export const costCategories = [
  'MATERIALS',
  'ARTISAN_LABOR',
  'OVERHEAD',
  'PACKAGING',
  'QUALITY_ASSURANCE',
  'LOGISTICS',
  'PLATFORM_FEE',
  'CONTINGENCY',
] as const;
export const requiredCostCategories = [
  'MATERIALS',
  'ARTISAN_LABOR',
  'QUALITY_ASSURANCE',
  'LOGISTICS',
  'OVERHEAD',
  'CONTINGENCY',
] as const;
export const marginMethods = ['NONE', 'MARKUP_ON_COST', 'MARGIN_ON_SELLING_PRICE'] as const;
const text = z
  .string()
  .trim()
  .min(2)
  .max(500)
  .refine((value) => Array.from(value).every((c) => c.charCodeAt(0) >= 32), 'Use plain text.');
const version = z.number().int().positive();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const rate = z.string().regex(/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/);
export const effortAssumptionSchema = z
  .object({
    craftSkillId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    unitType: z.enum(['HOURS', 'PIECES']),
    minPerUnit: rate,
    maxPerUnit: rate,
    source: text,
  })
  .strict()
  .refine(
    (value) => capacityHundredths(value.maxPerUnit) >= capacityHundredths(value.minPerUnit),
    'The maximum effort cannot be below the minimum.',
  );
export const feasibilityRequestSchema = z
  .object({
    version,
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveTo: z.iso.datetime({ offset: true }),
    unit: z.enum(['HOURS', 'PIECES']),
    region: z.string().trim().min(2).max(120).optional(),
    materialStatus: z.enum(['UNKNOWN', 'CONFIRMED_AVAILABLE', 'SHORT']),
    materialSource: text.optional(),
    logisticsLeadDays: z.number().int().min(0).max(365).optional(),
    calendarCleared: z.boolean(),
    calendarSource: text.optional(),
  })
  .strict()
  .refine(
    (value) => new Date(value.effectiveTo) > new Date(value.effectiveFrom),
    'The production period must end after it starts.',
  )
  .refine(
    (value) => value.materialStatus === 'UNKNOWN' || value.materialSource !== undefined,
    'Record the source of a material attestation.',
  )
  .refine(
    (value) => !value.calendarCleared || value.calendarSource !== undefined,
    'Record the source of a calendar clearance.',
  );
export const costEstimateSchema = z
  .object({
    version,
    feasibilityId: id,
    marginMethod: z.enum(marginMethods),
    marginBasisPoints: z.number().int().min(0).max(10000),
    lines: z
      .array(
        z
          .object({
            category: z.enum(costCategories),
            basis: z.enum(['FIXED', 'VARIABLE']),
            rateTnd: tndSchema,
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const costedQuoteSchema = z
  .object({
    version,
    costEstimateId: id,
    expiresAt: z.iso.datetime({ offset: true }),
    paymentTerms: text,
    deliveryConditions: text,
  })
  .strict();
export const quoteRejectSchema = z.object({ version, quoteId: id, reason: text }).strict();
export const quoteStandings = ['ISSUED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'] as const;
export function quoteStanding(input: {
  version: number;
  expiresAt: Date;
  accepted: boolean;
  rejected: boolean;
  latestVersion: number;
  now?: Date;
}): (typeof quoteStandings)[number] {
  if (input.accepted) return 'ACCEPTED';
  if (input.rejected) return 'REJECTED';
  if (input.version < input.latestVersion) return 'SUPERSEDED';
  if (input.expiresAt <= (input.now ?? new Date())) return 'EXPIRED';
  return 'ISSUED';
}
export type FeasibilityConstraint = { code: string; known: boolean; detail: string };
export type FeasibilityDecision = {
  result: (typeof feasibilityResults)[number];
  knownRemaining: string | null;
  shortage: string | null;
  effortMin: string | null;
  effortMax: string | null;
  constraints: FeasibilityConstraint[];
  explanation: string;
  reservation: false;
};
type Effort = { minPerUnit: string; maxPerUnit: string; version: number; source: string } | null;
export function assessFeasibility(input: {
  quantity: number;
  unit: 'HOURS' | 'PIECES';
  deliveryAt: Date;
  periodFrom: Date;
  periodTo: Date;
  capacityKnown: boolean;
  knownRemaining: string | null;
  capacityConstraints: string[];
  effort: Effort;
  materialStatus: 'UNKNOWN' | 'CONFIRMED_AVAILABLE' | 'SHORT';
  sample: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  logisticsLeadDays: number | null;
  calendarCleared: boolean;
}): FeasibilityDecision {
  const constraints: FeasibilityConstraint[] = [];
  const hard = (code: string, detail: string) => constraints.push({ code, known: true, detail });
  const unknown = (code: string, detail: string) =>
    constraints.push({ code, known: false, detail });
  if (input.unit !== 'PIECES')
    hard(
      'INCOMPATIBLE_UNIT',
      'The request quantity is in pieces. Hours are not converted into pieces.',
    );
  if (input.periodTo > input.deliveryAt || input.periodFrom >= input.deliveryAt)
    hard(
      'DELIVERY_WINDOW',
      'The production period does not finish before the requested delivery instant.',
    );
  let shortage: string | null = null;
  if (!input.capacityKnown || input.knownRemaining === null) {
    unknown(
      'CAPACITY_UNKNOWN',
      input.capacityConstraints.length
        ? `Published capacity is incomplete: ${input.capacityConstraints.join(', ')}.`
        : 'No fully known production capacity matches this craft, unit and period.',
    );
  } else {
    const requested = capacityHundredths(input.quantity.toFixed(2));
    const available = capacityHundredths(input.knownRemaining);
    if (requested > available) {
      shortage = capacityDecimal(requested - available);
      hard(
        'CAPACITY_SHORTAGE',
        `Known remaining capacity is ${input.knownRemaining} pieces. The shortage is ${shortage} pieces.`,
      );
    }
  }
  let effortMin: string | null = null;
  let effortMax: string | null = null;
  if (!input.effort)
    unknown('EFFORT_UNKNOWN', 'No approved effort reference exists for this craft.');
  else if (input.unit === 'PIECES') {
    const scale = (value: string) =>
      capacityDecimal(capacityHundredths(value) * BigInt(input.quantity));
    effortMin = scale(input.effort.minPerUnit);
    effortMax = scale(input.effort.maxPerUnit);
  }
  if (input.materialStatus === 'UNKNOWN')
    unknown('MATERIAL_AVAILABILITY_UNKNOWN', 'Material stock was not attested.');
  if (input.materialStatus === 'SHORT')
    hard('MATERIAL_SHORTAGE', 'The recorded material attestation says supply is short.');
  if (input.sample === 'NONE' || input.sample === 'PENDING')
    unknown('SAMPLE_APPROVAL_UNKNOWN', 'No approved sample matches the current specification.');
  if (input.sample === 'REJECTED') hard('SAMPLE_REJECTED', 'The current sample was rejected.');
  if (input.sample === 'CHANGES_REQUESTED')
    hard('SAMPLE_CHANGES_REQUESTED', 'The current sample still requires changes.');
  if (input.logisticsLeadDays === null)
    unknown('LOGISTICS_UNKNOWN', 'No logistics lead time was supplied.');
  if (!input.calendarCleared)
    unknown('CALENDAR_UNKNOWN', 'No reviewed calendar clearance was recorded.');
  const blocking = constraints.some((item) =>
    [
      'INCOMPATIBLE_UNIT',
      'DELIVERY_WINDOW',
      'CAPACITY_SHORTAGE',
      'MATERIAL_SHORTAGE',
      'SAMPLE_REJECTED',
      'SAMPLE_CHANGES_REQUESTED',
    ].includes(item.code),
  );
  const result = blocking
    ? 'NOT_FEASIBLE'
    : constraints.some((item) => !item.known)
      ? 'NEEDS_REVIEW'
      : 'FEASIBLE';
  return {
    result,
    knownRemaining: input.capacityKnown ? input.knownRemaining : null,
    shortage,
    effortMin,
    effortMax,
    constraints,
    explanation:
      result === 'FEASIBLE'
        ? 'Every required capacity, effort, material, sample, logistics and calendar input is known, and the known remaining pieces cover the request. This is not a reservation.'
        : result === 'NOT_FEASIBLE'
          ? 'A known constraint blocks production. This assessment does not assign artisans or reserve capacity.'
          : 'Important inputs are unknown, so the request is not labeled feasible. Unknown capacity is not treated as available.',
    reservation: false,
  };
}
export type PricedCost = {
  components: {
    category: (typeof costCategories)[number];
    basis: 'FIXED' | 'VARIABLE';
    rateTnd: string;
    amountTnd: string;
  }[];
  subtotalTnd: string;
  sellingTnd: string | null;
  unitPriceTnd: string | null;
  marginMethod: (typeof marginMethods)[number];
  marginBasisPoints: number;
  incomplete: boolean;
  missing: string[];
  taxStatus: 'PENDING_LEGAL_REVIEW';
};
export function priceCost(input: {
  quantity: number;
  marginMethod: (typeof marginMethods)[number];
  marginBasisPoints: number;
  lines: {
    category: (typeof costCategories)[number];
    basis: 'FIXED' | 'VARIABLE';
    rateTnd: string;
  }[];
}): PricedCost {
  if (new Set(input.lines.map((line) => line.category)).size !== input.lines.length)
    throw new RangeError('Each cost category can appear once.');
  if (input.marginMethod === 'MARGIN_ON_SELLING_PRICE' && input.marginBasisPoints >= 10000)
    throw new RangeError('A selling-price margin must stay below 100 percent.');
  const components = input.lines.map((line) => {
    const rate = parseTnd(line.rateTnd);
    const amount = line.basis === 'FIXED' ? rate : prorateTnd(rate, BigInt(input.quantity), 1n);
    return { ...line, rateTnd: formatTnd(rate), amountTnd: formatTnd(amount), amount };
  });
  const subtotal = components.reduce((sum, line) => addTnd(sum, line.amount), 0n);
  const missing = requiredCostCategories.filter(
    (category) => !components.some((line) => line.category === category),
  );
  const incomplete = missing.length > 0;
  let selling: bigint | null = null;
  if (!incomplete && input.marginMethod === 'NONE') selling = subtotal;
  if (!incomplete && input.marginMethod === 'MARKUP_ON_COST')
    selling = addTnd(subtotal, prorateTnd(subtotal, BigInt(input.marginBasisPoints), 10000n));
  if (!incomplete && input.marginMethod === 'MARGIN_ON_SELLING_PRICE')
    selling = prorateTnd(subtotal, 10000n, BigInt(10000 - input.marginBasisPoints));
  return {
    components: components.map(({ amount, ...line }) => line),
    subtotalTnd: formatTnd(subtotal),
    sellingTnd: selling === null ? null : formatTnd(selling),
    unitPriceTnd:
      selling === null ? null : formatTnd(prorateTnd(selling, 1n, BigInt(input.quantity))),
    marginMethod: input.marginMethod,
    marginBasisPoints: input.marginBasisPoints,
    incomplete,
    missing: [...missing],
    taxStatus: 'PENDING_LEGAL_REVIEW',
  };
}
