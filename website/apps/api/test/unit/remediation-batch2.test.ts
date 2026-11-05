import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVerifiedSettlement,
  verifiedPaidMillimes,
  simulatedPaidMillimes,
  compensationMetrics,
  verificationAvailability,
  clampVerifiedToObligation,
  buyerReceipt,
  shipmentProvenance,
  reconstructReceipt,
  receiptRuleVersion,
} from '@nasj/contracts';

/** Assert a commerce rule violation by its code (requireRule throws CommerceRuleError). */
const assertRule = (fn: () => unknown) =>
  assert.throws(fn, (error: { code?: string }) => error.code === 'DELIVERY_MISMATCH');

/* ---------------------------------------------------------------- CP5-G71 */

/**
 * A verified settlement fixture. `reference` is the authoritative payment identity - the unique
 * payment reference recorded on the execution record. Two events with different references are
 * two payments; the same reference twice is one payment replayed.
 */
const settlement = (
  status: string,
  bankVerified: boolean,
  amountMillimes: bigint,
  subjectKey = 'payable-1',
  reference = `ref-${subjectKey}-${amountMillimes}`,
) => ({ status, bankVerified, amountMillimes, subjectKey, reference });

test('G71: 60,000 + 40,000 millimes against one payable yields 100,000', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 60_000n, 'payable-1', 'bank-ref-aaa'),
    settlement('VERIFIED_SETTLED', true, 40_000n, 'payable-1', 'bank-ref-bbb'),
  ];
  // The Batch 1 implementation returned max-per-subjectKey = 60,000 and silently lost 40,000.
  assert.equal(verifiedPaidMillimes(rows), 100_000n);
});

test('G71: three distinct 30,000-millime payments yield 90,000', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 30_000n, 'payable-1', 'bank-ref-1'),
    settlement('VERIFIED_SETTLED', true, 30_000n, 'payable-1', 'bank-ref-2'),
    settlement('VERIFIED_SETTLED', true, 30_000n, 'payable-1', 'bank-ref-3'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 90_000n);
});

test('G71: duplicate events with the same payment reference count once', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 250_000n, 'payable-1', 'bank-ref-dup'),
    settlement('VERIFIED_SETTLED', true, 250_000n, 'payable-1', 'bank-ref-dup'),
    settlement('VERIFIED_SETTLED', true, 250_000n, 'payable-1', 'bank-ref-dup'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 250_000n);
});

test('G71: different valid payment references count independently', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 10_000n, 'payable-1', 'ref-a'),
    settlement('VERIFIED_SETTLED', true, 20_000n, 'payable-1', 'ref-b'),
    settlement('VERIFIED_SETTLED', true, 30_000n, 'payable-1', 'ref-c'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 60_000n);
});

test('G71: pending, failed, synthetic and unverified events never count as verified', () => {
  const rows = [
    settlement('VERIFICATION_PENDING', false, 50_000n, 'payable-1', 'p1'),
    settlement('FAILED', false, 50_000n, 'payable-1', 'p2'),
    settlement('SIMULATED_SETTLED', false, 50_000n, 'payable-1', 'p3'),
    settlement('VERIFIED_SETTLED', false, 50_000n, 'payable-1', 'p4'),
    settlement('VERIFIED_SETTLED', true, 50_000n, 'payable-1', 'p5'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 50_000n);
});

test('G71: calculations use exact integer millimes with no rounding drift', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 333_333n, 'payable-1', 'r1'),
    settlement('VERIFIED_SETTLED', true, 333_334n, 'payable-1', 'r2'),
    settlement('VERIFIED_SETTLED', true, 333_333n, 'payable-1', 'r3'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 1_000_000n);
  // A value that would lose precision as a JS number is carried exactly.
  assert.equal(
    verifiedPaidMillimes([settlement('VERIFIED_SETTLED', true, 9_007_199_254_740_993n)]),
    9_007_199_254_740_993n,
  );
});

