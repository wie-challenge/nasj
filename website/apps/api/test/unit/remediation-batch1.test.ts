import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVerifiedSettlement,
  isOpenSettlement,
  verifiedPaidMillimes,
  simulatedPaidMillimes,
  compensationMetrics,
  buyerReceipt,
  custodyConservation,
} from '@nasj/contracts';
import {
  projectBuyerDocument,
  projectBuyerSnapshot,
} from '../../src/modules/procurement/buyer-document.js';

/* ---------------------------------------------------------------- CP5-G71 */

// Batch 2 changed the verified-payment identity from `subjectKey` (the payable) to `reference`
// (the unique payment reference). These fixtures gain a reference derived from their arguments so
// each distinct fixture is a distinct payment, which is what the Batch 1 assertions intend.
const settlement = (
  status: string,
  bankVerified: boolean,
  amountMillimes: bigint,
  subjectKey = 'payable-1',
  reference = `ref-${subjectKey}-${amountMillimes}`,
) => ({ status, bankVerified, amountMillimes, subjectKey, reference });

test('G71: a synthetic settlement is never a verified payment, whatever its status', () => {
  for (const status of [
    'SCHEDULED',
    'SIMULATED_INITIATED',
    'SIMULATED_SETTLED',
    'SIMULATED_FAILED',
    'INITIATED',
    'FAILED',
    'PENDING',
  ])
    assert.equal(isVerifiedSettlement({ status, bankVerified: false }), false, status);

  // Settled *and* bank reconciled is the only combination that counts.
  assert.equal(isVerifiedSettlement({ status: 'VERIFIED_SETTLED', bankVerified: true }), true);
  // A settled row the bank has not reconciled is still not payment.
  assert.equal(isVerifiedSettlement({ status: 'VERIFIED_SETTLED', bankVerified: false }), false);
  // A reconciled row in another state is not payment either.
  assert.equal(isVerifiedSettlement({ status: 'INITIATED', bankVerified: true }), false);
});

test('G71: five simulated settlements produce zero verified participation', () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    settlement('SIMULATED_SETTLED', false, 100_000n, `payable-${i}`),
  );
  assert.equal(verifiedPaidMillimes(rows), 0n);
  // The synthetic figure is preserved and reported separately rather than discarded.
  assert.equal(simulatedPaidMillimes(rows), 500_000n);
});

test('G71: one verified payment yields exactly that participation', () => {
  const rows = [settlement('VERIFIED_SETTLED', true, 250_000n)];
  assert.equal(verifiedPaidMillimes(rows), 250_000n);
});

test('G71: mixed verified and unverified records credit only the verified one', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 250_000n, 'p1'),
    settlement('SIMULATED_SETTLED', false, 250_000n, 'p2'),
    settlement('VERIFIED_SETTLED', false, 250_000n, 'p3'),
    settlement('SCHEDULED', false, 250_000n, 'p4'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 250_000n);
  assert.equal(simulatedPaidMillimes(rows), 250_000n);
});

test('G71: a partial verified payment credits only the amount actually paid', () => {
  const rows = [settlement('VERIFIED_SETTLED', true, 60_000n)];
  assert.equal(verifiedPaidMillimes(rows), 60_000n);
  const metrics = compensationMetrics({
    agreedMillimes: '100000',
    earnedMillimes: '100000',
    payableMillimes: '40000',
    simulatedPaidMillimes: '0',
    verifiedPaidMillimes: verifiedPaidMillimes(rows).toString(),
    // Batch 2: availability is a capability fact, not a consequence of a positive amount.
    authorityApproved: true,
  });
  assert.equal(metrics.verifiedPaid, '60.000');
  assert.equal(metrics.payable, '40.000');
  assert.equal(metrics.verifiedAvailable, true);
});

test('G71: a duplicated or replayed settlement attempt cannot inflate participation', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 250_000n, 'p1'),
    settlement('VERIFIED_SETTLED', true, 250_000n, 'p1'),
    settlement('VERIFIED_SETTLED', true, 250_000n, 'p1'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 250_000n);
});

test('G71: cross-tenant settlements stay separate per payable', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 100_000n, 'tenant-a:payable'),
    settlement('VERIFIED_SETTLED', true, 200_000n, 'tenant-b:payable'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 300_000n);
});

