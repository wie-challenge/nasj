import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTnd,
  formatTnd,
  addTnd,
  prorateTnd,
  MAX_TND_MILLIMES,
  exactCapacityQuantity,
  isCapacityRevision,
  canEditOrganization,
  canReviewOrganization,
} from '@nasj/contracts';
import { validateIdempotencyKey } from '../../src/modules/foundation/idempotency.js';

test('TND has exact scale, bounded addition and canonical serialization', () => {
  assert.equal(addTnd(parseTnd('0.1'), parseTnd('0.2')), 300n);
  assert.equal(formatTnd(parseTnd('1.001')), '1.001');
  assert.equal(parseTnd(formatTnd(MAX_TND_MILLIMES)), MAX_TND_MILLIMES);
  assert.equal(formatTnd(0n), '0.000');
  for (const invalid of ['-1', '01', '1.0001', '1e3', ' 1', 'NaN', '1.', '9223372036854775.808'])
    assert.throws(() => parseTnd(invalid));
  assert.throws(() => addTnd(MAX_TND_MILLIMES, 1n));
  assert.throws(() => addTnd(-1n, 1n));
  assert.throws(() => formatTnd(-1n));
});
test('HALF_UP rational rounding and round-trip properties', () => {
  assert.equal(prorateTnd(1n, 1n, 2n), 1n);
  assert.equal(prorateTnd(1n, 1n, 3n), 0n);
  assert.equal(prorateTnd(5n, 1n, 2n), 3n);
  assert.throws(() => prorateTnd(1n, 1n, 0n));
  assert.throws(() => prorateTnd(1n, -1n, 1n));
  assert.throws(() => prorateTnd(MAX_TND_MILLIMES, 2n, 1n));
  for (let amount = 0n; amount < 10000n; amount += 7n)
    assert.equal(parseTnd(formatTnd(amount)), amount);
});
test('capacity permits zero and exact cents; rejects loss and impossible quantities', () => {
  assert.equal(exactCapacityQuantity(0), '0.00');
  assert.equal(exactCapacityQuantity(12.5), '12.50');
  assert.equal(exactCapacityQuantity(100000), '100000.00');
  for (const invalid of [-1, NaN, Infinity, 100000.01, 0.001, 0.1 + 0.2])
    assert.throws(() => exactCapacityQuantity(invalid));
});
test('capacity revisions require identical positive periods; adjacent periods are allowed by query', () => {
  const period = { effectiveFrom: new Date('2027-01-01'), effectiveTo: new Date('2027-01-08') };
  assert.equal(isCapacityRevision(period, []), true);
  assert.equal(isCapacityRevision(period, [period]), true);
  assert.equal(
    isCapacityRevision(period, [{ ...period, effectiveTo: new Date('2027-01-09') }]),
    false,
  );
  assert.equal(isCapacityRevision({ ...period, effectiveTo: period.effectiveFrom }, []), false);
  assert.equal(isCapacityRevision({ ...period, effectiveFrom: new Date('invalid') }, []), false);
});
test('all implemented organization approval transitions are explicit', () => {
  const states = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
  for (const state of states) {
    assert.equal(canEditOrganization(state), state === 'DRAFT' || state === 'REJECTED');
    for (const decision of ['APPROVED', 'REJECTED', 'SUSPENDED'] as const) {
      assert.equal(
        canReviewOrganization(state, decision),
        decision === 'SUSPENDED'
          ? state === 'APPROVED'
          : state === 'PENDING_REVIEW' || state === 'SUSPENDED',
      );
    }
  }
});
test('idempotency key is optional but bounded and cannot contain sensitive arbitrary text', () => {
  assert.equal(validateIdempotencyKey(undefined), undefined);
  assert.equal(validateIdempotencyKey('valid_key_12345678'), 'valid_key_12345678');
  for (const key of ['', 'short', 'x'.repeat(129), 'secret/key/1234567'])
    assert.throws(() => validateIdempotencyKey(key));
});
