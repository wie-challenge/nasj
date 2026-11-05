import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockQuantityMilli } from '../src/lib/stock-quantity';

test('operator stock quantities preserve exact decimal values at the API boundary', () => {
  assert.equal(stockQuantityMilli('100', 'METERS'), '100000');
  assert.equal(stockQuantityMilli(' 1.025 ', 'METERS'), '1025');
  assert.equal(stockQuantityMilli('0.001', 'METERS'), '1');
  assert.equal(stockQuantityMilli('123456789.123', 'METERS'), '123456789123');
  assert.equal(stockQuantityMilli('999999999.999', 'METERS'), '999999999999');
  assert.equal(stockQuantityMilli('0', 'METERS'), '0');
});
test('stock quantity entry rejects rounding, exponent notation and ambiguous separators', () => {
  for (const value of [
    '1.0001',
    '1.2345',
    '-1',
    '1e3',
    '1,250',
    'NaN',
    '',
    '.5',
    '01',
    '1000000000',
  ])
    assert.throws(() => stockQuantityMilli(value, 'METERS'), /Enter a quantity/);
});
test('pieces and units retain whole-quantity compatibility', () => {
  for (const unit of ['PIECES', 'UNITS']) {
    assert.equal(stockQuantityMilli('12', unit), '12000');
    assert.equal(stockQuantityMilli('12.000', unit), '12000');
    assert.throws(() => stockQuantityMilli('12.001', unit), /whole quantities/);
  }
});
