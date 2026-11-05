import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, stat, utimes, symlink, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encryptBackup,
  packDatabaseBackup,
  unpackDatabaseBackup,
  decryptBackup,
  readBackupKey,
  pruneExpiredBackups,
  backupStatus,
  writePrivateBackup,
} from '../../src/operations/backup.js';
import { createLogger } from '../../src/common/logging.js';
test('authenticated backup encryption rejects corruption, wrong keys and invalid archive bounds', () => {
  const key = randomBytes(32),
    raw = Buffer.from('PGDMP synthetic source');
  const encrypted = encryptBackup(raw, key);
  assert.deepEqual(decryptBackup(encrypted, key), raw);
  assert.ok(!encrypted.includes(raw));
  assert.notDeepEqual(encryptBackup(raw, key), encrypted);
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decryptBackup(damaged, key));
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
  assert.throws(() => encryptBackup(Buffer.alloc(0), key));
  assert.throws(() => encryptBackup(raw, Buffer.alloc(31)));
});
test('backup files and keys require owner privacy, reject symlinks and never overwrite archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasj-key-test-'));
  try {
    const keyPath = join(directory, 'key'),
      output = join(directory, 'archive.hcab');
    const key = randomBytes(32),
      encrypted = encryptBackup(Buffer.from('synthetic'), key);
    await writeFile(keyPath, key, { mode: 0o600 });
    assert.deepEqual(await readBackupKey(keyPath), key);
    await chmod(keyPath, 0o644);
    await assert.rejects(readBackupKey(keyPath));
    await chmod(keyPath, 0o600);
    const link = join(directory, 'key-link');
    await symlink(keyPath, link);
    await assert.rejects(readBackupKey(link));
    await writePrivateBackup(output, encrypted);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(writePrivateBackup(output, Buffer.from('replacement')));
    assert.deepEqual(await readFile(output), encrypted);
    await chmod(directory, 0o755);
    await assert.rejects(writePrivateBackup(join(directory, 'unsafe'), encrypted));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('real Pino redaction removes secrets, request bodies and signal fields from structured output', () => {
  let output = '';
  const logger = createLogger({
    write: (line: string) => {
      output += line;
    },
  });
  logger.info(
    {
      correlationId: 'correlation-safe',
      durationMs: 5,
      password: 'sentinel-password',
      token: 'sentinel-token',
      secret: 'sentinel-secret',
      authorization: 'sentinel-authorization',
      cookie: 'sentinel-cookie',
      body: { email: 'sentinel-email' },
      payload: { raw: 'sentinel-payload' },
      sensorData: 'sentinel-sensor',
      wearableSummary: 'sentinel-wearable',
      req: {
        headers: { authorization: 'sentinel-nested-auth', cookie: 'sentinel-nested-cookie' },
        body: 'sentinel-nested-body',
      },
    },
    'Operation',
  );
  assert.ok(!output.includes('sentinel-'));
  assert.equal(JSON.parse(output).correlationId, 'correlation-safe');
  assert.equal(JSON.parse(output).durationMs, 5);
});

test('seven-day retention removes only expired private tool archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nasj-retention-test-'));
  try {
    const name = 'backup-2026-10-01T00-00-00.000Z-12345678-1234-1234-1234-123456789abc.hcab';
    const archive = join(directory, name);
    await writeFile(archive, Buffer.from('encrypted test fixture'), { mode: 0o600 });
    await writeFile(join(directory, 'unrelated.hcab'), Buffer.from('keep'), { mode: 0o600 });
    const now = Date.now();
    assert.equal((await backupStatus(directory, now)).count, 0); // Too short to be an encrypted archive.
    await utimes(archive, new Date(now - 8 * 86400000), new Date(now - 8 * 86400000));
    assert.equal(await pruneExpiredBackups(directory, now), 1);
    assert.equal(await pruneExpiredBackups(directory, now), 0);
    assert.equal((await readFile(join(directory, 'unrelated.hcab'))).toString(), 'keep');
    await writeFile(archive, encryptBackup(Buffer.from('fresh fixture'), randomBytes(32)), {
      mode: 0o600,
    });
    assert.equal((await backupStatus(directory, now)).count, 1);
    assert.equal(await pruneExpiredBackups(directory, now), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('database/configuration backup payload roundtrips private configuration and accepts legacy archives', () => {
  const database = Buffer.from('PGDMP synthetic database archive');
  const config = Buffer.from('BETTER_AUTH_SECRET=private-test-configuration');
  const key = randomBytes(32);
  const encrypted = encryptBackup(packDatabaseBackup(database, config), key);
  assert.ok(!encrypted.includes(config));
  const restored = unpackDatabaseBackup(decryptBackup(encrypted, key));
  assert.equal(restored.version, 2);
  assert.deepEqual(restored.database, database);
  assert.deepEqual(restored.configuration, config);
  assert.equal(unpackDatabaseBackup(database).configuration, null);
  assert.throws(() => packDatabaseBackup(database, Buffer.alloc(0)));
  assert.throws(() => packDatabaseBackup(database, Buffer.alloc(1024 * 1024 + 1)));
  const truncated = packDatabaseBackup(database, config).subarray(0, 15);
  assert.throws(() => unpackDatabaseBackup(truncated));
  assert.throws(() => unpackDatabaseBackup(Buffer.from('HCABCFG1 invalid payload')));
});