test('G71: a zero denominator and missing evidence stay unavailable, never zero-paid', () => {
  assert.equal(verifiedPaidMillimes([]), 0n);
  const metrics = compensationMetrics({
    agreedMillimes: '0',
    earnedMillimes: '0',
    payableMillimes: '0',
    simulatedPaidMillimes: '0',
    verifiedPaidMillimes: '0',
  });
  // Zero verified is reported as "unavailable", not as "paid zero".
  assert.equal(metrics.verifiedAvailable, false);
  assert.equal(metrics.verifiedPaid, '0.000');
});

test('G71: a synthetic settlement cannot reduce the balance owed', () => {
  const earned = 100_000n;
  const payables = [settlement('SIMULATED_SETTLED', false, 100_000n, 'p1')];
  const verified = verifiedPaidMillimes(payables);
  const simulated = simulatedPaidMillimes(payables);
  // Owed is earned less verified, so synthetic money does not clear a real debt.
  assert.equal((earned > verified ? earned - verified : 0n).toString(), '100000');
  assert.equal(simulated.toString(), '100000');
});

test('G71: open settlement states are known and never verified', () => {
  for (const status of ['SCHEDULED', 'INITIATED', 'PENDING', 'RETRY', 'SIMULATED_INITIATED']) {
    assert.equal(isOpenSettlement({ status }), true, status);
    assert.equal(isVerifiedSettlement({ status, bankVerified: false }), false, status);
  }
});

/* ---------------------------------------------------------------- CP5-G27 */

const internalSnapshot = {
  quoteId: 'q1',
  quoteVersion: 1,
  totalTnd: '1200.000',
  taxTnd: '228.000',
  netTnd: '972.000',
  taxBasisPoints: 1900,
  taxStatus: 'PENDING_LEGAL_REVIEW',
  taxPolicyReference: 'SYNTHETIC_POLICY',
  currency: 'TND',
  paymentTerms: 'Fifty percent on acceptance.',
  deliveryConditions: 'Delivered to the workshop door.',
  buyer: { id: 'buyer-org', name: 'Synthetic Buyer' },
  internal: { note: 'do not disclose', negotiatingFloorTnd: '900.000' },
  costEstimate: { marginBasisPoints: 2400, lines: [{ category: 'LABOR', rateTnd: '300.000' }] },
  feasibility: { effortMin: '2.5', effortMax: '3.0', constraints: [] },
  specification: { description: 'Embroidered panel', dimensions: '40x40cm', materials: 'cotton' },
};

test('G27: buyer projection keeps commercial terms and drops every costing container', () => {
  const projected = projectBuyerSnapshot(internalSnapshot);
  assert.equal(projected.totalTnd, '1200.000');
  assert.equal(projected.taxTnd, '228.000');
  assert.equal(projected.taxStatus, 'PENDING_LEGAL_REVIEW');
  assert.equal(projected.taxPolicyReference, 'SYNTHETIC_POLICY');
  assert.equal(projected.paymentTerms, 'Fifty percent on acceptance.');
  for (const key of ['internal', 'costEstimate', 'feasibility', 'marginBasisPoints', 'lines'])
    assert.equal(key in projected, false, `${key} must not reach a buyer`);
  assert.deepEqual(projected.specification, internalSnapshot.specification);
});

test('G27: nested terms.internal cannot leak through the invoice projection', () => {
  const content = {
    totalTnd: '1200.000',
    terms: { ...internalSnapshot },
    status: 'FINAL',
    provenance: 'SYNTHETIC',
  };
  const doc = projectBuyerDocument(content, {
    number: 7,
    kind: 'INVOICE',
    version: 1,
    status: 'FINAL',
    createdAt: '2026-10-31T00:00:00.000Z',
  });
  const serialized = JSON.stringify(doc);
  for (const secret of ['negotiatingFloorTnd', 'marginBasisPoints', 'rateTnd', 'effortMin'])
    assert.equal(serialized.includes(secret), false, `${secret} leaked into the invoice`);
  assert.equal(doc.totalTnd, '1200.000');
});

