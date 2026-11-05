import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDelayRisk,
  compareForecast,
  forecastErrorSummary,
  offerDistribution,
  fulfillmentMetrics,
  compensationMetrics,
  effectiveEarnings,
  supressOutcome,
  producerShare,
  earningsFromObservedTime,
  alertIdentity,
  MINIMUM_COHORT,
} from '@nasj/contracts';

const base = {
  now: '2026-11-01T09:00:00.000+01:00',
  deadline: '2026-11-12T17:00:00.000+01:00',
  acceptedQuantity: 100,
  reportedProgress: 35,
  confirmedCapacity: 200,
  materialShortageOpen: false,
  qualityRejectionOpen: false,
  approvedScheduleChangeTo: null,
  requiredInputsMissing: [] as string[],
};

test('on-track risk needs complete data and no negative signal', () => {
  const result = assessDelayRisk({ ...base, reportedProgress: 90, confirmedCapacity: 10 });
  assert.equal(result.state, 'ON_TRACK');
  assert.equal(result.remainingQuantity, 10);
  assert.ok(result.reasons.some((reason) => reason.code === 'CAPACITY_SUFFICIENT'));
});

test('at-risk risk is triggered by a capacity shortfall', () => {
  const result = assessDelayRisk({ ...base, confirmedCapacity: 40 });
  assert.equal(result.state, 'AT_RISK');
  assert.ok(result.reasons.some((reason) => reason.code === 'CAPACITY_SHORTFALL'));
});

test('at-risk risk is triggered by an open material shortage', () => {
  const result = assessDelayRisk({ ...base, materialShortageOpen: true });
  assert.equal(result.state, 'AT_RISK');
  assert.ok(result.reasons.some((reason) => reason.code === 'MATERIAL_SHORTAGE'));
});

test('overdue requires a passed deadline with outstanding work', () => {
  const result = assessDelayRisk({
    ...base,
    now: '2026-11-20T09:00:00.000+01:00',
    reportedProgress: 35,
  });
  assert.equal(result.state, 'OVERDUE');
  assert.equal(result.remainingQuantity, 65);
  assert.ok(result.reasons.some((reason) => reason.code === 'DEADLINE_PASSED'));
});

test('missing progress is insufficient data, never on track', () => {
  const result = assessDelayRisk({ ...base, reportedProgress: null, confirmedCapacity: null });
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.equal(result.remainingQuantity, null);
  assert.ok(result.unknowns.includes('PROGRESS_OR_QUANTITY_UNKNOWN'));
});

test('an approved schedule change moves the applicable deadline', () => {
  const result = assessDelayRisk({
    ...base,
    now: '2026-11-20T09:00:00.000+01:00',
    approvedScheduleChangeTo: '2026-12-05T17:00:00.000+01:00',
    confirmedCapacity: 500,
  });
  assert.equal(result.state, 'ON_TRACK');
  assert.ok(result.reasons.some((reason) => reason.code === 'APPROVED_SCHEDULE_CHANGE'));
});

test('forecast comparison only computes error from comparable observations', () => {
  const pending = compareForecast({
    forecastedFor: '2026-11-12T17:00:00.000+01:00',
    actualCompletedAt: null,
  });
  assert.equal(pending.status, 'NOT_COMPLETED');
  assert.equal(pending.absoluteErrorDays, null);

  const done = compareForecast({
    forecastedFor: '2026-11-12T17:00:00.000+01:00',
    actualCompletedAt: '2026-11-15T17:00:00.000+01:00',
  });
  assert.equal(done.status, 'COMPARABLE');
  assert.equal(done.observedDifferenceDays, 3);
  assert.equal(done.absoluteErrorDays, 3);
});

test('forecast summary reports no accuracy when nothing is comparable', () => {
  const summary = forecastErrorSummary([
    compareForecast({ forecastedFor: '2026-11-12T17:00:00.000+01:00', actualCompletedAt: null }),
  ]);
  assert.equal(summary.observations, 0);
  assert.equal(summary.meanAbsoluteErrorDays, null);
  assert.ok(summary.note.includes('No accuracy figure'));
});

test('fairness distribution suppresses a cohort below the minimum', () => {
  const small = offerDistribution([
    { artisanProfileId: 'a', offered: 10, accepted: 5, declined: 1, expired: 0 },
    { artisanProfileId: 'b', offered: 8, accepted: 4, declined: 0, expired: 0 },
  ]);
  assert.equal(small.suppressed, true);
  assert.deepEqual(small.rows, []);

  const rows = Array.from({ length: MINIMUM_COHORT }, (_, index) => ({
    artisanProfileId: `p${index}`,
    offered: 10,
    accepted: 5,
    declined: 1,
    expired: 0,
  }));
  const published = offerDistribution(rows);
  assert.equal(published.suppressed, false);
  assert.equal(published.rows.length, MINIMUM_COHORT);
  assert.ok(published.note.includes('voluntary'));
});

test('fulfillment ratios carry denominators and stay null when undefined', () => {
  const metrics = fulfillmentMetrics({
    rfqs: 1,
    acceptedQuotations: 1,
    offeredQuantity: 120,
    artisanAcceptedQuantity: 100,
    producedPieces: 80,
    qualityApprovedPieces: 75,
    shippedPieces: 75,
    buyerAcceptedPieces: 70,
    requiredQuantity: 100,
  });
  assert.equal(metrics.produced.value, 80);
  assert.equal(metrics.produced.denominator, 100);
  const empty = fulfillmentMetrics({
    rfqs: 0,
    acceptedQuotations: 0,
    offeredQuantity: 0,
    artisanAcceptedQuantity: 0,
    producedPieces: 0,
    qualityApprovedPieces: 0,
    shippedPieces: 0,
    buyerAcceptedPieces: 0,
    requiredQuantity: 0,
  });
  assert.equal(empty.produced.value, null, 'a zero denominator is unavailable, not 0%');
});

