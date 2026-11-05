import { z } from 'zod';
import { formatTnd, parseTnd, prorateTnd, addTnd } from './domain.js';
import { capacityHundredths } from './capacity.js';
import type { EligibilityDecision, EligibilityFinding } from './eligibility.js';

/**
 * Explainable production planning.
 *
 * Every rule here is deterministic and framework independent. No health, wearable, strain,
 * disability, religion, ethnicity or decline-history signal is an input to any function in this
 * module, and no function produces a confidence score or probability. Recommendations are
 * advisory: a person reviews them before capacity is offered.
 */

export const PLANNING_POLICY_VERSION = 2;

/**
 * Versioned, explicit scoring weights. Eligibility remains an absolute gate: a tied or even perfect
 * score never admits an ineligible candidate, and no weight can buy back a missing consent,
 * capacity, craft match or membership. Weights only order candidates that are already eligible.
 */
export const rankingWeights = {
  version: 1,
  components: [
    {
      code: 'CAPACITY_COVERAGE',
      weight: 0.5,
      description: 'Share of the requirement this group can cover.',
    },
    {
      code: 'EVIDENCE_COMPLETENESS',
      weight: 0.3,
      description: 'Share of required inputs that are known rather than missing.',
    },
    {
      code: 'COMMITMENT_HEADROOM',
      weight: 0.2,
      description: 'Free capacity relative to the group’s own declared total.',
    },
  ],
} as const;
export type RankingComponentCode = (typeof rankingWeights.components)[number]['code'];

export const requiredRankingInputs = [
  'craftMatch',
  'declarationPresent',
  'remainingKnown',
  'periodCompatible',
] as const;
export const ALLOCATION_POLICY_VERSION = 1;
export const DELIVERY_SIMULATION_VERSION = 1;

// Timezone the business operates in. Deadlines are persisted as instants; day arithmetic is done
// in this zone so an evening deadline does not silently become the previous day.
export const BUSINESS_TIMEZONE = 'Africa/Tunis';

/* ------------------------------------------------------------------ eligibility ranking */

export type RankingCandidate = {
  artisanProfileId: string;
  displayName: string;
  associationName: string | null;
  decision: EligibilityDecision;
  knownRemaining: string | null;
  /** The group's own declared total for the period, used for the headroom ratio. */
  declaredPieces?: number | null;
  unitType: 'HOURS' | 'PIECES' | null;
  periodFrom: string | null;
  periodTo: string | null;
  reasons: EligibilityFinding[];
  unknown: string[];
};

export type RankingTier = 'RECOMMENDED' | 'REVIEW' | 'EXCLUDED';

export type RankedCandidate = RankingCandidate & {
  tier: RankingTier;
  /** Free quantity that can still be allocated, null when the figure is unknown. */
  allocatablePieces: number | null;
  /** Why this candidate sits in its tier, in business language. */
  explanation: string[];
  /** Hard-constraint blockers; empty means nothing explicitly forbids this candidate. */
  blocks: string[];
  /** Normalized 0..1 inputs the score was computed from. */
  normalized: Record<RankingComponentCode, number | null>;
  /** Explicit per-component contribution, so a reviewer can reproduce the total by hand. */
  scoreComponents: {
    code: RankingComponentCode;
    weight: number;
    normalized: number | null;
    contribution: number;
  }[];
  /** Weighted total on a 0..100 scale; null when any required input is missing. */
  score: number | null;
  /** Version of the weight set used, so an old ranking can be re-read. */
  weightVersion: number;
};

function remainingPieces(candidate: RankingCandidate): number | null {
  if (candidate.unitType !== 'PIECES' || candidate.knownRemaining === null) return null;
  const hundredths = capacityHundredths(candidate.knownRemaining);
  if (hundredths <= 0n) return 0;
  const whole = hundredths / 100n;
  return whole > 1000000n ? 1000000 : Number(whole);
}

/**
 * Rank candidates into explanation tiers. Ordering inside a tier is by known remaining capacity
 * (largest first), then by stable profile id. Capacity that is unknown is never sorted as zero and
 * never sorted as infinite: those candidates go to REVIEW and say why.
 */
