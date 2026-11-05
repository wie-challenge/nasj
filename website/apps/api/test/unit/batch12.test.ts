import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  cashGap,
  paymentTimeliness,
  accountingExport,
  csvCell,
} from '../../src/modules/finance/analysis.js';
import { operationalAlerts } from '../../src/jobs/alerts.js';
import { createLogger } from '../../src/common/logging.js';
import { RETENTION_INVENTORY } from '../../src/modules/governance/retention.js';
const from = '2026-10-01T00:00:00.000Z',
  to = '2026-11-01T00:00:00.000Z';
test('cash gap uses exact chronological millimes, conservative same-instant order and unknown dates', () => {
  const events = [
    {
      id: 'purchase',
      date: from,
      direction: 'OUT' as const,
      amount: 100001n,
      evidence: 'PROJECTED' as const,
    },
    {
      id: 'receipt',
      date: from,
      direction: 'IN' as const,
      amount: 100000n,
      evidence: 'VERIFIED' as const,
    },
  ];
  assert.equal(cashGap(events).minimumModeledGapTnd, '100.001');
  assert.equal(
    cashGap([...events, { ...events[0], id: 'unknown', date: null }]).minimumModeledGapTnd,
    null,
  );
  assert.equal(cashGap(events).timeline.at(-1)?.balanceTnd, '-0.001');
});
test('timeliness excludes synthetic, partial, disputed, overpaid and unknown dates from verified denominator', () => {
  const base = {
    id: 'p',
    amount: 1000n,
    dueAt: '2026-10-15T00:00:00.000Z',
    createdAt: from,
    provenance: 'RECORDED',
    disputed: false,
    settlements: [
      {
        amount: 1000n,
        date: '2026-10-14T00:00:00.000Z',
        verified: true,
        status: 'VERIFIED_SETTLED',
        reference: 'ref-b12-a',
      },
    ],
  };
  const rows = [
    base,
    {
      ...base,
      id: 'late',
      settlements: [{ ...base.settlements[0], date: '2026-10-16T00:00:00.000Z' }],
    },
    { ...base, id: 'synthetic', provenance: 'SYNTHETIC' },
    { ...base, id: 'unknown', dueAt: null },
    { ...base, id: 'disputed', disputed: true },
    { ...base, id: 'partial', settlements: [{ ...base.settlements[0], amount: 500n }] },
    {
      ...base,
      id: 'reported',
      settlements: [{ ...base.settlements[0], verified: false, status: 'REPORTED' }],
    },
  ];
  const result = paymentTimeliness(rows, from, to, new Date(to));
  assert.equal(result.eligiblePaymentCount, 2);
  assert.equal(result.verifiedOnTimeCount, 1);
  assert.equal(result.verifiedLateCount, 1);
  assert.equal(result.onTimePercentage, 50);
  assert.equal(result.unverifiedUnknownCount, 5);
  assert.equal(result.partialPaymentCount, 1);
  assert.equal(
    paymentTimeliness([{ ...base, provenance: 'SYNTHETIC' }], from, to).onTimePercentage,
    null,
  );
});
test('timeliness requires full settlement and reports completion on final partial payment date', () => {
  const result = paymentTimeliness(
    [
      {
        id: 'p',
        amount: 1001n,
        dueAt: '2026-10-10T00:00:00.000Z',
        createdAt: from,
        provenance: 'RECORDED',
        disputed: false,
        settlements: [
          {
            amount: 500n,
            date: '2026-10-09T00:00:00.000Z',
            verified: true,
            status: 'VERIFIED_SETTLED',
            reference: 'ref-b12-b',
          },
          {
            amount: 501n,
            date: '2026-10-11T00:00:00.000Z',
            verified: true,
            status: 'VERIFIED_SETTLED',
            reference: 'ref-b12-c',
          },
        ],
      },
    ],
    from,
    to,
  );
  assert.equal(result.verifiedLateCount, 1);
});
test('accounting export balances separate evidence groups, stable source IDs and half-open periods', () => {
  const rows = [
    {
      id: 'one',
      sourceId: 'event1',
      orderId: 'order1',
      date: from,
      kind: 'LIABILITY',
      amount: 1001n,
      evidence: 'SYNTHETIC',
    },
    {
      id: 'two',
      sourceId: 'event2',
      orderId: 'order1',
      date: from,
      kind: 'LIABILITY',
      amount: 2002n,
      evidence: 'SYNTHETIC',
    },
    {
      id: 'excluded',
      sourceId: 'event3',
      orderId: 'order1',
      date: to,
      kind: 'LIABILITY',
      amount: 99n,
      evidence: 'SYNTHETIC',
    },
  ];
  const result = accountingExport(rows, from, to);
  assert.equal(result.rowCount, 2);
  assert.equal(result.totals[0].amountTnd, '3.003');
  assert.match(result.csv, /event1/);
  assert.doesNotMatch(result.csv, /event3/);
});
test('CSV neutralizes formulas, controls, quotes and embedded newlines', () => {
  for (const value of ['=SUM(1,2)', ' @evil', '\t+evil', '-1', '\r=evil'])
    assert.ok(csvCell(value).charCodeAt(1) === 39);
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
});
test('notification operational alerts distinguish failed/uncertain and sending-age review', () => {
  assert.deepEqual(
    operationalAlerts({
      ready: true,
      oldestPendingAgeMs: 0,
      failedCount: 0,
      notificationFailures: 1,
      notificationAgeReview: 1,
    }),
    ['NOTIFICATION_REVIEW_REQUIRED', 'NOTIFICATION_SENDING_AGE_REVIEW'],
  );
});
test('structured logs redact contact, finance, health and credentials without dropping correlation', () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      output += chunk.toString();
      cb();
    },
  });
  const log = createLogger(stream);
  log.info(
    {
      correlationId: 'safe-id',
      email: 'private-person',
      amountTnd: 'private-finance',
      health: 'private-health',
      body: 'private-body',
      authorization: 'private-token',
      context: { email: 'private-nested' },
    },
    'fixed message',
  );
  assert.match(output, /safe-id/);
  assert.doesNotMatch(output, /private-/);
});
test('retention inventory covers material classes without inventing approved periods or wearable datasets', () => {
  assert.equal(RETENTION_INVENTORY.length, 11);
  assert.ok(
    RETENTION_INVENTORY.some((row) => row.dataClass === 'BUYER_ORDER_FEEDBACK'),
    'private buyer feedback has its own purpose, access and preservation entry',
  );
  assert.ok(
    RETENTION_INVENTORY.some((row) => row.dataClass === 'DEMO_VISITOR_FEEDBACK'),
    'showroom visitor feedback has its own purpose, access and preservation entry',
  );
  for (const row of RETENTION_INVENTORY) {
    assert.equal(row.retentionDuration, null);
    assert.equal(row.reviewStatus, 'PENDING_QUALIFIED_POLICY_REVIEW');
    assert.ok(row.breachResponseOwner);
    assert.doesNotMatch(row.dataClass, /wearable/i);
  }
});

