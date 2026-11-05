import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalAlerts } from '../../src/jobs/alerts.js';
import { HealthController } from '../../src/modules/health/health.controller.js';
import type { PrismaService } from '../../src/database/prisma.service.js';

test('operational alert threshold reports failures and lag without payloads', () => {
  assert.deepEqual(
    operationalAlerts({ ready: true, oldestPendingAgeMs: 300000, failedCount: 0 }),
    [],
  );
  assert.deepEqual(
    operationalAlerts({ ready: false, oldestPendingAgeMs: 300001, failedCount: 1 }),
    ['API_NOT_READY', 'OUTBOX_FAILED', 'OUTBOX_LAG'],
  );
});
test('database outage fails readiness with safe 503 while liveness remains healthy', async () => {
  const controller = new HealthController({
    $queryRaw: async () => {
      throw new Error('private database URI');
    },
  } as unknown as PrismaService);
  assert.equal(controller.live().status, 'ok');
  await assert.rejects(controller.ready(), (error) => {
    const failure = error as { getStatus(): number; message: string };
    return failure.getStatus() === 503 && !failure.message.includes('private');
  });
});

test('backup age alerts follow the approved 24-hour recovery point without exposing paths', () => {
  const healthy = { ready: true, oldestPendingAgeMs: 0, failedCount: 0 };
  assert.deepEqual(operationalAlerts({ ...healthy, backupAgeMs: 86400000 }), []);
  assert.deepEqual(operationalAlerts({ ...healthy, backupAgeMs: 86400001 }), ['BACKUP_STALE']);
  assert.deepEqual(operationalAlerts({ ...healthy, backupAgeMs: null }), ['BACKUP_MISSING']);
});
