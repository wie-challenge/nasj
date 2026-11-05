import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rfqStates,
  offerStates,
  batchStates,
  orderStates,
  paymentStates,
  rfqEdges,
  offerEdges,
  batchEdges,
  orderEdges,
  paymentEdges,
  transitionRfq,
  transitionOffer,
  transitionBatch,
  transitionOrder,
  transitionPayment,
  reconcileFulfillment,
  reconcileInspection,
  validateProgress,
  reconcileSettlement,
  payableForUnits,
  MAX_TND_MILLIMES,
  type CommerceRole,
  type Fulfillment,
} from '@nasj/contracts';
const roles: CommerceRole[] = [
  'BUYER',
  'ARTISAN',
  'PRODUCTION_MANAGER',
  'QUALITY_INSPECTOR',
  'FINANCE_MANAGER',
  'INVENTORY_LOGISTICS_COORDINATOR',
];
const full: Fulfillment = {
  requested: 10,
  reserved: 0,
  allocated: 10,
  produced: 10,
  submitted: 10,
  approved: 10,
  rejected: 0,
  pending: 0,
  delivered: 10,
};
test('all specified RFQ, offer, batch, order and payment transitions reject missing edges and roles', () => {
  const check = <S extends string>(
    states: readonly S[],
    edges: readonly (readonly [S, S, readonly CommerceRole[]])[],
    run: (from: S, to: S, roles: CommerceRole[]) => unknown,
  ) => {
    for (const from of states)
      for (const to of states) {
        const edge = edges.find((e) => e[0] === from && e[1] === to);
        if (!edge) assert.throws(() => run(from, to, roles), `${from} -> ${to}`);
        else {
          // Conditional cancellation is checked with a zero-obligation context below.
          if (
            to !== 'CANCELLED' ||
            from !== 'APPROVED' ||
            !states.includes('FUNDING_CONFIRMED' as S)
          )
            assert.doesNotThrow(() => run(from, to, [...edge[2]]));
          for (const role of roles.filter((r) => !edge[2].includes(r)))
            assert.throws(() => run(from, to, [role]));
        }
      }
  };
  check(rfqStates, rfqEdges, (a, b, r) =>
    transitionRfq(a, b, r, { quoteValid: true, quoteExpired: true }),
  );
  check(offerStates, offerEdges, (a, b, r) =>
    transitionOffer(a, b, r, { now: b === 'EXPIRED' ? 11 : 1, expiresAt: 10 }),
  );
  check(batchStates, batchEdges, (a, b, r) =>
    transitionBatch(a, b, r, {
      assigned: 10,
      produced: 10,
      approved: 10,
      pending: 0,
      reworkAccepted: true,
    }),
  );
  check(paymentStates, paymentEdges, (a, b, r) =>
    transitionPayment(a, b, r, { provenance: 'SYNTHETIC', evidenceType: 'SIMULATED_SETTLEMENT' }),
  );
  check(orderStates, orderEdges, (a, b, r) =>
    transitionOrder(a, b, r, {
      ...full,
      buyerDue: 1000n,
      buyerSettled: 1000n,
      artisanDue: 800n,
      artisanSettled: 800n,
      openDisputes: 0,
      pendingPayments: 0,
      materialsResolved: true,
    }),
  );
});
test('quantity reconciliation rejects excess allocation, production, QA, delivery and invalid numbers', () => {
  assert.doesNotThrow(() => reconcileFulfillment(full));
  for (const patch of [
    { allocated: 11 },
    { reserved: 1 },
    { produced: 11 },
    { submitted: 11 },
    { approved: 9 },
    { rejected: 1 },
    { delivered: 11 },
    { requested: 0 },
    { pending: -1 },
    { allocated: 1.5 },
    { produced: NaN },
  ])
    assert.throws(() => reconcileFulfillment({ ...full, ...patch }));
  assert.throws(() => validateProgress(250, 200, 260));
  assert.throws(() => validateProgress(250, 200, 199));
  assert.doesNotThrow(() => validateProgress(250, 200, 200));
  assert.doesNotThrow(() => reconcileInspection(250, 230, 15, 5));
  assert.throws(() => reconcileInspection(250, 230, 15, 6));
  assert.throws(() => reconcileInspection(250, 220, 20, 10, 230));
});
test('settlements are exact, bounded and cannot overpay approved quantities', () => {
  assert.equal(payableForUnits(1001n, 250), 250250n);
  assert.equal(payableForUnits(MAX_TND_MILLIMES, 1), MAX_TND_MILLIMES);
  assert.throws(() => payableForUnits(MAX_TND_MILLIMES, 2));
  assert.throws(() => payableForUnits(1000n, -1));
  assert.doesNotThrow(() => reconcileSettlement(1000n, 500n, 400n, 100n));
  for (const values of [
    [1000n, 1001n, 0n, 0n],
    [1000n, 500n, 400n, 101n],
    [1000n, -1n, 0n, 0n],
  ])
    assert.throws(() => reconcileSettlement(...(values as [bigint, bigint, bigint, bigint])));
});
test('deterministic quantity/settlement properties hold across partitions and boundary mutations', () => {
  for (let n = 1; n <= 500; n++) {
    const approved = Math.floor(n / 3),
      rejected = Math.floor(n / 4),
      pending = n - approved - rejected;
    reconcileFulfillment({
      requested: n,
      reserved: 0,
      allocated: n,
      produced: n,
      submitted: n,
      approved,
      rejected,
      pending,
      delivered: approved,
    });
    assert.throws(() => reconcileInspection(n, approved, rejected, pending + 1));
    const due = payableForUnits(1001n, n);
    reconcileSettlement(due, due / 2n, due - due / 2n);
    assert.throws(() => reconcileSettlement(due, due / 2n, due - due / 2n, 1n));
  }
});
test('expiry, explicit rework consent, evidence, funding and closure gates cannot be bypassed', () => {
  assert.throws(() =>
    transitionOffer('OFFERED', 'ACCEPTED', ['ARTISAN'], { now: 10, expiresAt: 10 }),
  );
  assert.throws(() => transitionRfq('QUOTED', 'ACCEPTED', ['BUYER'], { quoteValid: false }));
  assert.throws(() =>
    transitionBatch('REWORK_REQUESTED', 'IN_PROGRESS', ['ARTISAN'], {
      assigned: 10,
      produced: 10,
      approved: 5,
      pending: 0,
    }),
  );
  assert.throws(() =>
    transitionPayment('INITIATED', 'SETTLED', ['FINANCE_MANAGER'], { provenance: 'SYNTHETIC' }),
  );
  const context = {
    ...full,
    buyerDue: 1000n,
    buyerSettled: 1000n,
    artisanDue: 800n,
    artisanSettled: 800n,
    openDisputes: 0,
    pendingPayments: 0,
    materialsResolved: true,
  };
  for (const patch of [
    { artisanSettled: 799n },
    { buyerSettled: 999n },
    { openDisputes: 1 },
    { pendingPayments: 1 },
    { materialsResolved: false },
    { delivered: 9 },
  ])
    assert.throws(() =>
      transitionOrder('SETTLED', 'CLOSED', ['FINANCE_MANAGER'], { ...context, ...patch }),
    );
  assert.throws(() =>
    transitionOrder('APPROVED', 'FUNDING_CONFIRMED', ['FINANCE_MANAGER'], {
      ...context,
      buyerSettled: 0n,
    }),
  );
  assert.throws(() => transitionOrder('APPROVED', 'CANCELLED', ['BUYER'], context));
  assert.doesNotThrow(() =>
    transitionOrder('APPROVED', 'CANCELLED', ['BUYER'], {
      requested: 10,
      reserved: 0,
      allocated: 0,
      produced: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      delivered: 0,
      buyerDue: 1000n,
      buyerSettled: 0n,
      artisanDue: 0n,
      artisanSettled: 0n,
      openDisputes: 0,
      pendingPayments: 0,
      materialsResolved: false,
    }),
  );
});
