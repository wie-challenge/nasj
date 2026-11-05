import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { encryptBackup, decryptBackup } from '../src/operations/backup.js';
import { disposableDatabase } from './support.js';
import { seedBrowserBatch5Fixture } from './batch5.fixture.js';
const exec = promisify(execFile);
async function snapshot(url: string, columns: Map<string, string[]> = new Map()) {
  const sql = new Client({ connectionString: url });
  await sql.connect();
  try {
    const tables = (
      await sql.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    const result: Record<string, string> = {};
    for (const { tablename } of tables) {
      if (!columns.has(tablename))
        columns.set(
          tablename,
          (
            await sql.query<{ column_name: string }>(
              "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
              [tablename],
            )
          ).rows.map((r) => r.column_name),
        );
      const rows = (
        await sql.query(
          `SELECT row_to_json(t)::text AS row FROM (SELECT ${columns
            .get(tablename)!
            .map((c) => `"${c.replaceAll('"', '""')}"`)
            .join(',')} FROM "${tablename.replaceAll('"', '""')}") t`,
        )
      ).rows
        .map((r) => r.row)
        .sort();
      result[tablename] = createHash('sha256').update(rows.join('\n')).digest('hex');
    }
    return result;
  } finally {
    await sql.end();
  }
}
export async function runMigrationReadinessScenario(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  await check(
    'pre-Batch6 populated backup restores before normal additive migrate deploy with preserved business history',
    async () => {
      const source = await disposableDatabase({
        throughMigration: '20261027080000_financial_controls',
      });
      const target = await disposableDatabase({ foundationOnly: true });
      const directory = await mkdtemp(join(tmpdir(), 'nasj-batch6-upgrade-'));
      const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: source.url }) });
      try {
        for (const role of ['operator', 'artisan', 'coordinator', 'checker'])
          await client.user.create({
            data: {
              id: randomUUID(),
              name: `Synthetic drill ${role}`,
              email: `production-${role}-drill@example.com`,
              emailVerified: true,
            },
          });
        await seedBrowserBatch5Fixture(source.url, 'drill');
        const columns = new Map<string, string[]>();
        const before = await snapshot(source.url, columns);
        const dumped = await exec(
          'docker',
          [
            '--context',
            'default',
            'exec',
            source.containerName,
            'pg_dump',
            '-U',
            'foundation_test',
            '-Fc',
            'foundation_test',
          ],
          { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
        );
        const key = Buffer.alloc(32, 17);
        const encrypted = encryptBackup(dumped.stdout, key);
        const restored = decryptBackup(encrypted, key);
        assert.ok(restored.subarray(0, 5).equals(Buffer.from('PGDMP')));
        const archive = join(directory, 'synthetic.dump');
        await writeFile(archive, restored, { mode: 0o600 });
        await exec('docker', [
          '--context',
          'default',
          'cp',
          archive,
          `${target.containerName}:/tmp/synthetic.dump`,
        ]);
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
        assert.deepEqual(await snapshot(target.url, columns), before);
        const cwd = fileURLToPath(new URL('../', import.meta.url));
        const env = {
          ...process.env,
          DATABASE_URL: target.url,
          MIGRATION_DATABASE_URL: target.url,
        };
        const status = await exec('pnpm', ['exec', 'prisma', 'migrate', 'status'], {
          cwd,
          env,
        }).catch((e) => ({ stdout: String(e.stdout) }));
        assert.match(status.stdout, /20261027090000_demo_scenarios/);
        await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd, env });
        const drift = await exec(
          'pnpm',
          [
            'exec',
            'prisma',
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            'prisma/schema.prisma',
          ],
          { cwd, env },
        );
        assert.equal(
          drift.stdout.includes('Demo'),
          false,
          'New showroom relations must match SQL.',
        );
        for (const line of drift.stdout
          .split('\n')
          .filter((line) => line.trim().startsWith('[') && !line.trim().startsWith('[*]'))) {
          assert.match(
            line,
            /\[-\] Removed foreign key on columns/,
            'Unexpected schema drift needs review.',
          );
        }
        console.log(`SCHEMA_DRIFT_REVIEW_BEGIN\n${drift.stdout.trim()}\nSCHEMA_DRIFT_REVIEW_END`);
        const after = await snapshot(target.url, columns);
        for (const [table, digest] of Object.entries(before))
          if (table !== '_prisma_migrations')
            assert.equal(after[table], digest, `Preserve ${table}`);
        for (const table of ['DemoVisitor', 'DemoScenario', 'DemoIdentity', 'DemoCommand'])
          assert.equal(after[table], createHash('sha256').update('').digest('hex'));
        const db = new Client({ connectionString: target.url });
        await db.connect();
        try {
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
              )
            ).rows[0].n,
            (
              await readdir(new URL('../prisma/migrations/', import.meta.url), {
                withFileTypes: true,
              })
            ).filter((entry) => entry.isDirectory()).length,
          );
        } finally {
          await db.end();
        }
        console.log(
          JSON.stringify({
            evidence: 'DISPOSABLE_PRE_BATCH6_BACKUP_UPGRADE',
            oldTables: Object.keys(before).length,
            tableHashesPreserved: true,
            backupAuthenticated: true,
            normalMigrateDeploy: true,
            persistentMigration: false,
          }),
        );
      } finally {
        await client.$disconnect();
        await source.stop();
        await target.stop();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
