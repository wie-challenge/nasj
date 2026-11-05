import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm, chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  operationResult,
  userUnits,
  writeOperationStatus,
} from '../../src/operations/local-runner.js';
test('local operation summaries allow only fixed codes and never forward child output/secrets', () => {
  assert.equal(operationResult('backup', 0, '{"code":"BACKUP_CREATED"}').code, 'OPERATION_OK');
  assert.deepEqual(operationResult('health', 0, '{"alerts":[]}').alerts, []);
  const failed = operationResult(
    'health',
    1,
    '{"alerts":["API_NOT_READY","private-password"],"secret":"private-value"}',
  );
  assert.deepEqual(failed.alerts, ['API_NOT_READY']);
  assert.ok(!JSON.stringify(failed).includes('private-'));
  for (const output of ['null', '[]', 'not JSON', '"private-password"'])
    assert.deepEqual(operationResult('health', 1, output).alerts, ['OPERATION_FAILED']);
  assert.deepEqual(operationResult('backup', 1, '{"code":"BACKUP_CREATED"}').alerts, [
    'BACKUP_FAILED',
  ]);
});
test('user timers are local, persistent daily backup and bounded five-minute health checks', () => {
  const units = userUnits(
    '/project/website',
    '/usr/bin/node',
    '/project/website/.local/schedule.env',
  );
  assert.match(units['nasj-local-backup.timer'], /OnCalendar=daily\nPersistent=true/);
  assert.match(units['nasj-local-health.timer'], /OnCalendar=\*:0\/5/);
  assert.match(units['nasj-local-backup.service'], /UMask=0077/);
  assert.match(
    units['nasj-local-health.service'],
    /ConditionPathExists=\/project\/website\/.local\/dev.lock/,
  );
  assert.match(units['nasj-local-backup.service'], /TimeoutStartSec=150/);
  assert.match(units['nasj-local-health.service'], /run-local-operation.ts health/);
  for (const path of ['/project/%n', '/project/$HOME', '/project/with space', '/project/\ninject'])
    assert.throws(() => userUnits(path, '/usr/bin/node', '/tmp/config'));
});
test('local status and alerts are private, safe and reject nonprivate directories/symlink logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasj-local-ops-'));
  try {
    const healthy = operationResult('health', 0, '{"alerts":[]}');
    await writeOperationStatus(directory, healthy);
    assert.equal((await stat(join(directory, 'health.json'))).mode & 0o777, 0o600);
    const failed = operationResult('health', 1, '{"alerts":["API_NOT_READY"]}');
    await writeOperationStatus(directory, failed);
    assert.equal(
      JSON.parse(await readFile(join(directory, 'health.json'), 'utf8')).code,
      'OPERATION_FAILED',
    );
    assert.equal((await stat(join(directory, 'alerts.ndjson'))).mode & 0o777, 0o600);
    await chmod(directory, 0o755);
    await assert.rejects(writeOperationStatus(directory, failed));
    await chmod(directory, 0o700);
    await rm(join(directory, 'alerts.ndjson'));
    await symlink(join(directory, 'health.json'), join(directory, 'alerts.ndjson'));
    await assert.rejects(writeOperationStatus(directory, failed));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
