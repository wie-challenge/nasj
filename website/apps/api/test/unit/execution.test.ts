import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatMilli,
  fundingDecision,
  netAfterReinspection,
  productionStage,
  requiredMilli,
} from '@nasj/contracts';

test('material requirements use exact thousandths and an explicit wastage allowance', () => {
  assert.equal(requiredMilli(500, 100, 0), 50_000);
  assert.equal(formatMilli(50_000), '50.000');
  assert.equal(requiredMilli(500, 100, 1000), 55_000);
  assert.throws(() => requiredMilli(500, 100, 1001));
});

test('synthetic funding is refused for any record that is not labeled synthetic', () => {
  assert.equal(fundingDecision('SYNTHETIC', 'SYNTHETIC_DEMO_NOT_A_PAYMENT'), 'SYNTHETIC_DEMO');
  assert.equal(fundingDecision('SYNTHETIC', undefined), 'FUNDING_UNCONFIRMED');
  assert.equal(fundingDecision('LIVE', 'SYNTHETIC_DEMO_NOT_A_PAYMENT'), 'FUNDING_UNCONFIRMED');
});

test('reinspection adds only the newly approved rejected pieces', () => {
  assert.deepEqual(
    netAfterReinspection(
      { approved: 80, rejected: 20, pending: 0, submitted: 100 },
      { scope: 15, approved: 12, rejected: 3, pending: 0 },
    ),
    { approved: 92, rejected: 8, pending: 0 },
  );
  assert.throws(() =>
    netAfterReinspection(
      { approved: 80, rejected: 20, pending: 0, submitted: 100 },
      { scope: 21, approved: 21, rejected: 0, pending: 0 },
    ),
  );
});

test('production stage stays distinct from commercial approval', () => {
  assert.equal(
    productionStage({
      committed: 0,
      released: 0,
      inProgress: 0,
      inQuality: 0,
      approved: 0,
      shippable: 0,
    }),
    'NOT_STARTED',
  );
  assert.equal(
    productionStage({
      committed: 40,
      released: 0,
      inProgress: 0,
      inQuality: 0,
      approved: 0,
      shippable: 0,
    }),
    'PARTIALLY_COMMITTED',
  );
  assert.equal(
    productionStage({
      committed: 40,
      released: 1,
      inProgress: 1,
      inQuality: 0,
      approved: 0,
      shippable: 0,
    }),
    'IN_PRODUCTION',
  );
});
