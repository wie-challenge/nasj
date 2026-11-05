import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agreedProducerShare,
  allocatePieces,
  buyerReceipt,
  CommerceRuleError,
  formatShare,
  plannedContribution,
} from '@nasj/contracts';

test('producer share uses one agreed scope and withholds a small group', () => {
  const share = agreedProducerShare({
    compensationMillimes: 6_000_000n,
    quotationMillimes: 10_000_000n,
    refundMillimes: 0n,
    artisanCount: 3,
  });
  assert.equal(share.availability, 'AVAILABLE');
  assert.equal(share.basis, 'AGREED_NOT_PAID');
  assert.equal(share.basisPoints, 6000);
  assert.equal(formatShare(share.basisPoints), '60.00%');
  const hidden = agreedProducerShare({
    compensationMillimes: 6_000_000n,
    quotationMillimes: 10_000_000n,
    refundMillimes: 0n,
    artisanCount: 1,
  });
  assert.equal(hidden.availability, 'UNAVAILABLE_SMALL_GROUP');
  assert.equal(hidden.basisPoints, null);
  const missing = agreedProducerShare({
    compensationMillimes: 1_000n,
    quotationMillimes: 1_000n,
    refundMillimes: 1_000n,
    artisanCount: 3,
  });
  assert.equal(missing.availability, 'UNAVAILABLE_DENOMINATOR');
});

test('accepted pieces are allocated without exceeding a shipment part', () => {
  const parts = allocatePieces(
    [
      { id: 'a', quantity: 20 },
      { id: 'b', quantity: 15 },
    ],
    30,
  );
  assert.equal(
    parts.reduce((total, part) => total + part.pieces, 0),
    30,
  );
  assert.ok(parts.every((part) => part.pieces <= (part.id === 'a' ? 20 : 15)));
});

test('buyer receipt keeps missing and damaged pieces out of the accepted count', () => {
  // Conservation is measured against the shipped quantity, not the operator's report, so the
  // caller must state both. See CP5-G20.
  const receipt = buyerReceipt({
    shipped: 100,
    reported: 100,
    received: 95,
    accepted: 90,
    missing: 5,
    damaged: 5,
  });
  assert.equal(receipt.damaged, 5);
  assert.equal(receipt.shortage, 5);
  assert.equal(receipt.discrepancy, true);
  assert.deepEqual(
    buyerReceipt({ shipped: 10, reported: 10, received: 10, accepted: 10, missing: 0 }),
    {
      damaged: 0,
      shortage: 0,
      notReported: 0,
      discrepancy: false,
    },
  );
  assert.throws(
    () =>
      buyerReceipt({
        shipped: 10,
        reported: 10,
        received: 10,
        accepted: 10,
        missing: 0,
        damaged: 2,
      }),
    CommerceRuleError,
  );
});

test('planned contribution is not reported when cost exceeds the quotation', () => {
  assert.deepEqual(plannedContribution(10_000n, 4_000n), { status: 'PLANNED', millimes: 6_000n });
  assert.deepEqual(plannedContribution(4_000n, 10_000n), { status: 'UNAVAILABLE', millimes: null });
});
