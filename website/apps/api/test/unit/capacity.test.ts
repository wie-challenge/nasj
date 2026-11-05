import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  capacityHundredths,
  capacityDecimal,
  reconcileCapacity,
  capacityDeclarationSchema,
  assistedCapacitySchema,
} from '@nasj/contracts';
import { capacityOfferEffect } from '../../src/modules/artisans/capacity.js';

test('capacity uses exact hundredths and separates commitment deficit from pending shortfall', () => {
  assert.equal(capacityDecimal(capacityHundredths('0.10') + capacityHundredths('0.20')), '0.30');
  assert.deepEqual(reconcileCapacity({ declared: '100', reserved: '20', committed: '30' }), {
    declared: '100.00',
    reserved: '20.00',
    committed: '30.00',
    remaining: '50.00',
    deficit: '0.00',
    reservationShortfall: '0.00',
    availabilityKnown: true,
    constraints: [],
  });
  const reduced = reconcileCapacity({ declared: '25', reserved: '20', committed: '30' });
  assert.equal(reduced.deficit, '5.00');
  assert.equal(reduced.reservationShortfall, '25.00');
  assert.equal(reduced.remaining, '0.00');
  assert.throws(() => capacityHundredths('0.001'));
  assert.throws(() => capacityHundredths('-1'));
});
test('unknown conversion or allocation never reports positive available capacity', () => {
  const unknown = reconcileCapacity({
    declared: '100',
    reserved: '0',
    committed: '0',
    constraints: ['INCOMPATIBLE_COMMITMENT_UNIT'],
  });
  assert.equal(unknown.availabilityKnown, false);
  assert.equal(unknown.remaining, '0.00');
});
test('self-service and registry enforce the same units, periods, precision and monitoring boundary', () => {
  const base = {
    craftSkillId: 'weaving',
    unitType: 'HOURS',
    effectiveFrom: '2027-01-04T00:00:00+01:00',
    effectiveTo: '2027-01-11T00:00:00+01:00',
    expectedVersion: 0,
  };
  for (const [schema, payload] of [
    [capacityDeclarationSchema, { ...base, quantity: 12.5 }],
    [
      assistedCapacitySchema,
      { ...base, quantity: '12.50', authorizationId: 'synthetic-reference' },
    ],
  ] as const) {
    assert.equal(schema.safeParse(payload).success, true);
    for (const fields of [
      { unitType: 'STRAIN' },
      { effectiveTo: base.effectiveFrom },
      { effectiveFrom: 'bad' },
      { expectedVersion: -1 },
      { sensorData: [] },
      { fatigue: 2 },
      { healthStatus: 'fine' },
    ])
      assert.equal(schema.safeParse({ ...payload, ...fields }).success, false);
  }
  assert.equal(capacityDeclarationSchema.safeParse({ ...base, quantity: -1 }).success, false);
  assert.equal(
    assistedCapacitySchema.safeParse({ ...base, quantity: '100000.01', authorizationId: 'ref' })
      .success,
    false,
  );
  assert.equal(
    assistedCapacitySchema.safeParse({ ...base, quantity: '0', authorizationId: 'ref' }).success,
    true,
  );
});
test('completed period throughput stays consumed while cancelled unproduced work is released', () => {
  const now = new Date('2027-03-02T00:00:00Z');
  const base = {
    status: 'ACCEPTED',
    expiresAt: new Date('2027-03-01T00:00:00Z'),
    quantity: 100,
    orderStatus: 'PLANNING',
    batchStatus: 'COMPLETED',
    produced: 100,
  };
  assert.equal(capacityOfferEffect(base, now).kind, 'committed');
  assert.equal(
    capacityOfferEffect({ ...base, orderStatus: 'CLOSED', batchStatus: 'COMPLETED' }, now).kind,
    'committed',
  );
  assert.equal(
    capacityOfferEffect(
      { ...base, orderStatus: 'CANCELLED', batchStatus: 'ACCEPTED', produced: 0 },
      now,
    ).kind,
    'skip',
  );
  assert.equal(
    capacityOfferEffect(
      {
        status: 'OFFERED',
        expiresAt: new Date('2027-03-03T00:00:00Z'),
        quantity: 20,
        orderStatus: 'PLANNING',
        batchStatus: null,
        produced: 0,
      },
      now,
    ).kind,
    'reserved',
  );
  assert.equal(
    capacityOfferEffect(
      {
        status: 'OFFERED',
        expiresAt: new Date('2027-03-01T00:00:00Z'),
        quantity: 20,
        orderStatus: 'PLANNING',
        batchStatus: null,
        produced: 0,
      },
      now,
    ).kind,
    'skip',
  );
});