export function rankCandidates(input: {
  candidates: RankingCandidate[];
  requiredQuantity: number;
  unitCompatible: boolean;
}): {
  policyVersion: number;
  weightVersion: number;
  requiredQuantity: number;
  candidates: RankedCandidate[];
} {
  if (!Number.isInteger(input.requiredQuantity) || input.requiredQuantity <= 0)
    throw new RangeError('A required quantity must be a positive whole number of pieces.');
  const ranked = input.candidates.map((candidate) => {
    const blocks = candidate.reasons
      .filter((reason) => blockingCodes.has(reason.code))
      .map((reason) => reason.code);
    const pieces = remainingPieces(candidate);
    const explanation = candidate.reasons.map((reason) => reason.detail);
    let tier: RankingTier;
    if (candidate.decision === 'INELIGIBLE') tier = 'EXCLUDED';
    else if (candidate.decision === 'NEEDS_REVIEW') tier = 'REVIEW';
    else if (!input.unitCompatible) tier = 'REVIEW';
    else if (pieces === null) tier = 'REVIEW';
    else if (pieces === 0) tier = 'EXCLUDED';
    else tier = 'RECOMMENDED';
    if (tier === 'REVIEW' && !input.unitCompatible)
      explanation.push('Capacity is recorded in a different unit from this order.');
    if (tier === 'EXCLUDED' && pieces === 0 && !blocks.length)
      explanation.push('Known remaining capacity for this period is zero.');
    const capacityCoverage =
      pieces === null
        ? null
        : Math.max(0, Math.min(1, pieces / Math.max(1, input.requiredQuantity)));
    const known = requiredRankingInputs.filter((key) => {
      if (key === 'craftMatch') return !blocks.includes('CRAFT_MISMATCH');
      if (key === 'declarationPresent') return candidate.knownRemaining !== null;
      if (key === 'remainingKnown') return pieces !== null;
      return !blocks.includes('PERIOD_MISMATCH');
    }).length;
    const evidenceCompleteness = known / requiredRankingInputs.length;
    const declaredTotal =
      candidate.declaredPieces && candidate.declaredPieces > 0 ? candidate.declaredPieces : null;
    const headroom =
      pieces === null || declaredTotal === null
        ? null
        : Math.max(0, Math.min(1, pieces / declaredTotal));
    const normalized: Record<RankingComponentCode, number | null> = {
      CAPACITY_COVERAGE: capacityCoverage,
      EVIDENCE_COMPLETENESS: evidenceCompleteness,
      COMMITMENT_HEADROOM: headroom,
    };
    const scoreComponents = rankingWeights.components.map((component) => {
      const value = normalized[component.code];
      return {
        code: component.code,
        weight: component.weight,
        normalized: value,
        contribution: value === null ? 0 : Math.round(value * component.weight * 1000) / 10,
      };
    });
    // A score is only meaningful when every weighted input is known; otherwise it stays null rather
    // than silently scoring a missing input as zero.
    const complete = scoreComponents.every((component) => component.normalized !== null);
    const score = complete
      ? Math.round(
          scoreComponents.reduce((sum, component) => sum + component.contribution, 0) * 10,
        ) / 10
      : null;
    return {
      ...candidate,
      tier,
      allocatablePieces: pieces,
      explanation: [...new Set(explanation)],
      blocks: [...new Set(blocks)],
      normalized,
      scoreComponents,
      score,
      weightVersion: rankingWeights.version,
    };
  });
  const order = { RECOMMENDED: 0, REVIEW: 1, EXCLUDED: 2 } as const;
  ranked.sort((left, right) => {
    const byTier = order[left.tier] - order[right.tier];
    if (byTier !== 0) return byTier;
    if (left.score !== null && right.score !== null && left.score !== right.score)
      return right.score - left.score;
    if (left.score === null && right.score !== null) return 1;
    if (left.score !== null && right.score === null) return -1;
    const leftPieces = left.allocatablePieces;
    const rightPieces = right.allocatablePieces;
    if (leftPieces !== null && rightPieces !== null && leftPieces !== rightPieces)
      return rightPieces - leftPieces;
    if (leftPieces === null && rightPieces !== null) return 1;
    if (leftPieces !== null && rightPieces === null) return -1;
    return left.artisanProfileId.localeCompare(right.artisanProfileId);
  });
  return {
    policyVersion: PLANNING_POLICY_VERSION,
    weightVersion: rankingWeights.version,
    requiredQuantity: input.requiredQuantity,
    candidates: ranked,
  };
}