test('G71: an event with no payment reference cannot be credited', () => {
  const rows = [
    {
      status: 'VERIFIED_SETTLED',
      bankVerified: true,
      amountMillimes: 50_000n,
      subjectKey: 'p',
      reference: '',
    },
    settlement('VERIFIED_SETTLED', true, 25_000n, 'p', 'real-ref'),
  ];
  // Without a unique authoritative reference there is no identity, so no credit.
  assert.equal(verifiedPaidMillimes(rows), 25_000n);
});

test('G71: a non-positive verified amount is not credited', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 0n, 'p', 'zero'),
    settlement('VERIFIED_SETTLED', true, -5_000n, 'p', 'negative'),
    settlement('VERIFIED_SETTLED', true, 10_000n, 'p', 'positive'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 10_000n);
});

test('G71: a replayed reference is credited once even when amounts differ', () => {
  const rows = [
    settlement('VERIFIED_SETTLED', true, 60_000n, 'p', 'same-ref'),
    settlement('VERIFIED_SETTLED', true, 40_000n, 'p', 'same-ref'),
  ];
  // One payment identity. The first observation is authoritative.
  assert.equal(verifiedPaidMillimes(rows), 60_000n);
});

test('G71: overpayment is clamped at the obligation-aware call site, not inside the helper', () => {
  const rows = [settlement('VERIFIED_SETTLED', true, 999_000n, 'p', 'over')];
  // The pure helper reports what the evidence says.
  assert.equal(verifiedPaidMillimes(rows), 999_000n);
  // The call site, which knows the obligation, clamps.
  assert.equal(clampVerifiedToObligation(999_000n, 100_000n), 100_000n);
  assert.equal(clampVerifiedToObligation(40_000n, 100_000n), 40_000n);
  assert.equal(clampVerifiedToObligation(0n, 0n), 0n);
});

test('G71: simulated totals stay separate from verified totals', () => {
  const rows = [
    settlement('SIMULATED_SETTLED', false, 100_000n, 'p1', 'sim1'),
    settlement('VERIFIED_SETTLED', true, 40_000n, 'p1', 'real1'),
  ];
  assert.equal(verifiedPaidMillimes(rows), 40_000n);
  assert.equal(simulatedPaidMillimes(rows), 100_000n);
});

test('G71: a synthetic settlement cannot reduce the balance owed', () => {
  const earned = 100_000n;
  const simulated = [settlement('SIMULATED_SETTLED', false, 100_000n, 'p1', 'sim')];
  const verified = verifiedPaidMillimes(simulated);
  assert.equal(verified, 0n);
  assert.equal(earned - verified, 100_000n);
});

/* ----------------------------------------------------- G71 availability */

test('G71: availability distinguishes no authority from zero payments', () => {
  // No approved verification authority exists (the D1 state).
  assert.equal(
    verificationAvailability({ authorityApproved: false, verifiedPaid: 0n }),
    'UNAVAILABLE_NO_APPROVED_SETTLEMENT_POLICY',
  );
  // Authority approved, no payments recorded yet.
  assert.equal(
    verificationAvailability({ authorityApproved: true, verifiedPaid: 0n }),
    'AVAILABLE_NO_VERIFIED_PAYMENTS',
  );
  // Authority approved with payments.
  assert.equal(
    verificationAvailability({ authorityApproved: true, verifiedPaid: 1n }),
    'AVAILABLE_VERIFIED_PAYMENTS',
  );
});

test('G71: availability is never inferred from a positive total alone', () => {
  // A positive amount without an approved authority is still unavailable - the amount is not
  // evidence of capability.
  assert.equal(
    verificationAvailability({ authorityApproved: false, verifiedPaid: 500_000n }),
    'UNAVAILABLE_NO_APPROVED_SETTLEMENT_POLICY',
  );
});

