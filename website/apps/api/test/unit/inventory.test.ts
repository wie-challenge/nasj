import assert from 'node:assert/strict';
import { test } from 'node:test';
import { materialLotSchema, materialReceiptSchema, stockInvariant } from '@nasj/contracts';
test('inventory records exact integer thousandths and rejects forged verification', () => {
  const base = {
    materialCode: 'cotton',
    name: 'Cotton',
    unit: 'METERS',
    lotReference: 'demo-lot',
    supplierReference: 'demo-source',
    evidenceReference: 'Synthetic receiving note',
    provenance: 'SYNTHETIC',
    quantityMilli: '100001',
  };
  assert.equal(materialLotSchema.safeParse(base).success, true);
  for (const quantityMilli of ['-1', '0', '1.5', '1e3', 1.5])
    assert.equal(materialLotSchema.safeParse({ ...base, quantityMilli }).success, false);
  assert.equal(materialLotSchema.safeParse({ ...base, provenance: 'VERIFIED' }).success, false);
  assert.equal(materialLotSchema.safeParse({ ...base, bankVerified: true }).success, false);
  assert.equal(
    materialReceiptSchema.safeParse({
      receivedMilli: '1000',
      damagedMilli: '0',
      method: 'DIRECT',
      evidenceReference: 'Acknowledged',
      note: 'Received',
    }).success,
    true,
  );
});
test('stock conservation excludes cumulative returns and prevents negative buckets', () => {
  const stock = {
    receivedMilli: 100000n,
    availableMilli: 40000n,
    reservedMilli: 20000n,
    issuedMilli: 10000n,
    consumedMilli: 10000n,
    damagedMilli: 5000n,
    quarantineMilli: 15000n,
  };
  assert.equal(stockInvariant(stock), true);
  assert.equal(stockInvariant({ ...stock, availableMilli: -1n }), false);
  assert.equal(stockInvariant({ ...stock, availableMilli: 40001n }), false);
});