const blockingCodes = new Set([
  'CRAFT_MISMATCH',
  'PARTICIPATION_INACTIVE',
  'AVAILABILITY_PAUSED',
  'ACCOUNT_INACTIVE',
  'PARTICIPATION_UNAUTHORIZED',
  'PERIOD_MISMATCH',
  'UNIT_INCOMPATIBLE',
  'CAPACITY_FULL',
  'EQUIPMENT_MISSING',
]);

/* ------------------------------------------------------------------ allocation */

export const allocationPlanStates = [
  'DRAFT',
  'REVIEWED',
  'OFFERED',
  'PARTIALLY_ACCEPTED',
  'ACCEPTED',
  'CLOSED',
  'CANCELLED',
] as const;
export type AllocationPlanState = (typeof allocationPlanStates)[number];

export const allocationItemStates = [
  'DRAFT',
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'RELEASED',
] as const;
export type AllocationItemState = (typeof allocationItemStates)[number];

export type AllocationDraftLine = {
  artisanProfileId: string;
  quantity: number;
  /** Known remaining pieces at the time of allocation, null when unknown. */
  availablePieces: number | null;
  unitType: 'HOURS' | 'PIECES' | null;
  /** True when required eligibility facts are missing rather than negative. */
  needsReview: boolean;
};

export type AllocationValidation = {
  lines: {
    artisanProfileId: string;
    quantity: number;
    availablePieces: number | null;
    accepted: boolean;
    violations: string[];
  }[];
  allocated: number;
  unallocated: number;
  required: number;
  overAllocated: boolean;
  violations: string[];
  valid: boolean;
};

/**
 * Validate a multi-group allocation without mutating anything.
 *
 * Invariants: whole non-negative pieces, no over-allocation, no oversubscription of known
 * capacity, no duplicate group, the required quantity decomposes exactly into allocated plus
 * unallocated. Unknown capacity is a review blocker, never silently accepted and never treated as
 * zero. HOURS capacity can never be converted to pieces.
 */
export function validateAllocation(input: {
  requiredQuantity: number;
  lines: AllocationDraftLine[];
  materialReadiness?: 'READY' | 'NOT_READY' | 'UNKNOWN';
}): AllocationValidation {
  const { requiredQuantity, lines } = input;
  if (!Number.isInteger(requiredQuantity) || requiredQuantity <= 0)
    throw new RangeError('A required quantity must be a positive whole number of pieces.');
  const seen = new Set<string>();
  const violations: string[] = [];
  if (input.materialReadiness && input.materialReadiness !== 'READY')
    violations.push(
      input.materialReadiness === 'UNKNOWN' ? 'MATERIAL_READINESS_UNKNOWN' : 'MATERIAL_NOT_READY',
    );
  let allocated = 0;
  const checked = lines.map((line) => {
    const lineViolations: string[] = [];
    if (!Number.isInteger(line.quantity) || line.quantity < 0)
      lineViolations.push('QUANTITY_INVALID');
    if (seen.has(line.artisanProfileId)) lineViolations.push('DUPLICATE_GROUP');
    seen.add(line.artisanProfileId);
    if (line.unitType !== 'PIECES') lineViolations.push('UNIT_INCOMPATIBLE');
    if (line.needsReview) lineViolations.push('ELIGIBILITY_INCOMPLETE');
    if (line.unitType === 'PIECES') {
      if (line.availablePieces === null) lineViolations.push('CAPACITY_UNKNOWN');
      else if (line.quantity > line.availablePieces) lineViolations.push('CAPACITY_EXCEEDED');
    }
    if (Number.isInteger(line.quantity) && line.quantity > 0) allocated += line.quantity;
    return {
      artisanProfileId: line.artisanProfileId,
      quantity: line.quantity,
      availablePieces: line.availablePieces,
      accepted: lineViolations.length === 0 && line.quantity > 0,
      violations: lineViolations,
    };
  });
  if (allocated > requiredQuantity) violations.push('OVER_ALLOCATED');
  for (const line of checked) for (const code of line.violations) violations.push(code);
  const unallocated = requiredQuantity - allocated;
  return {
    lines: checked,
    allocated,
    unallocated,
    required: requiredQuantity,
    overAllocated: allocated > requiredQuantity,
    violations: [...new Set(violations)],
    valid: violations.length === 0,
  };
}