test('G71: compensation metrics report a supported zero distinctly from unavailable', () => {
  const supportedZero = compensationMetrics({
    agreedMillimes: '100000',
    earnedMillimes: '100000',
    payableMillimes: '100000',
    simulatedPaidMillimes: '0',
    verifiedPaidMillimes: '0',
    authorityApproved: true,
  });
  assert.equal(supportedZero.verifiedPaid, '0.000');
  assert.equal(supportedZero.verifiedAvailable, true);
  assert.equal(supportedZero.verificationAvailability, 'AVAILABLE_NO_VERIFIED_PAYMENTS');

  const unavailable = compensationMetrics({
    agreedMillimes: '100000',
    earnedMillimes: '100000',
    payableMillimes: '100000',
    simulatedPaidMillimes: '0',
    verifiedPaidMillimes: '0',
    authorityApproved: false,
  });
  assert.equal(unavailable.verifiedPaid, '0.000');
  assert.equal(unavailable.verifiedAvailable, false);
  assert.equal(unavailable.verificationAvailability, 'UNAVAILABLE_NO_APPROVED_SETTLEMENT_POLICY');
});

test('G71: a positive verified total requires an approved authority to read as available', () => {
  const metrics = compensationMetrics({
    agreedMillimes: '100000',
    earnedMillimes: '100000',
    payableMillimes: '0',
    simulatedPaidMillimes: '0',
    verifiedPaidMillimes: '100000',
    authorityApproved: false,
  });
  assert.equal(metrics.verifiedAvailable, false);
  assert.equal(metrics.verificationAvailability, 'UNAVAILABLE_NO_APPROVED_SETTLEMENT_POLICY');
});

test('G71: the verified predicate is unchanged for a single row', () => {
  assert.equal(isVerifiedSettlement({ status: 'VERIFIED_SETTLED', bankVerified: true }), true);
  assert.equal(isVerifiedSettlement({ status: 'VERIFIED_SETTLED', bankVerified: false }), false);
  assert.equal(isVerifiedSettlement({ status: 'SIMULATED_SETTLED', bankVerified: false }), false);
});

/* ---------------------------------------------------------------- CP5-G20 */

const receipt = (
  shipped: number,
  reported: number,
  received: number,
  declared: number,
  damaged = 0,
) =>
  shipmentProvenance({
    shipped,
    operatorReported: reported,
    buyerReceived: received,
    buyerDeclaredMissing: declared,
    accepted: received - damaged,
    damaged,
  });

test('G20: a clean delivery has no shortage and no declaration', () => {
  const r = receipt(100, 100, 100, 0);
  assert.equal(r.operatorNotReported, 0);
  assert.equal(r.buyerDeclaredMissing, 0);
  assert.equal(r.totalUnaccounted, 0);
  assert.equal(r.damaged, 0);
  assert.equal(r.discrepancy, false);
});

test('G20: an operator gap is not a buyer declaration', () => {
  const r = receipt(100, 80, 80, 0);
  assert.equal(r.operatorNotReported, 20);
  assert.equal(r.buyerDeclaredMissing, 0);
  assert.equal(r.totalUnaccounted, 20);
  assert.equal(r.discrepancy, true);
});

test('G20: a buyer declaration alone is attributed to the buyer', () => {
  const r = receipt(100, 100, 90, 10);
  assert.equal(r.operatorNotReported, 0);
  assert.equal(r.buyerDeclaredMissing, 10);
  assert.equal(r.totalUnaccounted, 10);
});

test('G20: both components are reported separately and sum to the total', () => {
  const r = receipt(100, 90, 85, 5);
  assert.equal(r.operatorNotReported, 10);
  assert.equal(r.buyerDeclaredMissing, 5);
  assert.equal(r.totalUnaccounted, 15);
});

test('G20: damaged units stay distinct from missing and are never added to shortage', () => {
  const r = receipt(100, 100, 100, 0, 10);
  assert.equal(r.damaged, 10);
  assert.equal(r.accepted, 90);
  assert.equal(r.totalUnaccounted, 0);
  assert.equal(r.discrepancy, true);
});

test('G20: reported greater than shipped is rejected before subtraction', () => {
  assertRule(() => receipt(100, 101, 101, 0));
});

