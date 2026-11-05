import assert from 'node:assert/strict';
import { test } from 'node:test';
import { traceModules } from '../src/lib/trace-qr';

test('a public traceability address becomes a stable QR matrix', () => {
  const value = 'https://example.test/trace/00000000-0000-4000-8000-000000000000';
  const first = traceModules(value);
  const second = traceModules(value);
  assert.ok(first.size >= 21);
  assert.equal(first.cells.length, first.size * first.size);
  assert.deepEqual(first.cells, second.cells);
  assert.notDeepEqual(first.cells, traceModules(`${value}?revoked=1`).cells);
  assert.equal(first.cells[0], true);
  assert.equal(first.cells[first.size - 1], true);
});
