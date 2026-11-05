import { z } from 'zod';

export const capacityUnits = ['HOURS', 'PIECES'] as const;
export const capacityFields = {
  craftSkillId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  unitType: z.enum(capacityUnits),
  effectiveFrom: z.iso.datetime({ offset: true }),
  effectiveTo: z.iso.datetime({ offset: true }),
  expectedVersion: z.number().int().min(0).optional(),
};
export const validCapacityPeriod = (v: { effectiveFrom: string; effectiveTo: string }) =>
  new Date(v.effectiveTo) > new Date(v.effectiveFrom);

// Quantities cross the API as decimal strings; calculations use integer hundredths.
export function capacityHundredths(value: string): bigint {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new RangeError('Invalid capacity quantity.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function capacityDecimal(value: bigint): string {
  if (value < 0n) throw new RangeError('Capacity cannot be negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
export type CapacityConstraint =
  | 'INCOMPATIBLE_COMMITMENT_UNIT'
  | 'PERIOD_ALLOCATION_UNKNOWN'
  | 'OVERLAPPING_DECLARATIONS'
  | 'AVAILABILITY_PAUSED';
export type CapacitySummary = {
  declarationId: string;
  artisanProfileId: string;
  craftSkillId: string;
  unitType: string;
  effectiveFrom: string;
  effectiveTo: string;
  version: number;
  declared: string;
  reserved: string;
  committed: string;
  remaining: string;
  deficit: string;
  reservationShortfall: string;
  availabilityKnown: boolean;
  constraints: CapacityConstraint[];
  timezone: 'Africa/Tunis';
  allocationPolicy: 'DECLARED_PERIOD_BUDGET';
  asOf: string;
};

export function reconcileCapacity(input: {
  declared: string;
  reserved: string;
  committed: string;
  constraints?: CapacityConstraint[];
}) {
  const declared = capacityHundredths(input.declared);
  const reserved = capacityHundredths(input.reserved);
  const committed = capacityHundredths(input.committed);
  const constraints = [...new Set(input.constraints ?? [])];
  const positive = (v: bigint) => (v > 0n ? v : 0n);
  return {
    declared: capacityDecimal(declared),
    reserved: capacityDecimal(reserved),
    committed: capacityDecimal(committed),
    remaining: capacityDecimal(constraints.length ? 0n : positive(declared - reserved - committed)),
    deficit: capacityDecimal(positive(committed - declared)),
    reservationShortfall: capacityDecimal(positive(reserved + committed - declared)),
    availabilityKnown: constraints.length === 0,
    constraints,
  };
}
