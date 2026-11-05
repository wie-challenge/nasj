import { z } from 'zod';

export const eligibilityDecisions = ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'] as const;
export type EligibilityDecision = (typeof eligibilityDecisions)[number];
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

export type EligibilityFacts = {
  craftMatch: boolean;
  participantActive: boolean;
  availabilityAvailable: boolean;
  accountLinked: boolean;
  accountActive: boolean;
  participationAuthorized: boolean;
  periodKnown: boolean;
  periodCompatible: boolean;
  declarationPresent: boolean;
  unitCompatible: boolean;
  availabilityKnown: boolean;
  remaining: string | null;
  capacityConstraints: string[];
  restrictionsReviewed: boolean;
  equipmentRequired: string | null;
  equipmentHeld: boolean;
  feasibilityFeasible: boolean;
};
export type EligibilityFinding = { code: string; detail: string };

// Deterministic business rules only. Health, wearables, fatigue, disability, ethnicity,
// religion, decline history and the absence of a login are not inputs.
export function assessCandidate(facts: EligibilityFacts): {
  decision: EligibilityDecision;
  reasons: EligibilityFinding[];
  unknown: string[];
} {
  const reasons: EligibilityFinding[] = [];
  const unknown: string[] = [];
  let blocked = false;
  const block = (code: string, detail: string) => {
    blocked = true;
    reasons.push({ code, detail });
  };
  if (!facts.craftMatch)
    block('CRAFT_MISMATCH', 'The artisan does not have the active craft required by this order.');
  else reasons.push({ code: 'CRAFT_MATCH', detail: 'The required craft matches an active skill.' });
  if (!facts.participantActive) block('PARTICIPATION_INACTIVE', 'Participation is not active.');
  else reasons.push({ code: 'PARTICIPATION_ACTIVE', detail: 'Participation is active.' });
  if (!facts.availabilityAvailable)
    block('AVAILABILITY_PAUSED', 'The artisan has paused availability.');
  if (facts.accountLinked && !facts.accountActive)
    block('ACCOUNT_INACTIVE', 'The linked account is not active and verified.');
  if (!facts.participationAuthorized)
    block(
      'PARTICIPATION_UNAUTHORIZED',
      facts.accountLinked
        ? 'Active artisan profile consent is missing.'
        : 'A current participation authorization is missing.',
    );
  else if (!facts.accountLinked)
    reasons.push({
      code: 'ACCOUNTLESS_PARTICIPATION',
      detail: 'The artisan participates without a digital account. That is not a penalty.',
    });
  if (!facts.periodKnown) unknown.push('PERIOD_UNKNOWN');
  else if (!facts.periodCompatible)
    block('PERIOD_MISMATCH', 'No piece-capacity declaration matches this production period.');
  else {
    reasons.push({
      code: 'PERIOD_COMPATIBLE',
      detail: 'A piece-capacity declaration matches the production period.',
    });
    if (!facts.declarationPresent) unknown.push('CAPACITY_UNKNOWN');
    else if (!facts.unitCompatible)
      block('UNIT_INCOMPATIBLE', 'Known capacity uses a different unit from this order.');
    else if (!facts.availabilityKnown) unknown.push('CAPACITY_UNKNOWN');
    else {
      const hundredths = Number(facts.remaining ?? '0') * 100;
      if (!Number.isFinite(hundredths) || hundredths <= 0)
        block('CAPACITY_FULL', 'Known remaining capacity for this period is zero.');
      else if (facts.capacityConstraints.length) unknown.push('CAPACITY_CONSTRAINT');
      else
        reasons.push({
          code: 'CAPACITY_SUFFICIENT',
          detail: `Known remaining capacity is ${facts.remaining}.`,
        });
    }
  }
  if (facts.equipmentRequired && !facts.equipmentHeld)
    block('EQUIPMENT_MISSING', 'A stated equipment requirement is not on the artisan profile.');
  else if (facts.equipmentRequired)
    reasons.push({
      code: 'EQUIPMENT_MATCH',
      detail: 'The stated equipment requirement is on the profile.',
    });
  if (!facts.feasibilityFeasible) unknown.push('FEASIBILITY_NOT_FEASIBLE');
  if (!facts.restrictionsReviewed) unknown.push('PRODUCT_RESTRICTIONS_UNVERIFIED');
  else
    reasons.push({
      code: 'PRODUCT_RESTRICTIONS_ATTESTED',
      detail: 'An operator recorded that no further product restriction is on file.',
    });
  for (const code of unknown) reasons.push({ code, detail: unknownDetail(code) });
  return {
    decision: blocked ? 'INELIGIBLE' : unknown.length ? 'NEEDS_REVIEW' : 'ELIGIBLE',
    reasons,
    unknown,
  };
}
function unknownDetail(code: string) {
  if (code === 'PERIOD_UNKNOWN') return 'The accepted quotation has no production period.';
  if (code === 'CAPACITY_UNKNOWN')
    return 'Capacity is unknown. Unknown capacity is not treated as available.';
  if (code === 'CAPACITY_CONSTRAINT')
    return 'Overlapping or incompatible capacity records need a person to review them.';
  if (code === 'FEASIBILITY_NOT_FEASIBLE')
    return 'The feasibility result on the accepted quotation is not feasible.';
  if (code === 'PRODUCT_RESTRICTIONS_UNVERIFIED')
    return 'Product-specific requirements have not been reviewed.';
  return 'A constraint is unknown.';
}