test('G20: received greater than reported is rejected', () => {
  assertRule(() => receipt(100, 90, 95, 0));
});

test('G20: a buyer declaration inconsistent with reported minus received is rejected', () => {
  // reported 100, received 90 implies a declaration of exactly 10.
  assertRule(() => receipt(100, 100, 90, 5));
});

test('G20: shipped 100, reported 100, received 90, declared 0 is rejected', () => {
  assertRule(() => receipt(100, 100, 90, 0));
});

test('G20: accepted plus damaged must equal received', () => {
  assertRule(() =>
    shipmentProvenance({
      shipped: 100,
      operatorReported: 100,
      buyerReceived: 100,
      buyerDeclaredMissing: 0,
      accepted: 80,
      damaged: 0,
    }),
  );
});

test('G20: negative quantities are rejected', () => {
  assertRule(() => receipt(100, 100, 100, -1));
});

/* ------------------------------------------- G20 historical reconstruction */

test('G20: reconstruction is exact for a pre-change record', () => {
  // Pre-change: stored `missing` WAS the buyer declaration.
  const stored = { shipped: 100, operatorReported: 90, buyerReceived: 85, storedMissing: 5 };
  const r = reconstructReceipt(stored);
  assert.equal(r.buyerDeclaredMissing, 5);
  assert.equal(r.operatorNotReported, 10);
  assert.equal(r.totalUnaccounted, 15);
});

test('G20: reconstruction is exact for a post-change record', () => {
  // Post-change: stored `missing` IS the total shortage.
  const stored = { shipped: 100, operatorReported: 90, buyerReceived: 85, storedMissing: 15 };
  const r = reconstructReceipt(stored);
  assert.equal(r.buyerDeclaredMissing, 5);
  assert.equal(r.operatorNotReported, 10);
  assert.equal(r.totalUnaccounted, 15);
});

test('G20: reconstruction never reads the stored missing value', () => {
  // Same shipment facts, deliberately wrong stored value: the formulas ignore it.
  const facts = { shipped: 100, operatorReported: 80, buyerReceived: 80 };
  const a = reconstructReceipt({ ...facts, storedMissing: 0 });
  const b = reconstructReceipt({ ...facts, storedMissing: 20 });
  assert.equal(a.buyerDeclaredMissing, 0);
  assert.equal(b.buyerDeclaredMissing, 0);
  assert.equal(a.operatorNotReported, 20);
  assert.equal(b.operatorNotReported, 20);
});

test('G20: reconstruction identifies which rule version a stored value matches', () => {
  assert.equal(
    receiptRuleVersion({ shipped: 100, operatorReported: 90, buyerReceived: 85, storedMissing: 5 }),
    'BUYER_DECLARATION',
  );
  assert.equal(
    receiptRuleVersion({
      shipped: 100,
      operatorReported: 90,
      buyerReceived: 85,
      storedMissing: 15,
    }),
    'TOTAL_SHORTAGE',
  );
  // A clean delivery is identical under both rules and must not be over-claimed.
  assert.equal(
    receiptRuleVersion({
      shipped: 100,
      operatorReported: 100,
      buyerReceived: 100,
      storedMissing: 0,
    }),
    'AMBIGUOUS',
  );
});

test('G20: reconstruction rejects facts that violate conservation', () => {
  assertRule(() =>
    reconstructReceipt({ shipped: 100, operatorReported: 90, buyerReceived: 95, storedMissing: 0 }),
  );
});

/* ---------------------------------------------- G20 conservation contract */

test('G20: buyerReceipt still reconciles against shipped, not reported', () => {
  const r = buyerReceipt({ shipped: 100, reported: 80, received: 80, accepted: 80, missing: 0 });
  assert.equal(r.shortage, 20);
  assert.equal(r.notReported, 20);
  assert.equal(r.discrepancy, true);
});

test('G20: buyerReceipt rejects reported greater than shipped', () => {
  assertRule(() =>
    buyerReceipt({ shipped: 100, reported: 120, received: 120, accepted: 120, missing: 0 }),
  );
});
