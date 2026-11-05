import { z } from 'zod';
export const demoPersonas = [
  'buyer',
  'artisan',
  'coordinator',
  'production',
  'qa',
  'finance',
] as const;
export type DemoPersona = (typeof demoPersonas)[number];
export const demoStartSchema = z.object({}).strict();
export const demoSwitchSchema = z
  .object({ persona: z.enum([...demoPersonas, 'operator']) })
  .strict();
export const demoResetSchema = z
  .object({
    scenarioId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    generation: z.number().int().positive(),
    confirm: z.literal(true),
  })
  .strict();
export type DemoResetInput = z.infer<typeof demoResetSchema>;
export interface DemoTotals {
  rfqs: number;
  quotations: number;
  orders: number;
  offers: number;
  acceptedCommitments: number;
  committedPieces: number;
  capacityReserved: string;
  produced: number;
  qualityApproved: number;
  prepared: number;
  shipments: number;
  delivered: number;
  payables: number;
  payableMillimes: string;
  simulations: number;
  simulatedMillimes: string;
  verifiedPaidMillimes: string;
  inventoryLots: number;
  inventoryReservedMilli: string;
  publishedQr: number;
  allocationPlans: number;
  productSpecifications: number;
  sampleRequests: number;
  samplePayables: number;
  productionExceptions: number;
  discussions: number;
  supportTickets: number;
  notificationDeliveries: number;
}
export interface DemoScenarioView {
  id: string;
  generation: number;
  version: number;
  provenance: 'SYNTHETIC';
  rfqId: string;
  quoteId: string;
  orderId: string | null;
  linkedArtisanId: string;
  accountlessArtisanId: string;
  buyerOrganizationId: string;
  operatorOrganizationId: string;
  associationOrganizationId: string;
  craftSkillId: string;
  stage:
    | 'Commercial Decision'
    | 'Artisan Offers'
    | 'Production'
    | 'Quality'
    | 'Logistics'
    | 'Traceability'
    | 'Finance';
  periodFrom: string;
  periodTo: string;
  offerExpiresAt: string;
  deliveryAt: string;
  initialTotals: DemoTotals;
  totals: DemoTotals;
  createdAt: string;
}
export interface DemoSessionView {
  available: boolean;
  csrfToken?: string;
  scenario: DemoScenarioView | null;
  personas: { id: DemoPersona; label: string; workspacePath: string }[];
  activePersona: DemoPersona | null;
  limitations: string[];
}

/* ------------------------------------------------------------------ E15-06 feedback */

/**
 * Structured feedback about a synthetic demonstration. It is not a claim, a customer review, a
 * testimonial, verified evidence or a payable. Anyone reading a row must be able to tell a visitor
 * submission apart from seeded fixture data.
 */
export const demoFeedbackCategories = ['USABILITY', 'CONTENT', 'DEFECT', 'IDEA'] as const;
export type DemoFeedbackCategory = (typeof demoFeedbackCategories)[number];

export const demoFeedbackStatuses = ['NEW', 'TRIAGED', 'ACTIONED', 'DISMISSED'] as const;
export type DemoFeedbackStatus = (typeof demoFeedbackStatuses)[number];

export const demoFeedbackSourceClasses = ['VISITOR_SUBMITTED', 'SYNTHETIC_SEEDED'] as const;
export type DemoFeedbackSourceClass = (typeof demoFeedbackSourceClasses)[number];

export const demoFeedbackKinds = ['SUBMITTED', 'STATUS_CHANGED', 'NOTE'] as const;
export type DemoFeedbackKind = (typeof demoFeedbackKinds)[number];

/** A closed vocabulary: "relevant screen or story" must mean something precise. */
export const demoScreenKeys = [
  'SHOWROOM_OVERVIEW',
  'SHOWROOM_STAGE_PROGRESS',
  'PRESENTATION:problem',
  'PRESENTATION:opportunity',
  'PRESENTATION:concept',
  'PRESENTATION:workflow',
  'PRESENTATION:participation',
  'PRESENTATION:technology',
  'PRESENTATION:demo',
  'PRESENTATION:transparency',
  'PRESENTATION:finance',
  'PRESENTATION:roadmap',
  'WORKSPACE:buyer',
  'WORKSPACE:production',
  'WORKSPACE:artisan',
  'WORKSPACE:coordinator',
  'WORKSPACE:qa',
  'WORKSPACE:finance',
] as const;
export type DemoScreenKey = (typeof demoScreenKeys)[number];