export const eligibilityRequestSchema = z
  .object({
    version,
    restrictionsReviewed: z.boolean(),
    restrictionSource: text.max(200).optional(),
    equipment: z.string().trim().min(2).max(80).optional(),
  })
  .strict()
  .refine((value) => !value.restrictionsReviewed || Boolean(value.restrictionSource), {
    message: 'Name the source of the product-restriction review.',
    path: ['restrictionSource'],
  });
export const productionOfferSchema = z
  .object({
    version,
    eligibilityId: id,
    quantity: z.number().int().positive().max(1000000),
    expiresAt: z.iso.datetime({ offset: true }),
    materials: text,
    reworkTerms: text,
    paymentConditions: text,
    collectionArrangement: text,
    instructions: text,
  })
  .strict();
export const productionIssueSchema = z.object({ version }).strict();
export const assistedDecisionSchema = z
  .object({
    version,
    decision: z.enum(['ACCEPT', 'DECLINE']),
    evidenceReference: text.max(500),
  })
  .strict();

export type EligibilityAssessmentView = {
  id: string;
  orderId: string;
  version: number;
  artisanProfileId: string;
  displayName: string;
  associationName: string | null;
  accountLinked: boolean;
  decision: EligibilityDecision;
  reasons: EligibilityFinding[];
  unknown: string[];
  knownRemaining: string | null;
  unitType: 'HOURS' | 'PIECES' | null;
  periodFrom: string | null;
  periodTo: string | null;
  assessedAt: string;
};
export type AssistedDecisionView = {
  id: string;
  reportedDecision: 'ACCEPT' | 'DECLINE';
  method: 'IN_PERSON_REPORTED';
  verificationStatus: 'PENDING_UNAPPROVED_METHOD';
  recordedById: string;
  evidenceReference: string;
  createdAt: string;
};
export type ProductionOfferView = {
  id: string;
  orderId: string;
  artisanProfileId: string;
  displayName: string;
  associationName: string | null;
  quantity: number;
  unitPayTnd: string;
  totalPayTnd: string;
  compensationMethod: string | null;
  estimatedHours: string;
  expiresAt: string;
  materials: string;
  reworkTerms: string;
  paymentConditions: string;
  collectionArrangement: string | null;
  instructions: string | null;
  specification: string;
  deliveryAt: string;
  status: string;
  version: number;
  termsSha256: string | null;
  preferredLanguage: string;
  assisted: AssistedDecisionView | null;
  decisionState: string;
};
export type ProductionSummary = {
  required: number;
  prepared: number;
  reserved: number;
  accepted: number;
  uncovered: number;
  declined: number;
  expired: number;
  orderVersion: number;
  craftSkillId: string;
  warnings: string[];
};
export type ProductionWorkspace = {
  summary: ProductionSummary;
  assessments: EligibilityAssessmentView[];
  offers: ProductionOfferView[];
  truncated: boolean;
  verificationPolicy: 'PENDING_UNAPPROVED_METHOD';
};
