import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agreedProducerShare,
  calculateFinancialScenario,
  financialScenarioPresets,
  scenarioPercentage,
  signedScenarioTnd,
} from '@nasj/contracts';
const baseline = financialScenarioPresets.Baseline;
test('scenario exact baseline, rejection protection and producer-share policy agree', () => {
  const r = calculateFinancialScenario(baseline);
  assert.equal(r.revenue, 2850000n);
  assert.equal(r.artisanCompensation, 1200000n);
  assert.equal(r.costs, 2205000n);
  assert.equal(r.contribution, 645000n);
  assert.equal(r.breakEvenQuantity, 25n);
  assert.equal(r.effectiveHourlyMillimes, 8000n);
  assert.equal(
    r.producerShareBasisPoints,
    BigInt(
      agreedProducerShare({
        compensationMillimes: r.artisanCompensation,
        quotationMillimes: r.revenue,
        refundMillimes: 0n,
        artisanCount: 3,
      }).basisPoints!,
    ),
  );
});
test('effort changes effective pay, hourly mode changes compensation with half-up millime rounding', () => {
  assert.equal(
    calculateFinancialScenario({ ...baseline, effortMinutes: '120' }).effectiveHourlyMillimes,
    6000n,
  );
  const r = calculateFinancialScenario({
    ...baseline,
    compensationMode: 'HOURLY',
    hourlyRate: '0.001',
    effortMinutes: '30',
  });
  assert.equal(r.compensationPerUnit, 1n);
  assert.equal(r.artisanCompensation, 100n);
});
test('losses, zero quantity, zero revenue and nonpositive margins remain honest', () => {
  const r = calculateFinancialScenario(financialScenarioPresets.Conservative);
  assert.equal(r.contribution, -353000n);
  assert.equal(signedScenarioTnd(r.contribution), '-353.000');
  assert.equal(scenarioPercentage(r.contributionBasisPoints), '-27.69%');
  const zero = calculateFinancialScenario({ ...baseline, quantity: '0' });
  assert.equal(zero.revenue, 0n);
  assert.equal(zero.contribution, -210000n);
  assert.equal(zero.producerShareBasisPoints, null);
  assert.equal(zero.effectiveHourlyMillimes, null);
  const rejected = calculateFinancialScenario({ ...baseline, rejectionPercent: '100' });
  assert.equal(rejected.artisanCompensation, 1200000n);
  assert.equal(rejected.contributionBasisPoints, null);
  assert.equal(rejected.breakEvenQuantity, null);
  assert.equal(
    calculateFinancialScenario({ ...baseline, effortMinutes: '0' }).effectiveHourlyMillimes,
    null,
  );
});
test('precise decimal rounding, extreme ratios and inputs retain valid totals', () => {
  const r = calculateFinancialScenario({
    ...baseline,
    quantity: '1',
    sellingPrice: '0.001',
    rejectionPercent: '50',
    contingencyPercent: '0',
  });
  assert.equal(r.revenue, 1n);
  assert.equal(r.producerShareBasisPoints, 120000000n);
  assert.equal(r.producerSharePolicy, null);
  assert.equal(r.contribution, -218999n);
  assert.equal(
    calculateFinancialScenario({
      ...baseline,
      quantity: '1000000',
      hourlyRate: '1000000',
      compensationMode: 'HOURLY',
      effortMinutes: '100000',
    }).quantity,
    1000000n,
  );
});
test('missing, malformed, unsupported and out-of-range assumptions fail without mutating inputs', () => {
  const before = JSON.stringify(baseline);
  for (const [key, value] of [
    ['quantity', ''],
    ['quantity', '1.5'],
    ['quantity', '1000001'],
    ['sellingPrice', '1e3'],
    ['sellingPrice', '-1'],
    ['sellingPrice', '0.0001'],
    ['sellingPrice', '1000001'],
    ['effortMinutes', '1.2'],
    ['contingencyPercent', '100.01'],
    ['rejectionPercent', '0.001'],
    ['compensationMode', 'OTHER'],
  ])
    assert.throws(() => calculateFinancialScenario({ ...baseline, [key]: value }));
  calculateFinancialScenario({ ...baseline });
  assert.equal(JSON.stringify(baseline), before);
});

test('switching compensation modes ignores the inactive input and still validates the active amount', () => {
  const hourly = { ...baseline, compensationMode: 'HOURLY' as const, unitCompensation: '' };
  assert.equal(calculateFinancialScenario(hourly).artisanCompensation, 1200000n);
  assert.throws(() => calculateFinancialScenario({ ...hourly, hourlyRate: '' }), /hourlyRate/);
  assert.throws(
    () => calculateFinancialScenario({ ...hourly, compensationMode: 'UNIT' }),
    /unitCompensation/,
  );
  const unit = { ...baseline, hourlyRate: '' };
  assert.equal(calculateFinancialScenario(unit).artisanCompensation, 1200000n);
  assert.throws(
    () => calculateFinancialScenario({ ...unit, unitCompensation: '' }),
    /unitCompensation/,
  );
  assert.throws(
    () => calculateFinancialScenario({ ...unit, compensationMode: 'HOURLY' }),
    /hourlyRate/,
  );
});
