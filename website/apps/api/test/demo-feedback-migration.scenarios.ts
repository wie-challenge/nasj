import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { disposableDatabase } from './support.js';

const exec = promisify(execFile);
const migration = '20261028170000_demo_feedback';
const previous = '20261028160000_buyer_order_feedback';

/**
 * Native upgrade evidence for E15-06 against disposable PostgreSQL only: a populated pre-migration
 * database is brought forward with migrate deploy, then the new tables and their guards are proved.
 */
export async function runDemoFeedbackMigrationScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ throughMigration: previous });
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  try {
    const seed = async () => {
      const buyer = randomUUID();
      const operator = randomUUID();
      const buyerOrg = randomUUID();
      const operatorOrg = randomUUID();
      const rfq = randomUUID();
      const visitor = randomUUID();
      const scenario = randomUUID();
      for (const [id, tag] of [
        [buyer, 'buyer'],
        [operator, 'operator'],
      ] as const)
        await sql.query(
          'INSERT INTO "User"(id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,now())',
          [id, `Synthetic demo feedback ${tag}`, `demo-feedback-${tag}-${id}@example.com`],
        );
      for (const [id, type, userId] of [
        [buyerOrg, 'BUYER_BUSINESS', buyer],
        [operatorOrg, 'INTERNAL', operator],
      ] as const)
        await sql.query(
          `INSERT INTO "Organization"(id,name,slug,type,"approvalStatus",region,description,"contactEmail","representativeName","createdByUserId","updatedAt")
           VALUES ($1,$2,$3,$4,'APPROVED','Sfax','Synthetic demo feedback','df@example.com','Synthetic rep',$5,now())`,
          [id, `Synthetic org ${id.slice(0, 6)}`, `demo-feedback-${id}`, type, userId],
        );
      await sql.query(
        `INSERT INTO "CraftSkill"(id,name,category,description) VALUES ('weaving','Synthetic weaving','Synthetic','demo feedback') ON CONFLICT DO NOTHING`,
      );
      await sql.query(
        `INSERT INTO "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation",status,"procurementManaged","updatedAt")
         VALUES ($1,$2,$3,'weaving','Synthetic demo feedback','s','d',1,'2027-12-01','x','QUOTED',true,now())`,
        [rfq, buyerOrg, operatorOrg],
      );
      await sql.query(
        `INSERT INTO "DemoVisitor"(id,"tokenHash","expiresAt") VALUES ($1,$2,now()+interval '1 day')`,
        [visitor, randomUUID()],
      );
      await sql.query(
        `INSERT INTO "DemoScenario"(id,"visitorId",generation,version,status,"seedSpec","organizationIds","rfqId") VALUES ($1,$2,1,1,'ACTIVE','{}','[]',$3)`,
        [scenario, visitor, rfq],
      );
      return { visitor, scenario, operator };
    };
    const ids = await seed();
    const columns = new Map<string, string[]>();
    const snapshot = async () => {
      const tables = (
        await sql.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
        )
      ).rows;
      const result: Record<string, { count: number; sha256: string }> = {};
      for (const { tablename } of tables) {
        if (tablename.startsWith('DemoFeedback')) continue;
        if (!columns.has(tablename))
          columns.set(
            tablename,
            (
              await sql.query<{ column_name: string }>(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
                [tablename],
              )
            ).rows.map((row) => row.column_name),
          );
        const rows = (
          await sql.query(
            `SELECT row_to_json(t)::text AS row FROM (SELECT ${columns
              .get(tablename)!
              .map((name) => `"${name.replaceAll('"', '""')}"`)
              .join(',')} FROM "${tablename.replaceAll('"', '""')}") t`,
          )
        ).rows.map((row: { row: string }) => row.row);
        result[tablename] = {
          count: rows.length,
          sha256: createHash('sha256').update(rows.sort().join('\n')).digest('hex'),
        };
      }
      return result;
    };
    const before = await snapshot();

    await check('B14-M01 the feedback tables are absent before migrate deploy', async () => {
      const found = (
        await sql.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'DemoFeedback%'",
        )
      ).rows;
      assert.deepEqual(found, []);
    });

    await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: database.url, MIGRATION_DATABASE_URL: database.url },
    });

    await check('B14-M02 populated upgrade preserves every pre-existing row hash', async () => {
      assert.deepEqual(await snapshot(), before);
    });

    await check(
      'B14-M03 the new tables carry restrictive keys, CHECKs and append-only guards',
      async () => {
        for (const table of ['DemoFeedback', 'DemoFeedbackEvent']) {
          const constraints = (
            await sql.query<{ contype: string; confdeltype: string }>(
              'SELECT contype, confdeltype FROM pg_constraint WHERE conrelid=$1::regclass',
              [`"${table}"`],
            )
          ).rows;
          assert.ok(
            constraints.some((row) => row.contype === 'p'),
            `${table} primary key`,
          );
          const foreign = constraints.filter((row) => row.contype === 'f');
          assert.ok(foreign.length >= 2, `${table} foreign keys`);
          assert.ok(
            foreign.every((row) => row.confdeltype === 'r'),
            `${table} foreign keys are restrictive`,
          );
          assert.ok(constraints.filter((row) => row.contype === 'c').length >= 3);
        }
        const triggers = (
          await sql.query<{ tgname: string }>(
            'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY($1::text[])',
            [['"DemoFeedback"', '"DemoFeedbackEvent"']],
          )
        ).rows.map((row) => row.tgname);
        for (const name of [
          'DemoFeedbackEvent_append_only',
          'DemoFeedback_content_guard',
          'DemoFeedback_no_delete',
          'DemoFeedback_anchor',
        ])
          assert.ok(triggers.includes(name), name);
        // The widened command vocabulary is present.
        const operationCheck = await sql.query(
          "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='DemoCommand_operation_check'",
        );
        assert.match(operationCheck.rows[0].def, /feedback/);
      },
    );

    await check('B14-M04 valid feedback is accepted and every guard rejects misuse', async () => {
      const feedbackId = randomUUID();
      await sql.query(
        `INSERT INTO "DemoFeedback"(id,"scenarioId","visitorId",generation,"screenKey",category,comment) VALUES ($1,$2,$3,1,'SHOWROOM_OVERVIEW','USABILITY','Synthetic upgrade feedback')`,
        [feedbackId, ids.scenario, ids.visitor],
      );
      await sql.query(
        `INSERT INTO "DemoFeedbackEvent"(id,"feedbackId",kind,"toStatus") VALUES ($1,$2,'SUBMITTED','NEW')`,
        [randomUUID(), feedbackId],
      );
      // A moderation event must name a real reviewer.
      await assert.rejects(
        sql.query(
          `INSERT INTO "DemoFeedbackEvent"(id,"feedbackId",kind,"fromStatus","toStatus",note) VALUES ($1,$2,'STATUS_CHANGED','NEW','TRIAGED','no actor')`,
          [randomUUID(), feedbackId],
        ),
        (error: unknown) => (error as { code: string }).code === '23514',
      );
      // Generation must match the scenario.
      await assert.rejects(
        sql.query(
          `INSERT INTO "DemoFeedback"(id,"scenarioId","visitorId",generation,"screenKey",category) VALUES ($1,$2,$3,9,'SHOWROOM_OVERVIEW','IDEA')`,
          [randomUUID(), ids.scenario, ids.visitor],
        ),
        /generation must match/i,
      );
      // A visitor may not post against another visitor's scenario.
      const otherVisitor = randomUUID();
      await sql.query(
        `INSERT INTO "DemoVisitor"(id,"tokenHash","expiresAt") VALUES ($1,$2,now()+interval '1 day')`,
        [otherVisitor, randomUUID()],
      );
      await assert.rejects(
        sql.query(
          `INSERT INTO "DemoFeedback"(id,"scenarioId","visitorId",generation,"screenKey",category) VALUES ($1,$2,$3,1,'SHOWROOM_OVERVIEW','IDEA')`,
          [randomUUID(), ids.scenario, otherVisitor],
        ),
        /must own the scenario/i,
      );
      // Unknown screen keys, categories and statuses are rejected (CHECK or anchor guard).
      for (const [column, value] of [
        ['screenKey', 'NOPE'],
        ['category', 'MAGIC'],
        ['status', 'DONE'],
      ] as const) {
        await assert.rejects(
          sql.query(
            `INSERT INTO "DemoFeedback"(id,"scenarioId","visitorId",generation,"screenKey",category,status) VALUES ($1,$2,$3,1,$4,$5,$6)`,
            [
              randomUUID(),
              ids.scenario,
              ids.visitor,
              column === 'screenKey' ? value : 'SHOWROOM_OVERVIEW',
              column === 'category' ? value : 'IDEA',
              column === 'status' ? value : 'NEW',
            ],
          ),
          /23514|NEW state|violates check/i,
          `${column}=${value} must be refused`,
        );
      }
      // Content is immutable; only status may advance.
      await assert.rejects(
        sql.query(`UPDATE "DemoFeedback" SET comment='rewritten' WHERE id=$1`, [feedbackId]),
        /immutable/i,
      );
      await sql.query(`UPDATE "DemoFeedback" SET status='TRIAGED' WHERE id=$1`, [feedbackId]);
      await assert.rejects(
        sql.query(`DELETE FROM "DemoFeedback" WHERE id=$1`, [feedbackId]),
        /append-only/i,
      );
      await assert.rejects(
        sql.query(`UPDATE "DemoFeedbackEvent" SET note='rewritten' WHERE "feedbackId"=$1`, [
          feedbackId,
        ]),
        /append-only/i,
      );
      await assert.rejects(
        sql.query(`DELETE FROM "DemoFeedbackEvent" WHERE "feedbackId"=$1`, [feedbackId]),
        /append-only/i,
      );
      // Closing out is terminal at the database.
      await sql.query(`UPDATE "DemoFeedback" SET status='ACTIONED' WHERE id=$1`, [feedbackId]);
      await assert.rejects(
        sql.query(`UPDATE "DemoFeedback" SET status='NEW' WHERE id=$1`, [feedbackId]),
        /terminal/i,
      );
      // A failed moderation write and its status change roll back together (fresh row: the
      // previous one is now terminal by design).
      const rollbackId = randomUUID();
      await sql.query(
        `INSERT INTO "DemoFeedback"(id,"scenarioId","visitorId",generation,"screenKey",category) VALUES ($1,$2,$3,1,'SHOWROOM_OVERVIEW','IDEA')`,
        [rollbackId, ids.scenario, ids.visitor],
      );
      await sql.query('BEGIN');
      try {
        await sql.query(`UPDATE "DemoFeedback" SET status='TRIAGED' WHERE id=$1`, [rollbackId]);
        await assert.rejects(
          sql.query(
            `INSERT INTO "DemoFeedbackEvent"(id,"feedbackId",kind,"fromStatus","toStatus",note) VALUES ($1,$2,'STATUS_CHANGED','NEW','TRIAGED','rollback probe')`,
            [randomUUID(), 'missing-feedback'],
          ),
        );
      } finally {
        await sql.query('ROLLBACK');
      }
      assert.equal(
        (
          await sql.query<{ status: string }>('SELECT status FROM "DemoFeedback" WHERE id=$1', [
            rollbackId,
          ])
        ).rows[0].status,
        'NEW',
        'the status change rolled back with the failed event',
      );
      assert.equal(
        (
          await sql.query<{ status: string }>('SELECT status FROM "DemoFeedback" WHERE id=$1', [
            feedbackId,
          ])
        ).rows[0].status,
        'ACTIONED',
      );
    });

    await check(
      'B14-M05 migration history matches every SQL file with none rolled back',
      async () => {
        const history = (
          await sql.query<{
            migration_name: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }>('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations"')
        ).rows;
        const record = history.find((row) => row.migration_name === migration);
        assert.ok(record?.finished_at);
        assert.equal(record.rolled_back_at, null);
        const { readdir, readFile } = await import('node:fs/promises');
        const root = new URL('../prisma/migrations/', import.meta.url);
        const names = (await readdir(root, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
        assert.equal(history.length, names.length);
        assert.ok(names.includes(previous), 'historical migrations are preserved');
        assert.equal(
          createHash('sha256')
            .update(await readFile(new URL(`${migration}/migration.sql`, root)))
            .digest('hex').length,
          64,
        );
      },
    );

    await check(
      'B14-M06 dump and restore reproduce feedback and its attributed history exactly',
      async () => {
        const rows = async (connection: string) => {
          const client = new Client({ connectionString: connection });
          await client.connect();
          try {
            const feedback = await client.query<{ row: string }>(
              'SELECT row_to_json(t)::text AS row FROM "DemoFeedback" t',
            );
            const events = await client.query<{ row: string }>(
              'SELECT row_to_json(t)::text AS row FROM "DemoFeedbackEvent" t',
            );
            return {
              feedback: feedback.rows.map((row) => row.row).sort(),
              events: events.rows.map((row) => row.row).sort(),
            };
          } finally {
            await client.end();
          }
        };
        const reference = await rows(database.url);
        // Two aggregates were inserted above (the guarded sample and the rollback probe).
        assert.equal(reference.feedback.length, 2);
        assert.equal(reference.events.length, 1);
        const target = await disposableDatabase();
        const directory = await mkdtemp(join(tmpdir(), 'nasj-demo-feedback-restore-'));
        try {
          await exec('docker', [
            '--context',
            'default',
            'exec',
            database.containerName,
            'pg_dump',
            '-U',
            'foundation_test',
            '-d',
            'foundation_test',
            '--format=custom',
            '-f',
            '/tmp/demo-feedback.dump',
          ]);
          const archive = join(directory, 'demo-feedback.dump');
          await exec('docker', [
            '--context',
            'default',
            'cp',
            `${database.containerName}:/tmp/demo-feedback.dump`,
            archive,
          ]);
          await exec('docker', [
            '--context',
            'default',
            'cp',
            archive,
            `${target.containerName}:/tmp/demo-feedback.dump`,
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
            '/tmp/demo-feedback.dump',
          ]);
          assert.deepEqual(await rows(target.url), reference);
          const client = new Client({ connectionString: target.url });
          await client.connect();
          try {
            await assert.rejects(client.query('DELETE FROM "DemoFeedbackEvent"'), /append-only/i);
          } finally {
            await client.end();
          }
        } finally {
          await target.stop();
          await rm(directory, { recursive: true, force: true });
        }
      },
    );

    console.log(
      JSON.stringify({
        evidence: 'DISPOSABLE_NATIVE_POSTGRESQL_DEMO_FEEDBACK_UPGRADE',
        migration,
        preservedBaselineTables: Object.keys(before).length,
        persistentDatabaseTouched: false,
      }),
    );
  } finally {
    await sql.end();
    await database.stop();
  }
}
