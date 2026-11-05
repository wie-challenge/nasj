import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { disposableDatabase } from './support.js';
import { seedBrowserBatch5Fixture } from './batch5.fixture.js';
const exec = promisify(execFile);
const tables = [
  'RecommendationPolicy',
  'RecommendationSnapshot',
  'AllocationPlan',
  'AllocationPlanItem',
  'AllocationOverride',
  'ScheduleScenario',
  'ProductSpecification',
  'ProductSpecificationRevision',
  'ProductSampleRequest',
  'SampleEvaluation',
  'BuyerSampleApproval',
  'OrderDiscussion',
  'DiscussionMessage',
  'ProductionException',
  'ScheduleRevision',
  'Counteroffer',
  'AvailabilityPause',
  'SupportTicket',
  'SupportTicketEvent',
  'NotificationDelivery',
];
export async function runBatch811MigrationScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ throughMigration: '20261027090000_demo_scenarios' });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.url }) });
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  try {
    const existingTables = (
      await sql.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
      )
    ).rows;
    for (const role of ['operator', 'artisan', 'coordinator', 'checker'])
      await db.user.create({
        data: {
          id: randomUUID(),
          name: `Synthetic upgrade ${role}`,
          email: `production-${role}-b811upgrade@example.com`,
          emailVerified: true,
        },
      });
    await seedBrowserBatch5Fixture(database.url, 'b811upgrade');
    const baselineColumns = new Map<string, string[]>();
    for (const { tablename } of existingTables)
      baselineColumns.set(
        tablename,
        (
          await sql.query<{ column_name: string }>(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
            [tablename],
          )
        ).rows.map((r) => r.column_name),
      );
    const snapshot = async () => {
      const result: Record<string, string> = {};
      for (const { tablename } of existingTables) {
        const rows = (
          await sql.query(
            `SELECT row_to_json(t)::text AS row FROM (SELECT ${baselineColumns
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
    };
    const before = await snapshot();
    await check(
      'B811-M01 native migrate deploy upgrades populated pre-Batch8 database without changing baseline rows',
      async () => {
        await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, DATABASE_URL: database.url, MIGRATION_DATABASE_URL: database.url },
        });
        assert.deepEqual(await snapshot(), before);
      },
    );
    await check(
      'B811-M02 all twenty original tables have primary keys, foreign keys and indexes',
      async () => {
        const found = (
          await sql.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",
            [tables],
          )
        ).rows;
        assert.equal(found.length, 20);
        for (const table of tables) {
          const constraints = (
            await sql.query<{ contype: string }>(
              'SELECT contype FROM pg_constraint WHERE conrelid=$1::regclass',
              [`"${table}"`],
            )
          ).rows;
          assert.ok(
            constraints.some((c) => c.contype === 'p'),
            `${table} primary key`,
          );
          if (table !== 'RecommendationPolicy')
            assert.ok(
              constraints.some((c) => c.contype === 'f'),
              `${table} foreign key`,
            );
          assert.ok(
            (
              await sql.query(
                "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=$1",
                [table],
              )
            ).rowCount,
          );
        }
      },
    );
    await check(
      'B811-M03 Prisma migration history checksums match every SQL file with no failed migration',
      async () => {
        const history = (
          await sql.query<{
            migration_name: string;
            checksum: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }>('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"')
        ).rows;
        const migrationRoot = new URL('../prisma/migrations/', import.meta.url);
        const names = (await readdir(migrationRoot, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
        assert.equal(history.length, names.length);
        for (const name of names) {
          const record = history.find((h) => h.migration_name === name);
          assert.ok(record?.finished_at);
          assert.equal(record.rolled_back_at, null);
          assert.equal(
            record.checksum,
            createHash('sha256')
              .update(await readFile(new URL(`${name}/migration.sql`, migrationRoot)))
              .digest('hex'),
          );
        }
      },
    );
    await check(
      'B811-M04 a failing foreign key rolls back all writes in its transaction',
      async () => {
        const id = randomUUID();
        await sql.query('BEGIN');
        try {
          await sql.query(
            "INSERT INTO \"RecommendationPolicy\"(id,version,name,inputs,excluded) VALUES ($1,900001,'Rollback fixture','{}','[]')",
            [id],
          );
          await assert.rejects(
            sql.query(
              'INSERT INTO "AllocationPlan"(id,"orderId",version,"requiredQuantity","policyVersion","authorId","updatedAt") VALUES ($1,\'missing\',1,1,1,\'missing\',now())',
              [randomUUID()],
            ),
            (e: unknown) => (e as { code: string }).code === '23503',
          );
        } finally {
          await sql.query('ROLLBACK');
        }
        assert.equal(
          (await sql.query('SELECT id FROM "RecommendationPolicy" WHERE id=$1', [id])).rowCount,
          0,
        );
      },
    );
    await check(
      'B811-M05 concurrent PostgreSQL clients serialize duplicate recommendation policy versions',
      async () => {
        const a = new Client({ connectionString: database.url }),
          b = new Client({ connectionString: database.url });
        await Promise.all([a.connect(), b.connect()]);
        try {
          const insert = (client: Client) =>
            client.query(
              "INSERT INTO \"RecommendationPolicy\"(id,version,name,inputs,excluded) VALUES ($1,900002,'Concurrent fixture','{}','[]')",
              [randomUUID()],
            );
          const outcomes = await Promise.allSettled([insert(a), insert(b)]);
          assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
          assert.equal(
            (outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult).reason.code,
            '23505',
          );
          assert.equal(
            (await sql.query('SELECT id FROM "RecommendationPolicy" WHERE version=900002'))
              .rowCount,
            1,
          );
        } finally {
          await Promise.all([a.end(), b.end()]);
        }
      },
    );
    console.log(
      JSON.stringify({
        evidence: 'DISPOSABLE_NATIVE_POSTGRESQL_MIGRATIONS',
        engine: (await sql.query<{ version: string }>('SELECT version()')).rows[0].version,
        baselinePublicTables: existingTables.length + 1,
        finalPublicTables: (
          await sql.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
          )
        ).rows[0].n,
        migrations: (
          await sql.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
          )
        ).rows[0].n,
        originalBatchTables: tables.length,
        foreignKeys: (
          await sql.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text=ANY($1::text[])",
            [tables.map((table) => `"${table}"`)],
          )
        ).rows[0].n,
        persistentDatabaseTouched: false,
      }),
    );
  } finally {
    await sql.end();
    await db.$disconnect();
    await database.stop();
  }
}
