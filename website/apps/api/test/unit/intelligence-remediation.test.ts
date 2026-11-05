import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDelayRisk, earningsFromObservedTime, RISK_POLICY_VERSION } from '@nasj/contracts';
import { IntelligenceService } from '../../src/modules/intelligence/intelligence.service.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { Actor } from '../../src/common/identity.js';

const record = {
  consented: true,
  observedMinutes: 60,
  observedUnits: 50,
  evidence: 'OBSERVED',
  periodFrom: new Date('2026-01-01T00:00:00Z'),
  periodTo: new Date('2026-01-01T02:00:00Z'),
  unitContext: 'Synthetic fixture: fifty pieces',
  provenance: 'Synthetic fixture for calculation verification',
};
const second = {
  ...record,
  periodFrom: new Date('2026-01-02T00:00:00Z'),
  periodTo: new Date('2026-01-02T02:00:00Z'),
};
const earningsInput = {
  agreedMillimes: '120000',
  coveredQuantity: 100,
  scope: 'batch',
  records: [record, second],
};
const invalidRecords = [
  ['mixed known and null time', [record, { ...second, observedMinutes: null }]],
  ['withdrawn consent', [record, { ...second, consented: false }]],
  ['zero duration', [record, { ...second, observedMinutes: 0 }]],
  ['negative duration', [record, { ...second, observedMinutes: -1 }]],
  ['fractional duration', [record, { ...second, observedMinutes: 1.5 }]],
  ['nonfinite duration', [record, { ...second, observedMinutes: Number.NaN }]],
  ['time exceeds period', [record, { ...second, observedMinutes: 121 }]],
  ['invalid period', [record, { ...second, periodTo: new Date('invalid') }]],
  ['reversed period', [record, { ...second, periodTo: second.periodFrom }]],
  ['overlap', [record, { ...second, periodFrom: record.periodFrom, periodTo: record.periodTo }]],
  ['partial quantity', [record]],
  ['excess quantity', [record, { ...second, observedUnits: 51 }]],
  ['unknown quantity', [record, { ...second, observedUnits: 0 }]],
  ['unaccepted evidence', [record, { ...second, evidence: 'WEARABLE' }]],
] as const;
for (const [name, records] of invalidRecords) {
  test(`FPA-04 full compensation refuses ${name}`, () => {
    const result = earningsFromObservedTime({ ...earningsInput, records: [...records] });
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.hourlyTnd, null);
    assert.equal(result.observedMinutes, null);
    assert.equal(result.policyVersion, 2);
  });
}
test('FPA-04 complete disjoint and touching periods produce reproducible full-scope rate', () => {
  for (const records of [
    [record, second],
    [second, record],
    [record, { ...second, periodFrom: record.periodTo }],
  ]) {
    const result = earningsFromObservedTime({ ...earningsInput, records });
    assert.equal(result.status, 'AVAILABLE');
    assert.equal(result.hourlyTnd, '60.000');
    assert.equal(result.observedMinutes, 120);
  }
});

