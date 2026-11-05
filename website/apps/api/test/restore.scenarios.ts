import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptBackup, unpackDatabaseBackup } from '../src/operations/backup.js';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { disposableDatabase } from './support.js';
const exec = promisify(execFile);
async function snapshot(url: string) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const { tablename } of tables.rows) {
      const escaped = tablename.replaceAll('"', '""');
      const rows = await client.query<{ row: string }>(
        `SELECT row_to_json(t)::text AS row FROM "${escaped}" t`,
      );
      result[tablename] = {
        count: rows.rowCount ?? 0,
        sha256: createHash('sha256')
          .update(
            rows.rows
              .map((row) => row.row)
              .sort()
              .join('\n'),
          )
          .digest('hex'),
      };
    }
    return result;
  } finally {
    await client.end();
  }
}
// Only accepts containers created by the test harness; no production URL or restore target input.
export async function runRestoreScenario(
  source: Awaited<ReturnType<typeof disposableDatabase>>,
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  await check(
    'E16 real pg_dump/pg_restore preserves every table in an isolated synthetic database',
    async () => {
      if (!/^nasj-test-[a-f0-9]{16}$/.test(source.containerName))
        throw new Error('Disposable source required.');
      const target = await disposableDatabase({ foundationOnly: true });
      const directory = await mkdtemp(join(tmpdir(), 'nasj-restore-'));
      try {
        const before = await snapshot(source.url);
        const started = performance.now();
        const key = randomBytes(32);
        const keyFile = join(directory, 'backup.key');
        await writeFile(keyFile, key, { mode: 0o600 });
        const configFile = join(directory, 'runtime.env');
        const configuration = Buffer.from(
          `BETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\n`,
        );
        await writeFile(configFile, configuration, { mode: 0o600 });
        const command = await exec('node_modules/.bin/tsx', ['scripts/backup-database.ts'], {
          cwd: fileURLToPath(new URL('../../../', import.meta.url)),
          env: {
            ...process.env,
            BACKUP_CONTAINER: source.containerName,
            BACKUP_DIRECTORY: directory,
            BACKUP_KEY_FILE: keyFile,
            BACKUP_CONFIG_FILE: configFile,
            BACKUP_DATABASE_USER: 'foundation_test',
            BACKUP_DATABASE_NAME: 'foundation_test',
          },
        });
        const result = JSON.parse(command.stdout) as {
          code: string;
          filename: string;
          encryptedBytes: number;
        };
        assert.equal(result.code, 'BACKUP_CREATED');
        const encrypted = await readFile(join(directory, result.filename));
        const payload = unpackDatabaseBackup(decryptBackup(encrypted, key));
        assert.equal(payload.version, 2);
        assert.deepEqual(payload.configuration, configuration);
        const stdout = payload.database;
        assert.ok(stdout.subarray(0, 5).equals(Buffer.from('PGDMP')));
        assert.ok(!encrypted.includes(Buffer.from('commerce-buyer@example.com')));
        const archive = join(directory, 'synthetic.dump');
        await writeFile(archive, stdout, { mode: 0o600 });
        const backupMs = Math.round(performance.now() - started);
        await exec('docker', [
          '--context',
          'default',
          'cp',
          archive,
          `${target.containerName}:/tmp/synthetic.dump`,
        ]);
        const restoreStarted = performance.now();
        await exec('docker', [
          '--context',
          'default',
          'exec',
          target.containerName,
          'pg_restore',
          '-U',
          'foundation_test',
          '-d',
          'foundation_test',
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-acl',
          '--exit-on-error',
          '/tmp/synthetic.dump',
        ]);
        const restored = await snapshot(target.url);
        assert.deepEqual(restored, before);
        assert.ok(before.User.count > 0);
        assert.ok(before.AuditEvent.count > 0);
        assert.ok(before.OutboxEvent.count > 0);
        console.log(
          JSON.stringify({
            evidence: 'DISPOSABLE_ENCRYPTED_SYNTHETIC_RESTORE',
            configurationRestored: true,
            encryptedBytes: encrypted.length,
            tables: Object.keys(before).length,
            contractualDateRows: before.ContractualDueDate?.count ?? 0,
            rows: Object.values(before).reduce((total, table) => total + table.count, 0),
            backupMs,
            restoreAndVerifyMs: Math.round(performance.now() - restoreStarted),
            archiveBytes: stdout.length,
          }),
        );
      } finally {
        await target.stop();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
