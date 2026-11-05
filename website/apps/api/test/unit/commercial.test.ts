import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessFeasibility,
  costEstimateSchema,
  feasibilityRequestSchema,
  priceCost,
  quoteStanding,
} from '@nasj/contracts';
const period = {
  periodFrom: new Date('2027-09-06T00:00:00+01:00'),
  periodTo: new Date('2027-09-13T00:00:00+01:00'),
  deliveryAt: new Date('2027-10-01T00:00:00+01:00'),
};
const ready = {
  quantity: 500,
  unit: 'PIECES' as const,
  ...period,
  capacityKnown: true,
  knownRemaining: '650.00',
  capacityConstraints: [],
  effort: {
    minPerUnit: '1.50',
    maxPerUnit: '2.50',
    version: 1,
    source: 'Synthetic reviewed study',
  },
  materialStatus: 'CONFIRMED_AVAILABLE' as const,
  sample: 'APPROVED' as const,
  logisticsLeadDays: 3,
  calendarCleared: true,
};
test('feasibility discloses shortage and refuses unknown or incompatible availability', () => {
  const enough = assessFeasibility(ready);
  assert.equal(enough.result, 'FEASIBLE');
  assert.equal(enough.shortage, null);
  assert.equal(enough.effortMin, '750.00');
  assert.equal(enough.effortMax, '1250.00');
  assert.equal(enough.reservation, false);
  const short = assessFeasibility({ ...ready, quantity: 500, knownRemaining: '350.00' });
  assert.equal(short.result, 'NOT_FEASIBLE');
  assert.equal(short.shortage, '150.00');
  const missing = assessFeasibility({ ...ready, effort: null, materialStatus: 'UNKNOWN' });
  assert.equal(missing.result, 'NEEDS_REVIEW');
  assert.ok(missing.constraints.some((item) => item.code === 'EFFORT_UNKNOWN' && !item.known));
  assert.ok(missing.constraints.some((item) => item.code === 'MATERIAL_AVAILABILITY_UNKNOWN'));
  const hours = assessFeasibility({ ...ready, unit: 'HOURS' });
  assert.equal(hours.result, 'NOT_FEASIBLE');
  assert.ok(hours.constraints.some((item) => item.code === 'INCOMPATIBLE_UNIT'));
  const unknownCapacity = assessFeasibility({
    ...ready,
    capacityKnown: false,
    knownRemaining: null,
    capacityConstraints: ['SMALL_GROUP_SUPPRESSED'],
  });
  assert.equal(unknownCapacity.result, 'NEEDS_REVIEW');
  assert.equal(unknownCapacity.knownRemaining, null);
});
test('cost versions keep exact TND and do not treat markup as selling-price margin', () => {
  const lines = [
    { category: 'MATERIALS' as const, basis: 'VARIABLE' as const, rateTnd: '2.000' },
    { category: 'ARTISAN_LABOR' as const, basis: 'VARIABLE' as const, rateTnd: '3.000' },
    { category: 'QUALITY_ASSURANCE' as const, basis: 'FIXED' as const, rateTnd: '30.000' },
    { category: 'LOGISTICS' as const, basis: 'FIXED' as const, rateTnd: '20.000' },
    { category: 'OVERHEAD' as const, basis: 'FIXED' as const, rateTnd: '50.000' },
    { category: 'CONTINGENCY' as const, basis: 'FIXED' as const, rateTnd: '0.000' },
  ];
  const markup = priceCost({
    quantity: 100,
    marginMethod: 'MARKUP_ON_COST',
    marginBasisPoints: 1000,
    lines,
  });
  const margin = priceCost({
    quantity: 100,
    marginMethod: 'MARGIN_ON_SELLING_PRICE',
    marginBasisPoints: 1000,
    lines,
  });
  assert.equal(markup.subtotalTnd, '600.000');
  assert.equal(markup.sellingTnd, '660.000');
  assert.equal(margin.subtotalTnd, '600.000');
  assert.notEqual(margin.sellingTnd, markup.sellingTnd);
  assert.equal(margin.sellingTnd, '666.667');
  assert.equal(markup.taxStatus, 'PENDING_LEGAL_REVIEW');
  const incomplete = priceCost({
    quantity: 100,
    marginMethod: 'NONE',
    marginBasisPoints: 0,
    lines: lines.filter((line) => line.category !== 'ARTISAN_LABOR'),
  });
  assert.equal(incomplete.incomplete, true);
  assert.equal(incomplete.sellingTnd, null);
  assert.ok(incomplete.missing.includes('ARTISAN_LABOR'));
  assert.equal(
    costEstimateSchema.safeParse({
      version: 1,
      feasibilityId: 'cost1',
      marginMethod: 'NONE',
      marginBasisPoints: 0,
      lines: [{ category: 'CONTINGENCY', basis: 'FIXED', rateTnd: '-1.000' }],
      sensor: 1,
    }).success,
    false,
  );
  assert.equal(
    feasibilityRequestSchema.safeParse({
      version: 1,
      effectiveFrom: '2027-09-13T00:00:00.000Z',
      effectiveTo: '2027-09-06T00:00:00.000Z',
      unit: 'PIECES',
      materialStatus: 'UNKNOWN',
      calendarCleared: false,
    }).success,
    false,
  );
});
test('quotation standing is derived without rewriting the issued row', () => {
  const now = new Date('2026-10-27T00:00:00Z');
  const expiresAt = new Date('2027-09-20T00:00:00Z');
  assert.equal(
    quoteStanding({
      version: 2,
      expiresAt,
      accepted: false,
      rejected: false,
      latestVersion: 2,
      now,
    }),
    'ISSUED',
  );
  assert.equal(
    quoteStanding({
      version: 1,
      expiresAt,
      accepted: false,
      rejected: false,
      latestVersion: 2,
      now,
    }),
    'SUPERSEDED',
  );
  assert.equal(
    quoteStanding({
      version: 1,
      expiresAt,
      accepted: false,
      rejected: true,
      latestVersion: 2,
      now,
    }),
    'REJECTED',
  );
  assert.equal(
    quoteStanding({
      version: 2,
      expiresAt,
      accepted: true,
      rejected: false,
      latestVersion: 2,
      now,
    }),
    'ACCEPTED',
  );
  assert.equal(
    quoteStanding({
      version: 2,
      expiresAt: new Date('2026-01-01T00:00:00Z'),
      accepted: false,
      rejected: false,
      latestVersion: 2,
      now,
    }),
    'EXPIRED',
  );
});