/**
 * Greedy suggestion over already-ranked candidates. It fills the requirement in rank order and
 * stops at known capacity. It never invents capacity for a group whose figure is unknown, and it
 * reports the remainder rather than oversubscribing. This is a starting point for a person to edit.
 */
export function suggestAllocation(input: {
  requiredQuantity: number;
  candidates: RankedCandidate[];
  limit?: number;
}): { lines: AllocationDraftLine[]; unallocated: number; notes: string[] } {
  const limit = input.limit ?? 8;
  const lines: AllocationDraftLine[] = [];
  const notes: string[] = [];
  let remaining = input.requiredQuantity;
  for (const candidate of input.candidates) {
    if (remaining <= 0) break;
    if (lines.length >= limit) {
      notes.push('The suggestion is limited to eight groups. Add further groups by hand.');
      break;
    }
    if (candidate.tier !== 'RECOMMENDED' || candidate.allocatablePieces === null) continue;
    const quantity = Math.min(remaining, candidate.allocatablePieces);
    if (quantity <= 0) continue;
    lines.push({
      artisanProfileId: candidate.artisanProfileId,
      quantity,
      availablePieces: candidate.allocatablePieces,
      unitType: 'PIECES',
      needsReview: false,
    });
    remaining -= quantity;
  }
  if (remaining > 0)
    notes.push(
      'Known eligible capacity does not cover the requirement. The remainder stays unallocated.',
    );
  return { lines, unallocated: remaining, notes };
}

/* ------------------------------------------------------------------ reallocation */

/**
 * Quantities that freeing one allocation item's reservation would return to the pool.
 * Accepted work is never released by reallocation: only offered, expired or declined quantity is.
 */
export function releasableQuantity(item: {
  quantity: number;
  state: AllocationItemState;
  accepted: boolean;
}): number {
  if (item.accepted || item.state === 'ACCEPTED') return 0;
  if (!['DECLINED', 'EXPIRED', 'RELEASED', 'OFFERED', 'DRAFT'].includes(item.state)) return 0;
  return Math.max(0, Math.trunc(item.quantity));
}

/* ------------------------------------------------------------------ pricing suggestion */

export type PricingAssumptions = {
  quantity: number;
  artisanUnitTnd: string;
  materialsUnitTnd: string;
  qualityUnitTnd: string;
  packagingUnitTnd: string;
  transportFixedTnd: string;
  overheadFixedTnd: string;
  contingencyPercent: number;
  effortMinutesPerPiece: number | null;
  effortRange?: { min: number; max: number } | null;
  assumptionSource?: string;
};

export type PricingSuggestion = {
  policyVersion: number;
  quantity: number;
  components: {
    code: string;
    label: string;
    amountTnd: string;
    basis: 'FIXED' | 'VARIABLE';
  }[];
  artisanTotalTnd: string;
  materialTotalTnd: string;
  subtotalTnd: string;
  contingencyTnd: string;
  totalCostTnd: string;
  unitCostTnd: string;
  /** Applied buyer price when a contribution rate is supplied. */
  proposedBuyerPriceTnd: string | null;
  plannedContributionTnd: string | null;
  plannedContributionPercent: number | null;
  effectiveHourlyTnd: string | null;
  effortRange: { min: number; max: number } | null;
  assumptionSource: string;
  /** Fields whose evidence is missing, so the figure must stay advisory. */
  missing: string[];
  advisory: true;
  limitations: string[];
};