// Run the actual service and IAM/scope path against explicit read adapters. This is not a database test.
async function serviceEarnings(
  records: (Omit<typeof record, 'observedMinutes'> & { observedMinutes: number | null })[],
) {
  const tx = {
    $executeRaw: async () => 0,
    user: { findUnique: async () => ({ emailVerified: true, status: 'ACTIVE' }) },
    session: { findUnique: async () => ({ userId: 'artisan', expiresAt: new Date('2099-01-01') }) },
    commercialBatch: {
      findUnique: async () => ({
        artisanProfile: { userId: 'artisan' },
        offer: { quantity: 100, unitPayMillimes: 1200n },
      }),
    },
    productionTimeRecord: {
      findMany: async (query: unknown) => {
        assert.deepEqual(query, {
          where: { batchId: 'batch', correctedBy: null },
          orderBy: [{ periodFrom: 'asc' }, { id: 'asc' }],
        });
        return records;
      },
    },
    artisanPayable: {
      // A synthetic settlement row carries its status and reconciliation flag. A payment without
      // those fields is not a settlement the figures should credit, so the fixture states them.
      findMany: async () => [
        {
          amountMillimes: 90000n,
          settlements: [
            {
              amountMillimes: 40000n,
              status: 'SIMULATED_SETTLED',
              bankVerified: false,
              subjectKey: 'p1',
            },
          ],
        },
      ],
    },
  };
  const db = {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return new IntelligenceService(db).earnings(
    { id: 'artisan', sessionId: 'session' } as Actor,
    'batch',
  );
}
for (const [name, records] of invalidRecords) {
  test(`FPA-04 actual earnings service refuses ${name} and preserves compensation split`, async () => {
    const result = await serviceEarnings([...records]);
    assert.equal(result.estimate.status, 'UNAVAILABLE');
    assert.equal(result.estimate.hourlyTnd, null);
    assert.equal(result.compensation.agreed, '120.000');
    assert.equal(result.compensation.earned, '90.000');
    // A synthetic settlement moves no money, so it cannot reduce what is owed. Owed is earned less
    // only independently verified payment. See CP5-G71.
    assert.equal(result.compensation.payable, '90.000');
    assert.equal(result.compensation.simulatedPaid, '40.000');
    assert.equal(result.compensation.verifiedPaid, '0.000');
    assert.equal(result.compensation.verifiedAvailable, false);
  });
}
test('FPA-04 actual earnings service complete periods preserve provenance and synthetic class', async () => {
  const result = await serviceEarnings([record, { ...second, evidence: 'SYNTHETIC' }]);
  assert.equal(result.estimate.hourlyTnd, '60.000');
  assert.equal(result.estimate.policyVersion, 2);
  assert.deepEqual(result.evidenceClasses, ['OBSERVED', 'SYNTHETIC']);
  assert.equal(result.periods.length, 2);
  assert.equal(result.periods[0]?.provenance, record.provenance);
});

const risk = {
  now: '2026-11-01T11:00:00Z',
  deadline: '2026-11-01T12:00:00+01:00',
  acceptedQuantity: 100,
  reportedProgress: 20,
  confirmedCapacity: 100,
  materialShortageOpen: false,
  qualityRejectionOpen: false,
  approvedScheduleChangeTo: null,
  requiredInputsMissing: [],
  lastProgressAt: '2026-11-01T10:00:00Z',
};
for (const delta of [-1, 0, 1, 6 * 3600000, 86400000]) {
  test(`FPA-05 exact Tunis deadline boundary ${delta}ms`, () => {
    const result = assessDelayRisk({
      ...risk,
      now: new Date(Date.parse(risk.deadline) + delta).toISOString(),
    });
    assert.equal(result.state, delta > 0 ? 'OVERDUE' : 'AT_RISK');
    assert.equal(
      result.reasons.some((r) => r.code === 'DEADLINE_PASSED'),
      delta > 0,
    );
    assert.equal(result.policyVersion, 3);
    assert.equal(RISK_POLICY_VERSION, 3);
  });
}
test('FPA-05 approved deadline replaces original and exact boundary still applies', () => {
  const approvedScheduleChangeTo = '2026-11-02T12:00:00+01:00';
  for (const delta of [-1, 0, 1]) {
    const result = assessDelayRisk({
      ...risk,
      approvedScheduleChangeTo,
      now: new Date(Date.parse(approvedScheduleChangeTo) + delta).toISOString(),
    });
    assert.equal(result.state, delta > 0 ? 'OVERDUE' : 'AT_RISK');
    assert.ok(result.reasons.some((r) => r.code === 'APPROVED_SCHEDULE_CHANGE'));
  }
});
test('FPA-05 incomplete work evidence stays unavailable while stale known remainder is overdue', () => {
  const now = '2026-11-01T11:00:00.001Z';
  assert.equal(
    assessDelayRisk({ ...risk, now, reportedProgress: null }).state,
    'INSUFFICIENT_DATA',
  );
  const stale = assessDelayRisk({ ...risk, now, lastProgressAt: '2026-10-01T00:00:00Z' });
  assert.equal(stale.state, 'OVERDUE');
  assert.ok(stale.unknowns.includes('PROGRESS_STALE'));
  assert.equal(assessDelayRisk({ ...risk, now, reportedProgress: 100 }).state, 'ON_TRACK');
  assert.equal(assessDelayRisk({ ...risk, now: 'invalid' }).state, 'INSUFFICIENT_DATA');
  assert.equal(assessDelayRisk({ ...risk, deadline: 'invalid' }).state, 'INSUFFICIENT_DATA');
});

test('FPA-05 missing or malformed latest report is explicitly provisional before deadline', () => {
  for (const lastProgressAt of [null, 'invalid', '2026-10-01T00:00:00Z']) {
    const result = assessDelayRisk({
      ...risk,
      deadline: '2026-11-20T12:00:00+01:00',
      lastProgressAt,
    });
    assert.equal(result.state, 'INSUFFICIENT_DATA');
    assert.ok(result.unknowns.includes('PROGRESS_STALE'));
  }
});
