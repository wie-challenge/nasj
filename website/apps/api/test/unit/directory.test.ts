import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateDirectoryCapacity,
  directoryQuerySchema,
  DIRECTORY_COHORT_MINIMUM,
  type CapacityConstraint,
} from '@nasj/contracts';

test('directory aggregation keeps units exact and does not hide unknown rows as available', () => {
  const rows = [
    { declared: '100', reserved: '20', committed: '30', availabilityKnown: true, constraints: [] },
    { declared: '80', reserved: '10', committed: '20', availabilityKnown: true, constraints: [] },
    { declared: '120', reserved: '30', committed: '40', availabilityKnown: true, constraints: [] },
  ];
  const total = aggregateDirectoryCapacity(rows);
  assert.equal(total.declared, '300.00');
  assert.equal(total.reserved, '60.00');
  assert.equal(total.committed, '90.00');
  assert.equal(total.remaining, '150.00');
  assert.equal(total.availabilityKnown, true);
  const unknown = aggregateDirectoryCapacity([
    ...rows,
    {
      declared: '10',
      reserved: '0',
      committed: '0',
      availabilityKnown: false,
      constraints: ['INCOMPATIBLE_COMMITMENT_UNIT'] as CapacityConstraint[],
    },
  ]);
  assert.equal(unknown.availabilityKnown, false);
  assert.equal(unknown.knownSubtotal, true);
  assert.ok(unknown.constraints.includes('INCOMPLETE_AGGREGATE'));
  assert.ok(unknown.constraints.includes('INCOMPATIBLE_COMMITMENT_UNIT'));
  assert.equal(DIRECTORY_COHORT_MINIMUM, 3);
});
test('directory search rejects unknown, health and inverted period filters', () => {
  assert.equal(
    directoryQuerySchema.safeParse({ craft: 'weaving', region: 'Sfax', unit: 'PIECES' }).success,
    true,
  );
  for (const extra of [
    { sensorData: '1' },
    { healthStatus: 'fine' },
    { unit: 'STRAIN' },
    { minRemaining: '-1' },
    { effectiveFrom: '2027-05-10T00:00:00.000Z', effectiveTo: '2027-05-03T00:00:00.000Z' },
  ])
    assert.equal(directoryQuerySchema.safeParse(extra).success, false);
});