const rate = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,3})?$/);

export const pricingAssumptionSchema = z
  .object({
    quantity: z.number().int().positive().max(1000000),
    artisanUnitTnd: rate,
    materialsUnitTnd: rate,
    qualityUnitTnd: rate,
    packagingUnitTnd: rate,
    transportFixedTnd: rate,
    overheadFixedTnd: rate,
    contingencyPercent: z.number().min(0).max(100),
    effortMinutesPerPiece: z.number().int().positive().max(100000).nullable(),
    contributionPercent: z.number().min(0).max(99).optional(),
    effortRange: z
      .object({ min: z.number().int().positive(), max: z.number().int().positive() })
      .refine((v) => v.max >= v.min, 'Maximum effort must cover minimum effort.')
      .nullable()
      .optional(),
    assumptionSource: z
      .string()
      .trim()
      .min(10)
      .max(500)
      .default('ILLUSTRATIVE: editable planning assumptions, not validated rates.'),
  })
  .strict();

/**
 * Deterministic advisory pricing. Money is exact millimes; every fixed amount is charged once and
 * every per-piece amount is prorated once. The result never mutates a quotation: revising an
 * issued or accepted quote remains the versioned commercial workflow.
 */
export function suggestPricing(
  input: PricingAssumptions & { contributionPercent?: number },
): PricingSuggestion {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    throw new RangeError('A quantity must be a positive whole number of pieces.');
  if (
    !Number.isFinite(input.contingencyPercent) ||
    input.contingencyPercent < 0 ||
    input.contingencyPercent > 100
  )
    throw new RangeError('A contingency percent must be between 0 and 100.');
  const quantity = BigInt(input.quantity);
  const variable = (
    code: string,
    label: string,
    value: string,
  ): PricingSuggestion['components'][number] => ({
    code,
    label,
    basis: 'VARIABLE',
    amountTnd: formatTnd(prorateTnd(parseTnd(value), quantity, 1n)),
  });
  const fixed = (
    code: string,
    label: string,
    value: string,
  ): PricingSuggestion['components'][number] => ({
    code,
    label,
    basis: 'FIXED',
    amountTnd: formatTnd(parseTnd(value)),
  });
  const components = [
    variable('ARTISAN_COMPENSATION', 'Artisan compensation', input.artisanUnitTnd),
    variable('MATERIALS', 'Materials', input.materialsUnitTnd),
    variable('QUALITY', 'Quality assurance', input.qualityUnitTnd),
    variable('PACKAGING', 'Packaging', input.packagingUnitTnd),
    fixed('TRANSPORT', 'Transport', input.transportFixedTnd),
    fixed('OVERHEAD', 'Overheads', input.overheadFixedTnd),
  ];
  const subtotal = components.reduce((sum, line) => addTnd(sum, parseTnd(line.amountTnd)), 0n);
  const contingency = prorateTnd(
    subtotal,
    BigInt(Math.round(input.contingencyPercent * 100)),
    10000n,
  );
  const total = addTnd(subtotal, contingency);
  const unitCost = prorateTnd(total, 1n, quantity);
  const contributionPercent = input.contributionPercent;
  const price =
    contributionPercent === undefined
      ? null
      : prorateTnd(total, 10000n, BigInt(10000 - Math.round(contributionPercent * 100)));
  const missing: string[] = [];
  if (!input.effortMinutesPerPiece) missing.push('MEASURED_EFFORT');
  if (!input.effortRange) missing.push('EFFORT_RANGE');
  const effectiveHourly =
    input.effortMinutesPerPiece && input.effortMinutesPerPiece > 0
      ? formatTnd(
          prorateTnd(parseTnd(input.artisanUnitTnd), 60n, BigInt(input.effortMinutesPerPiece)),
        )
      : null;
  return {
    policyVersion: PLANNING_POLICY_VERSION,
    quantity: input.quantity,
    components,
    artisanTotalTnd: components[0].amountTnd,
    materialTotalTnd: components[1].amountTnd,
    subtotalTnd: formatTnd(subtotal),
    contingencyTnd: formatTnd(contingency),
    totalCostTnd: formatTnd(total),
    unitCostTnd: formatTnd(unitCost),
    proposedBuyerPriceTnd: price === null ? null : formatTnd(price),
    plannedContributionTnd: price === null ? null : formatTnd(price - total),
    plannedContributionPercent: contributionPercent ?? null,
    effectiveHourlyTnd: effectiveHourly,
    effortRange: input.effortRange ?? null,
    assumptionSource:
      input.assumptionSource ?? 'ILLUSTRATIVE: editable assumptions, not validated rates.',
    missing,
    advisory: true,
    limitations: [
      'This is an advisory calculation from the assumptions shown. It is not a quotation.',
      'No measured time study exists for these figures unless the effort source says so.',
      ...(missing.includes('MEASURED_EFFORT')
        ? ['Observed effort per piece is unknown, so effective hourly pay is unavailable.']
        : []),
      'Planned contribution is modelled, not realised profit or collected cash.',
    ],
  };
}

