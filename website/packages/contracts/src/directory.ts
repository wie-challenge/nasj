import { z } from 'zod';
import {
  capacityDecimal,
  capacityHundredths,
  capacityUnits,
  reconcileCapacity,
  validCapacityPeriod,
  type CapacityConstraint,
  type CapacitySummary,
} from './capacity.js';

// Fewer than this many eligible participants withholds quantities from commercial discovery.
export const DIRECTORY_COHORT_MINIMUM = 3;
export const directoryConstraints = [
  'INCOMPATIBLE_COMMITMENT_UNIT',
  'PERIOD_ALLOCATION_UNKNOWN',
  'OVERLAPPING_DECLARATIONS',
  'AVAILABILITY_PAUSED',
  'INCOMPLETE_AGGREGATE',
  'SMALL_GROUP_SUPPRESSED',
] as const;
export type DirectoryConstraint = (typeof directoryConstraints)[number];
const optionalQuery = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined || value === null ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );
export const directoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    craft: optionalQuery(128),
    region: optionalQuery(120),
    unit: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.enum(capacityUnits).optional(),
    ),
    effectiveFrom: optionalQuery(40),
    effectiveTo: optionalQuery(40),
    minRemaining: optionalQuery(20),
    organizationId: optionalQuery(128),
  })
  .strict()
  .refine(
    (value) =>
      (value.effectiveFrom === undefined && value.effectiveTo === undefined) ||
      (value.effectiveFrom !== undefined &&
        value.effectiveTo !== undefined &&
        validCapacityPeriod({
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo,
        })),
    'Choose both period boundaries, with the end after the start.',
  )
  .refine(
    (value) =>
      value.minRemaining === undefined || /^\d{1,10}(\.\d{1,2})?$/.test(value.minRemaining),
    'Minimum availability must be a nonnegative quantity.',
  )
  .refine(
    (value) => value.organizationId === undefined || /^[a-zA-Z0-9_-]+$/.test(value.organizationId),
    'Choose a valid organization.',
  )
  .refine(
    (value) => value.craft === undefined || /^[a-zA-Z0-9_-]+$/.test(value.craft),
    'Choose a valid craft.',
  );
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export const directoryGroupIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);
export type DirectoryGroupView = {
  id: string;
  organizationId: string;
  name: string;
  region: string;
  craftSkillId: string;
  craftName: string;
  craftCategory: string;
  unitType: string;
  effectiveFrom: string;
  effectiveTo: string;
  declared: string | null;
  reserved: string | null;
  committed: string | null;
  remaining: string | null;
  deficit: string | null;
  availabilityKnown: boolean;
  knownSubtotal: boolean;
  constraints: DirectoryConstraint[];
  contributorCount: number | null;
  unknownContributorCount: number | null;
  updatedAt: string;
  provenance: 'SYNTHETIC_DECLARED_CAPACITY';
  detail: 'AGGREGATE';
};
export type DirectoryContributorView = {
  artisanProfileId: string;
  displayName: string;
  missingDeclaration: boolean;
  declarationId: string | null;
  declared: string | null;
  reserved: string | null;
  committed: string | null;
  remaining: string | null;
  deficit: string | null;
  availabilityKnown: boolean;
  constraints: CapacityConstraint[];
  updatedAt: string | null;
};
export type DirectoryPage = {
  items: DirectoryGroupView[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    craft: string | null;
    region: string | null;
    unit: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    minRemaining: string | null;
    organizationId: string | null;
  };
  provenance: 'SYNTHETIC_DECLARED_CAPACITY';
  truncated: boolean;
  cohortMinimum: number;
  reservation: false;
};
export type DirectoryDetail = {
  group: DirectoryGroupView;
  contributors: DirectoryContributorView[] | null;
  provenance: 'SYNTHETIC_DECLARED_CAPACITY';
  reservation: false;
};
type AggregateRow = {
  declared: string;
  reserved: string;
  committed: string;
  availabilityKnown: boolean;
  constraints: CapacityConstraint[];
};
export function aggregateDirectoryCapacity(rows: readonly AggregateRow[]) {
  let declared = 0n;
  let reserved = 0n;
  let committed = 0n;
  const constraints = new Set<DirectoryConstraint>();
  let unknown = 0;
  for (const row of rows) {
    declared += capacityHundredths(row.declared);
    reserved += capacityHundredths(row.reserved);
    committed += capacityHundredths(row.committed);
    if (!row.availabilityKnown) unknown += 1;
    for (const constraint of row.constraints) constraints.add(constraint);
  }
  if (unknown > 0 || rows.length === 0) constraints.add('INCOMPLETE_AGGREGATE');
  const totals = reconcileCapacity({
    declared: capacityDecimal(declared),
    reserved: capacityDecimal(reserved),
    committed: capacityDecimal(committed),
  });
  return {
    ...totals,
    availabilityKnown: unknown === 0 && rows.length > 0,
    knownSubtotal: unknown > 0,
    constraints: [...constraints],
    unknownContributorCount: unknown,
  };
}
export function directoryContributor(
  summary: CapacitySummary,
  name: string,
): DirectoryContributorView {
  return {
    artisanProfileId: summary.artisanProfileId,
    displayName: name,
    missingDeclaration: false,
    declarationId: summary.declarationId,
    declared: summary.declared,
    reserved: summary.reserved,
    committed: summary.committed,
    remaining: summary.remaining,
    deficit: summary.deficit,
    availabilityKnown: summary.availabilityKnown,
    constraints: summary.constraints,
    updatedAt: summary.asOf,
  };
}