test('G27: a future nested object cannot leak through unrestricted serialization', () => {
  const content = {
    totalTnd: '10.000',
    futurePrivate: { marginBasisPoints: 999 },
  };
  const doc = projectBuyerDocument(content, {
    number: 1,
    kind: 'INVOICE',
    version: 1,
    status: 'FINAL',
    createdAt: '2026-10-31T00:00:00.000Z',
  });
  // Not allowlisted, so it is absent by construction.
  assert.equal('futurePrivate' in doc, false);
  assert.equal(JSON.stringify(doc).includes('marginBasisPoints'), false);
});

test('G27: an allowlisted field carrying a forbidden nested key throws rather than leaking', () => {
  assert.throws(
    () =>
      projectBuyerSnapshot({
        totalTnd: '10.000',
        specification: { description: 'ok', lines: [{ rateTnd: '1.000' }] },
      } as unknown as Record<string, unknown>),
    /BuyerDocumentLeak/,
  );
});

/* --------------------------------------------------------- CP5-G19 / G20 */

test('G20: a short operator report no longer conceals the shipped shortfall', () => {
  // Shipped 100, operator reported only 80 arriving, all 80 received and accepted.
  const receipt = buyerReceipt({
    shipped: 100,
    reported: 80,
    received: 80,
    accepted: 80,
    missing: 0,
  });
  assert.equal(receipt.shortage, 20);
  assert.equal(receipt.notReported, 20);
  assert.equal(receipt.discrepancy, true);
});

test('G20: a complete delivery with no damage has no discrepancy', () => {
  const receipt = buyerReceipt({
    shipped: 100,
    reported: 100,
    received: 100,
    accepted: 100,
    missing: 0,
  });
  assert.equal(receipt.shortage, 0);
  assert.equal(receipt.discrepancy, false);
});

test('G20: a partial receipt records the outstanding pieces', () => {
  const receipt = buyerReceipt({
    shipped: 100,
    reported: 100,
    received: 60,
    accepted: 60,
    missing: 40,
  });
  assert.equal(receipt.shortage, 40);
  assert.equal(receipt.discrepancy, true);
});

test('G20: damaged and rejected pieces are counted separately from shortage', () => {
  const receipt = buyerReceipt({
    shipped: 100,
    reported: 100,
    received: 100,
    accepted: 90,
    missing: 0,
    damaged: 10,
  });
  assert.equal(receipt.damaged, 10);
  assert.equal(receipt.shortage, 0);
  assert.equal(receipt.discrepancy, true);
});

test('G20: a report cannot exceed the shipped quantity', () => {
  // Batch 2 split the combined guard into ordered invariants, so the message changed while the
  // rule code did not. Assert the code: it is the contract, the prose is not.
  assert.throws(
    () => buyerReceipt({ shipped: 100, reported: 120, received: 120, accepted: 120, missing: 0 }),
    (error: { code?: string }) => error.code === 'DELIVERY_MISMATCH',
  );
});

test('G20: received plus missing must still equal the reported figure', () => {
  assert.throws(
    () => buyerReceipt({ shipped: 100, reported: 100, received: 50, accepted: 50, missing: 0 }),
    /DELIVERY_MISMATCH|Received/,
  );
});

test('G19: cumulative custody cannot create pieces beyond what was shipped', () => {
  assert.deepEqual(custodyConservation({ shipped: 100, previousHandovers: 0, quantity: 100 }), {
    moved: 100,
    remaining: 0,
  });
  assert.deepEqual(custodyConservation({ shipped: 100, previousHandovers: 60, quantity: 40 }), {
    moved: 100,
    remaining: 0,
  });
  assert.throws(
    () => custodyConservation({ shipped: 100, previousHandovers: 60, quantity: 41 }),
    /EXCESS_HANDOVER|exceed/,
  );
});

test('G19: a replayed handover is refused because earlier movement is counted', () => {
  // The first movement consumed the shipment; replaying it must fail.
  assert.throws(
    () => custodyConservation({ shipped: 100, previousHandovers: 100, quantity: 100 }),
    /EXCESS_HANDOVER|exceed/,
  );
});

test('G19: a zero-quantity handover is rejected', () => {
  assert.throws(
    () => custodyConservation({ shipped: 100, previousHandovers: 0, quantity: 0 }),
    /EXCESS_HANDOVER|exceed/,
  );
});