test('contractual date evidence refuses ambiguous known/unknown inputs and unsupported settlement fields', async () => {
  const { contractualDueDateSchema } = await import('@nasj/contracts');
  const base = {
    payableId: 'payable',
    version: 1,
    basis: 'UNKNOWN',
    dueAt: null,
    sourceEvidence: 'Accepted source must be reviewed',
    reason: 'Record evidence without changing agreement',
  };
  assert.equal(contractualDueDateSchema.safeParse(base).success, true);
  assert.equal(
    contractualDueDateSchema.safeParse({ ...base, dueAt: '2026-10-15T00:00:00Z' }).success,
    false,
  );
  assert.equal(
    contractualDueDateSchema.safeParse({ ...base, basis: 'ACCEPTED_TERMS_EVIDENCE' }).success,
    false,
  );
  assert.equal(
    contractualDueDateSchema.safeParse({
      ...base,
      basis: 'ACCEPTED_TERMS_EVIDENCE',
      dueAt: '2026-10-15T00:00:00Z',
    }).success,
    true,
  );
  assert.equal(contractualDueDateSchema.safeParse({ ...base, bankVerified: true }).success, false);
});
test('financial review hashing is stable across object ordering and binds exact millimes and funding evidence', async () => {
  const { evidenceHash } = await import('../../src/modules/finance/review-policy.js');
  const a = {
    quote: 'q1',
    amount: 100001n,
    date: new Date('2026-10-15T00:00:00Z'),
    funding: { evidence: 'plan v1', status: 'DOCUMENTED_PLAN' },
  };
  assert.equal(
    evidenceHash(a),
    evidenceHash({ funding: a.funding, date: a.date, amount: a.amount, quote: a.quote }),
  );
  assert.notEqual(evidenceHash(a), evidenceHash({ ...a, amount: 100002n }));
  assert.notEqual(
    evidenceHash(a),
    evidenceHash({ ...a, funding: { ...a.funding, evidence: 'plan v2' } }),
  );
});