test('compensation never merges agreed, earned, payable and verified amounts', () => {
  const metrics = compensationMetrics({
    agreedMillimes: '1200000',
    earnedMillimes: '900000',
    payableMillimes: '900000',
    simulatedPaidMillimes: '400000',
    verifiedPaidMillimes: '0',
  });
  assert.equal(metrics.agreed, '1200.000');
  assert.equal(metrics.earned, '900.000');
  assert.equal(metrics.simulatedPaid, '400.000');
  assert.equal(metrics.verifiedPaid, '0.000');
  assert.equal(metrics.verifiedAvailable, false);
  assert.ok(metrics.note.includes('never combined'));
});

test('effective earnings refuse unknown hours instead of assuming zero', () => {
  const unknown = effectiveEarnings({
    agreedMillimes: '120000',
    observedMinutes: null,
    scope: 'batch',
  });
  assert.equal(unknown.status, 'UNAVAILABLE');
  assert.equal(unknown.hourlyTnd, null);
  const known = effectiveEarnings({
    agreedMillimes: '120000',
    observedMinutes: 90,
    scope: 'batch',
  });
  assert.equal(known.status, 'AVAILABLE');
  assert.equal(known.hourlyTnd, '80.000');
});

test('association outcomes suppress a small cohort', () => {
  const suppressed = supressOutcome({
    groupCount: 3,
    acceptedProduction: 100,
    deliveredOutput: 90,
    qualityApproved: 88,
    aggregateCompensationTnd: '900.000',
    period: '2026-11',
    evidence: 'SYNTHETIC',
  });
  assert.equal(suppressed.suppressed, true);
  const published = supressOutcome({
    groupCount: 6,
    acceptedProduction: 100,
    deliveredOutput: 90,
    qualityApproved: 88,
    aggregateCompensationTnd: '900.000',
    period: '2026-11',
    evidence: 'SYNTHETIC',
  });
  assert.equal(published.suppressed, false);
});

test('cohort threshold is a policy input, not a hard-coded constant', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({
    artisanProfileId: `p${i}`,
    offered: 1,
    accepted: 1,
    declined: 0,
    expired: 0,
  }));
  assert.equal(offerDistribution(rows).suppressed, true);
  assert.equal(offerDistribution(rows, 2).suppressed, false);
});

test('producer share is aggregate-only and suppresses a small cohort', () => {
  const small = producerShare({
    agreedCompensationMillimes: '500000',
    netQuotationRevenueMillimes: '2000000',
    cohort: 2,
  });
  assert.equal(small.suppressed, true);
  const shown = producerShare({
    agreedCompensationMillimes: '500000',
    netQuotationRevenueMillimes: '2000000',
    cohort: 6,
  });
  assert.equal(shown.suppressed, false);
  if (!shown.suppressed) {
    assert.equal(shown.sharePercent, 25);
    assert.equal(shown.numeratorTnd, '500.000');
    assert.equal(shown.denominatorTnd, '2000.000');
    assert.ok(shown.formula.includes('NET_QUOTATION_REVENUE'));
  }
});

test('observed-time earnings require consent and a measured duration', () => {
  const none = earningsFromObservedTime({
    agreedMillimes: '120000',
    coveredQuantity: 100,
    records: [],
    scope: 'batch',
  });
  assert.equal(none.status, 'UNAVAILABLE');
  const unconsented = earningsFromObservedTime({
    agreedMillimes: '120000',
    coveredQuantity: 100,
    records: [
      {
        consented: false,
        observedMinutes: 90,
        observedUnits: 100,
        periodFrom: '2026-01-01T00:00:00Z',
        periodTo: '2026-01-01T02:00:00Z',
        evidence: 'OBSERVED',
      },
    ],
    scope: 'batch',
  });
  assert.equal(unconsented.status, 'UNAVAILABLE');
  const ok = earningsFromObservedTime({
    agreedMillimes: '120000',
    coveredQuantity: 100,
    records: [
      {
        consented: true,
        observedMinutes: 90,
        observedUnits: 100,
        periodFrom: '2026-01-01T00:00:00Z',
        periodTo: '2026-01-01T02:00:00Z',
        evidence: 'OBSERVED',
      },
    ],
    scope: 'batch',
  });
  assert.equal(ok.status, 'AVAILABLE');
  assert.equal(ok.hourlyTnd, '80.000');
});

test('alert identity is stable for the same condition on the same day', () => {
  const base = { batchId: 'b1', ruleVersion: 1, observedAt: '2026-11-01T10:00:00Z' };
  const a = alertIdentity({ ...base, reasons: [{ code: 'X' }, { code: 'Y' }] });
  const b = alertIdentity({ ...base, reasons: [{ code: 'Y' }, { code: 'X' }] });
  const nextDay = alertIdentity({
    ...base,
    observedAt: '2026-11-02T10:00:00Z',
    reasons: [{ code: 'X' }, { code: 'Y' }],
  });
  assert.equal(a, b, 'reason order does not change identity');
  assert.notEqual(a, nextDay, 'a new day raises a new alert');
});

test('stale progress remains provisional and does not use the deadline as the current clock', () => {
  const result = assessDelayRisk({ ...base, lastProgressAt: '2026-10-01T09:00:00Z' });
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.ok(result.unknowns.includes('PROGRESS_STALE'));
});