/* ------------------------------------------------------------------ delivery simulation */

export type DeliveryScenario = {
  artisanProfileId: string;
  quantity: number;
  /** Whole pieces per week this group can produce, when the figure is supported. */
  weeklyPieces: number | null;
  /** Accepted work already promised in the same window. */
  committedPieces: number;
  committedWeeks: number;
  availableFrom: string;
  materialReadyAt?: string | null;
  materialReadiness?: 'READY' | 'NOT_READY' | 'UNKNOWN';
};

export type DeliveryComparison = {
  simulationVersion: number;
  policyVersion: number;
  requiredQuantity: number;
  deadline: string;
  startDate: string;
  scenarios: {
    name: string;
    lines: {
      artisanProfileId: string;
      quantity: number;
      weeklyPieces: number | null;
      committedPieces: number;
      weeksNeeded: number | null;
      note: string | null;
    }[];
    earliestCompletion: string | null;
    capacityShortage: boolean;
    unallocated: number;
    deadlineFeasible: 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';
    deadlineGapDays: number | null;
    unknowns: string[];
  }[];
  assumptions: string[];
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function weeklyThroughput(line: DeliveryScenario): number | null {
  if (line.weeklyPieces === null) return null;
  if (!Number.isFinite(line.weeklyPieces) || line.weeklyPieces <= 0) return null;
  const capacity = line.weeklyPieces * Math.max(1, line.committedWeeks);
  const free = capacity - line.committedPieces;
  return free <= 0 ? 0 : free / Math.max(1, line.committedWeeks);
}

/**
 * Compare plans with deterministic weekly arithmetic. Groups are assumed to work in parallel, so a
 * scenario finishes when its slowest line finishes. Unknown throughput yields UNKNOWN, never an
 * optimistic guess, and every assumption used is returned with the result.
 */
export function simulateDelivery(input: {
  requiredQuantity: number;
  deadline: string;
  startDate: string;
  scenarios: { name: string; lines: DeliveryScenario[] }[];
}): DeliveryComparison {
  const start = new Date(input.startDate);
  const deadline = new Date(input.deadline);
  if (Number.isNaN(start.getTime()) || Number.isNaN(deadline.getTime()))
    throw new RangeError('Start and deadline must be valid instants.');
  const scenarios = input.scenarios.map((scenario) => {
    const unknowns: string[] = [];
    let latestCompletion = start.getTime();
    let latestWeeks = 0;
    let unknown = false;
    let allocated = 0;
    const lines = scenario.lines.map((line) => {
      allocated += Math.max(0, Math.trunc(line.quantity));
      const throughput = weeklyThroughput(line);
      if (throughput === null) {
        unknowns.push(`WEEKLY_CAPACITY_UNKNOWN:${line.artisanProfileId}`);
        unknown = true;
        return {
          artisanProfileId: line.artisanProfileId,
          quantity: line.quantity,
          weeklyPieces: line.weeklyPieces,
          committedPieces: line.committedPieces,
          weeksNeeded: null,
          note: 'No supported weekly throughput figure exists for this group.',
        };
      }
      if (throughput === 0) {
        unknowns.push(`NO_FREE_WEEKLY_CAPACITY:${line.artisanProfileId}`);
        unknown = true;
        return {
          artisanProfileId: line.artisanProfileId,
          quantity: line.quantity,
          weeklyPieces: line.weeklyPieces,
          committedPieces: line.committedPieces,
          weeksNeeded: null,
          note: 'Accepted work already consumes the documented weekly capacity.',
        };
      }
      if (
        (line.materialReadiness ?? 'UNKNOWN') === 'UNKNOWN' ||
        (line.materialReadiness === 'NOT_READY' && !line.materialReadyAt)
      ) {
        unknowns.push(`MATERIAL_READINESS_UNKNOWN:${line.artisanProfileId}`);
        unknown = true;
      }
      const weeks = Math.ceil(line.quantity / throughput);
      const readyAt = line.materialReadyAt
        ? new Date(line.materialReadyAt).getTime()
        : start.getTime();
      const available = new Date(line.availableFrom).getTime();
      if (!Number.isFinite(readyAt) || !Number.isFinite(available)) unknown = true;
      else
        latestCompletion = Math.max(
          latestCompletion,
          Math.max(start.getTime(), readyAt, available) + weeks * WEEK_MS,
        );
      if (weeks > latestWeeks) latestWeeks = weeks;
      return {
        artisanProfileId: line.artisanProfileId,
        quantity: line.quantity,
        weeklyPieces: line.weeklyPieces,
        committedPieces: line.committedPieces,
        weeksNeeded: weeks,
        note: null,
      };
    });
    const unallocated = Math.max(0, input.requiredQuantity - allocated);
    const completion = unknown ? null : new Date(latestCompletion);
    const gapDays =
      completion === null ? null : Math.ceil((deadline.getTime() - completion.getTime()) / DAY_MS);
    let feasible: 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';
    if (unknown) feasible = 'UNKNOWN';
    else
      feasible =
        unallocated === 0 &&
        allocated === input.requiredQuantity &&
        (completion as Date) <= deadline
          ? 'FEASIBLE'
          : 'INFEASIBLE';
    return {
      name: scenario.name,
      lines,
      earliestCompletion: completion === null ? null : completion.toISOString(),
      capacityShortage: unknown || unallocated > 0,
      unallocated,
      deadlineFeasible: feasible,
      deadlineGapDays: gapDays,
      unknowns: [...new Set(unknowns)],
    };
  });
  return {
    simulationVersion: DELIVERY_SIMULATION_VERSION,
    policyVersion: PLANNING_POLICY_VERSION,
    requiredQuantity: input.requiredQuantity,
    deadline: deadline.toISOString(),
    startDate: start.toISOString(),
    scenarios,
    assumptions: [
      'Groups work in parallel; a plan finishes when its slowest line finishes.',
      'Weekly throughput is the documented figure minus accepted commitments already promised.',
      'Whole weeks are rounded up; part weeks are not credited.',
      'Material, sample and quality allowances are only applied when explicitly configured.',
      'No throughput is inferred for a group whose weekly capacity is unknown.',
    ],
  };
}

/* ------------------------------------------------------------------ overrides */

export const allocationOverrideSchema = z
  .object({
    planId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    version: z.number().int().positive(),
    artisanProfileId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    quantity: z.number().int().positive().max(1000000),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export type OverrideRecord = {
  id: string;
  planId: string;
  originalRecommendation: string;
  selectedAlternative: string;
  actingUser: string;
  businessScope: string;
  explanation: string;
  decisionVersion: number;
  createdAt: string;
};

/* ------------------------------------------------------------------ shared views */

export type PlanningCandidateView = RankedCandidate & {
  craftName: string;
};

export type AllocationPlanView = {
  id: string;
  orderId: string;
  version: number;
  state: AllocationPlanState;
  requiredQuantity: number;
  policyVersion: number;
  createdAt: string;
  reviewedAt: string | null;
  items: {
    id: string;
    artisanProfileId: string;
    displayName: string;
    quantity: number;
    state: AllocationItemState;
    offerId: string | null;
    releasedQuantity: number;
  }[];
  totals: {
    allocated: number;
    offered: number;
    accepted: number;
    declined: number;
    expired: number;
    unallocated: number;
    reconciles: boolean;
  };
  overrides: OverrideRecord[];
};

export type PlanningWorkspaceView = {
  orderId: string;
  orderVersion: number;
  craftSkillId: string;
  craftName: string;
  requiredQuantity: number;
  deadline: string;
  materialReadiness: 'READY' | 'NOT_READY' | 'UNKNOWN';
  planningPolicyVersion: number;
  candidates: PlanningCandidateView[];
  rankingWeights: typeof rankingWeights;
  ranked: { policyVersion: number; weightVersion: number; candidates: RankedCandidate[] };
  suggestion: { lines: AllocationDraftLine[]; unallocated: number; notes: string[] };
  plans: AllocationPlanView[];
  truncated: boolean;
  limitations: string[];
};

export const allocationPlanCreateSchema = z
  .object({
    version: z.number().int().positive(),
    requiredQuantity: z.number().int().positive().max(1000000),
    materialAssumptions: z
      .object({
        readiness: z.enum(['READY', 'NOT_READY', 'UNKNOWN']),
        reference: z.string().trim().min(10).max(1000),
      })
      .default({ readiness: 'UNKNOWN', reference: 'Material readiness has not been reviewed.' }),
    lines: z
      .array(
        z
          .object({
            artisanProfileId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
            quantity: z.number().int().positive().max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

export const allocationPlanReviewSchema = z
  .object({ version: z.number().int().positive(), confirm: z.literal(true) })
  .strict();

export const allocationOfferSchema = z
  .object({
    version: z.number().int().positive(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AllocationOfferInput = z.infer<typeof allocationOfferSchema>;

export const reallocationSchema = z
  .object({
    version: z.number().int().positive(),
    artisanProfileIds: z
      .array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/))
      .max(40)
      .default([]),
  })
  .strict();
export type ReallocationInput = z.infer<typeof reallocationSchema>;

export const deliverySimulationSchema = z
  .object({
    reviewedAssumptions: z
      .object({
        reference: z.string().trim().min(20).max(1000),
        leadTimeDays: z.number().int().min(0).max(365),
        bufferDays: z.number().int().min(0).max(365),
      })
      .strict()
      .optional(),
    version: z.number().int().positive(),
    startDate: z.iso.datetime({ offset: true }),
    deadline: z.iso.datetime({ offset: true }),
    scenarios: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(80),
            lines: z
              .array(
                z
                  .object({
                    artisanProfileId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
                    quantity: z.number().int().min(0).max(1000000),
                    weeklyPieces: z.number().int().positive().max(1000000).nullable(),
                    committedPieces: z.number().int().min(0).max(1000000).default(0),
                    committedWeeks: z.number().int().positive().max(104).default(1),
                    availableFrom: z.iso.datetime({ offset: true }),
                    materialReadiness: z.enum(['READY', 'NOT_READY', 'UNKNOWN']).default('UNKNOWN'),
                    materialReadyAt: z.iso.datetime({ offset: true }).nullable().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(40),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

export const planningAuditQuerySchema = z
  .object({ purpose: z.string().trim().min(10).max(500) })
  .strict();
export const pricingHandoffSchema = z
  .object({
    assumptions: pricingAssumptionSchema,
    targetRfqId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    targetVersion: z.number().int().positive(),
    feasibilityId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    approveForCosting: z.literal(true),
    reviewReference: z.string().trim().min(20).max(1000),
  })
  .strict();