export const demoFeedbackLimitations = [
  'Feedback concerns a synthetic demonstration only. It is not customer satisfaction, verified evidence or a payable.',
  'A visitor sees only their own submissions; the team reviewer sees all generations.',
  'A showroom reset archives the scenario and preserves its feedback; nothing is published or emailed.',
];

export const demoFeedbackCommentMaxLength = 2000;
export const demoFeedbackNoteMaxLength = 1000;
/** Per visitor, per scenario. Bounded so one participant cannot flood a demonstration. */
export const demoFeedbackPerScenarioLimit = 10;

const demoFeedbackTransitions: Record<DemoFeedbackStatus, DemoFeedbackStatus[]> = {
  NEW: ['TRIAGED', 'DISMISSED'],
  TRIAGED: ['NEW', 'ACTIONED', 'DISMISSED'],
  ACTIONED: [],
  DISMISSED: [],
};

export function canTransitionDemoFeedback(from: DemoFeedbackStatus, to: DemoFeedbackStatus) {
  return demoFeedbackTransitions[from]?.includes(to) ?? false;
}

/** Closing feedback out requires a stated reason; re-queueing does not. */
export function demoFeedbackRequiresNote(to: DemoFeedbackStatus) {
  return to === 'ACTIONED' || to === 'DISMISSED';
}

/**
 * Provenance is derived, never supplied by a client. A visitor submission about a synthetic
 * demonstration is an opinion about the demonstration and nothing more.
 */
export function demoFeedbackLabel(sourceClass: DemoFeedbackSourceClass) {
  if (sourceClass === 'SYNTHETIC_SEEDED')
    return {
      label: 'Seeded synthetic fixture',
      provesRealParticipantView: false,
      synthetic: true,
    };
  return {
    label: 'Visitor feedback about a synthetic demonstration',
    provesRealParticipantView: false,
    synthetic: true,
  };
}

export function sanitizeDemoFeedbackComment(value: string) {
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('')
    .replace(/<[^>]*>/g, '')
    .trim();
  return cleaned.slice(0, demoFeedbackCommentMaxLength);
}

const demoFeedbackId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);

export const demoFeedbackCreateSchema = z
  .object({
    scenarioId: demoFeedbackId,
    screenKey: z.enum(demoScreenKeys),
    category: z.enum(demoFeedbackCategories),
    comment: z
      .string()
      .max(demoFeedbackCommentMaxLength)
      .default('')
      .transform(sanitizeDemoFeedbackComment),
    dedupeKey: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{8,128}$/)
      .optional(),
  })
  .strict();
export type DemoFeedbackCreateInput = z.infer<typeof demoFeedbackCreateSchema>;

export const demoFeedbackDecisionSchema = z
  .object({
    expectedStatus: z.enum(demoFeedbackStatuses),
    status: z.enum(demoFeedbackStatuses),
    note: z
      .string()
      .trim()
      .max(demoFeedbackNoteMaxLength)
      .default('')
      .transform(sanitizeDemoFeedbackComment),
  })
  .strict();
export type DemoFeedbackDecisionInput = z.infer<typeof demoFeedbackDecisionSchema>;

export const demoFeedbackQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(demoFeedbackStatuses).optional(),
    category: z.enum(demoFeedbackCategories).optional(),
    scenarioId: demoFeedbackId.optional(),
  })
  .strict();
export type DemoFeedbackQuery = z.infer<typeof demoFeedbackQuerySchema>;

export type DemoFeedbackView = {
  id: string;
  scenarioId: string;
  generation: number;
  screenKey: DemoScreenKey;
  category: DemoFeedbackCategory;
  comment: string;
  status: DemoFeedbackStatus;
  sourceClass: DemoFeedbackSourceClass;
  sourceLabel: string;
  createdAt: string;
};

export type DemoFeedbackAdminView = DemoFeedbackView & {
  events: {
    id: string;
    kind: DemoFeedbackKind;
    actorName: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string;
    createdAt: string;
  }[];
};

export type DemoFeedbackAdminList = {
  items: DemoFeedbackAdminView[];
  total: number;
  page: number;
  pageSize: number;
  summary: { status: DemoFeedbackStatus; count: number }[];
  limitations: string[];
};

export type DemoFeedbackMineList = {
  items: DemoFeedbackView[];
  total: number;
  page: number;
  pageSize: number;
  scenarioId: string | null;
  limitations: string[];
};
