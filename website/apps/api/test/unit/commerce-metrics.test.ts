import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCommerceMetrics, type MetricSource } from '@nasj/contracts';
const source = (): MetricSource => ({
  provenance: 'SYNTHETIC',
  status: 'IN_PRODUCTION',
  delivered: 0,
  rfq: { provenance: 'SYNTHETIC', quantity: 10 },
  batches: [{ provenance: 'SYNTHETIC', produced: 7, submitted: 6, approved: 5, offerId: 'offer' }],
  offers: [{ id: 'offer', provenance: 'SYNTHETIC', unitPayMillimes: 2345n }],
  payments: [
    {
      provenance: 'SYNTHETIC',
      kind: 'ARTISAN_PAYOUT',
      status: 'SETTLED',
      amountMillimes: 2000n,
      evidenceType: 'SIMULATED_SETTLEMENT',
    },
  ],
});
test('synthetic partial fulfillment carries denominators and exact earned/outstanding millimes', () => {
  const input = source();
  input.payments.push({
    provenance: 'SYNTHETIC',
    kind: 'BUYER_RECEIPT',
    status: 'SCHEDULED',
    amountMillimes: 100001n,
    evidenceType: null,
  });
  input.payments.push({
    provenance: 'SYNTHETIC',
    kind: 'ARTISAN_PAYOUT',
    status: 'SCHEDULED',
    amountMillimes: 9725n,
    evidenceType: null,
  });
  const metrics = deriveCommerceMetrics(input);
  assert.equal(metrics.finance.scheduledBuyerReceipt, '100001');
  assert.equal(metrics.finance.scheduledArtisanPayout, '9725');
  assert.deepEqual(metrics.fulfillment.produced, { numerator: 7, denominator: 10, ratio: 0.7 });
  assert.equal(metrics.fulfillment.shipped.numerator, 0);
  assert.equal(metrics.finance.artisanEarned, '11725');
  assert.equal(metrics.finance.artisanOutstanding, '9725');
  assert.equal(metrics.finance.verifiedSettlement, null);
  assert.equal(metrics.finance.actualCost, null);
});
test('empty sources do not invent rates or verified evidence; incompatible provenance is rejected', () => {
  const empty = {
    ...source(),
    rfq: { provenance: 'SYNTHETIC', quantity: 0 },
    batches: [],
    offers: [],
    payments: [],
  };
  assert.equal(deriveCommerceMetrics(empty).fulfillment.produced.ratio, null);
  assert.throws(() => deriveCommerceMetrics({ ...empty, provenance: 'OBSERVED' }));
  const forged = source();
  forged.payments[0].evidenceType = 'BANK_TRANSFER';
  assert.throws(() => deriveCommerceMetrics(forged));
});
test('persisted audit milestones preserve shipped and accepted history during disputes', () => {
  const metrics = deriveCommerceMetrics({
    ...source(),
    status: 'DISPUTED',
    delivered: 5,
    milestones: { shipped: true, accepted: true },
  });
  assert.equal(metrics.fulfillment.shipped.numerator, 5);
  assert.equal(metrics.fulfillment.received.numerator, 5);
  assert.equal(metrics.fulfillment.accepted.numerator, 5);
});
