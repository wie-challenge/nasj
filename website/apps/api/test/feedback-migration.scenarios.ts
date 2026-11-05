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
const migration = '20261028160000_buyer_order_feedback';
const previous = '20261028150000_financial_remediation_dates';

/**
 * Native upgrade evidence for E18-06. A populated pre-migration database is brought forward with
 * `prisma migrate deploy` in a disposable container; baseline rows and constraints are then
 * compared, and the new tables are exercised directly against PostgreSQL.
 */
export async function runFeedbackMigrationScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ throughMigration: previous });
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  try {
    const seed = async () => {
      const ids = {
        buyer: randomUUID(),
        operator: randomUUID(),
        buyerOrg: randomUUID(),
        operatorOrg: randomUUID(),
        rfq: randomUUID(),
        order: randomUUID(),
        shipment: randomUUID(),
        receipt: randomUUID(),
        ticket: randomUUID(),
      };
      for (const [role, id] of [
        ['buyer', ids.buyer],
        ['operator', ids.operator],
      ] as const)
        await sql.query(
          'INSERT INTO "User"(id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,now())',
          [id, `Synthetic upgrade ${role}`, `feedback-upgrade-${role}-${id}@example.com`],
        );
      for (const [name, id, userId] of [
        ['Synthetic upgrade buyer org', ids.buyerOrg, ids.buyer],
        ['Synthetic upgrade operator org', ids.operatorOrg, ids.operator],
      ] as const)
        await sql.query(
          `INSERT INTO "Organization"(id,name,slug,type,"approvalStatus",region,description,"contactEmail","representativeName","createdByUserId","updatedAt")
           VALUES ($1,$2,$3,$4,'APPROVED','Sfax','Synthetic upgrade fixture','upgrade@example.com','Synthetic representative',$5,now())`,
          [
            id,
            name,
            `feedback-upgrade-${id}`,
            id === ids.buyerOrg ? 'BUYER_BUSINESS' : 'INTERNAL',
            userId,
          ],
        );
      await sql.query(
        `INSERT INTO "CraftSkill"(id,name,category,description) VALUES ('weaving','Synthetic weaving','Synthetic','Synthetic upgrade skill') ON CONFLICT DO NOTHING`,
      );
      await sql.query(
        `INSERT INTO "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation",status,"procurementManaged","updatedAt")
         VALUES ($1,$2,$3,'weaving','Synthetic upgrade order','Synthetic specification','Synthetic requirements',10,'2027-12-01','Synthetic site','ACCEPTED',true,now())`,
        [ids.rfq, ids.buyerOrg, ids.operatorOrg],
      );
      await sql.query(
        'INSERT INTO "CommercialOrder"(id,"rfqId",status) VALUES ($1,$2,\'APPROVED\')',
        [ids.order, ids.rfq],
      );
      await sql.query(
        `INSERT INTO "Shipment"(id,"orderId",status,hub,destination,"actorId",version) VALUES ($1,$2,'BUYER_CONFIRMED','Synthetic hub','Synthetic site',$3,2)`,
        [ids.shipment, ids.order, ids.operator],
      );
      await sql.query(
        `INSERT INTO "BuyerDeliveryConfirmation"(id,"shipmentId",received,accepted,missing,damaged,"actorId","occurredAt") VALUES ($1,$2,8,8,0,0,$3,now())`,
        [ids.receipt, ids.shipment, ids.buyer],
      );
      await sql.query(
        `INSERT INTO "SupportTicket"(id,category,"relatedType","relatedId","reporterId","organizationId",description,status,"updatedAt")
         VALUES ($1,'COMMERCIAL','ORDER',$2,$3,$4,'Synthetic upgrade claim','OPEN',now())`,
        [ids.ticket, ids.order, ids.buyer, ids.operatorOrg],
      );
      return ids;
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
        // Tables introduced by this migration and by later migrations do not exist on the baseline.
        if (
          tablename === 'BuyerOrderFeedback' ||
          tablename === 'BuyerOrderFeedbackRevision' ||
          tablename.startsWith('DemoFeedback')
        )
          continue;
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
    assert.ok(before.Receipt || before.BuyerDeliveryConfirmation);

    await check(
      'B13-M01 the new tables are absent before migrate deploy and additive afterwards',
      async () => {
        const existing = (
          await sql.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'BuyerOrderFeedback%'",
          )
        ).rows;
        assert.deepEqual(existing, [], 'the pre-migration baseline has no feedback tables');
      },
    );

    await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: database.url, MIGRATION_DATABASE_URL: database.url },
    });

    await check(
      'B13-M02 populated upgrade preserves every pre-existing row byte for byte',
      async () => {
        assert.deepEqual(await snapshot(), before);
      },
    );

    await check(
      'B13-M03 the new tables carry restrictive keys, unique pairs and CHECK constraints',
      async () => {
        for (const table of ['BuyerOrderFeedback', 'BuyerOrderFeedbackRevision']) {
          const keys = (
            await sql.query<{ contype: string; confdeltype: string }>(
              'SELECT contype, confdeltype FROM pg_constraint WHERE conrelid=$1::regclass',
              [`"${table}"`],
            )
          ).rows;
          assert.ok(
            keys.some((key) => key.contype === 'p'),
            `${table} primary key`,
          );
          const foreign = keys.filter((key) => key.contype === 'f');
          assert.ok(foreign.length >= 3, `${table} foreign keys`);
          assert.ok(
            foreign.every((key) => key.confdeltype === 'r'),
            `${table} foreign keys are restrictive`,
          );
          const checks = (
            await sql.query<{ conname: string }>(
              "SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' ORDER BY conname",
              [`"${table}"`],
            )
          ).rows.map((row) => row.conname);
          assert.ok(checks.length >= 3, `${table} CHECK constraints exist`);
        }
        for (const index of [
          'BuyerOrderFeedback_orderId_reporterId_key',
          'BuyerOrderFeedbackRevision_feedbackId_version_key',
        ]) {
          assert.equal(
            (
              await sql.query('SELECT 1 FROM pg_indexes WHERE schemaname=$1 AND indexname=$2', [
                'public',
                index,
              ])
            ).rowCount,
            1,
            index,
          );
        }
        const triggers = (
          await sql.query<{ tgname: string }>(
            'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY($1::text[])',
            [['"BuyerOrderFeedback"', '"BuyerOrderFeedbackRevision"']],
          )
        ).rows.map((row) => row.tgname);
        assert.ok(triggers.includes('BuyerOrderFeedbackRevision_append_only'));
        assert.ok(triggers.includes('BuyerOrderFeedback_identity_guard'));
        assert.ok(triggers.includes('BuyerOrderFeedback_eligibility'));
        assert.ok(triggers.includes('BuyerOrderFeedbackRevision_chain'));
      },
    );

    await check(
      'B13-M04 a populated upgrade accepts a valid assessment and rejects invalid history',
      async () => {
        const feedbackId = randomUUID();
        await sql.query(
          `INSERT INTO "BuyerOrderFeedback"(id,"orderId","reporterId","receiptConfirmationId","sourceClass") VALUES ($1,$2,$3,$4,'OPERATIONAL_USER_SUBMITTED')`,
          [feedbackId, ids.order, ids.buyer, ids.receipt],
        );
        await sql.query(
          `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,rating,comment,"followUpStatus") VALUES ($1,$2,1,'SUBMITTED',$3,'OVERALL',5,'Synthetic upgrade feedback','OPEN')`,
          [randomUUID(), feedbackId, ids.buyer],
        );
        // A duplicate aggregate is rejected.
        await assert.rejects(
          sql.query(
            `INSERT INTO "BuyerOrderFeedback"(id,"orderId","reporterId","receiptConfirmationId","sourceClass") VALUES ($1,$2,$3,$4,'OPERATIONAL_USER_SUBMITTED')`,
            [randomUUID(), ids.order, ids.buyer, ids.receipt],
          ),
          (error: unknown) => (error as { code: string }).code === '23505',
        );
        // A version jump is rejected before any row is attempted.
        await assert.rejects(
          sql.query(
            `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,reason) VALUES ($1,$2,7,'BUYER_CORRECTION',$3,'OVERALL','Version jump')`,
            [randomUUID(), feedbackId, ids.buyer],
          ),
          /current version/i,
        );
        // An invalid rating is rejected by the native check on the next valid version.
        await sql.query(`UPDATE "BuyerOrderFeedback" SET "currentVersion"=2 WHERE id=$1`, [
          feedbackId,
        ]);
        await assert.rejects(
          sql.query(
            `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,rating,reason) VALUES ($1,$2,2,'BUYER_CORRECTION',$3,'OVERALL',9,'Out of range')`,
            [randomUUID(), feedbackId, ids.buyer],
          ),
          (error: unknown) => (error as { code: string }).code === '23514',
        );
        // A follow-up status of FOLLOW_UP without an owner is rejected.
        await assert.rejects(
          sql.query(
            `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,"followUpStatus",reason) VALUES ($1,$2,2,'FOLLOW_UP',$3,'OVERALL','FOLLOW_UP','Unassigned follow-up')`,
            [randomUUID(), feedbackId, ids.buyer],
          ),
          (error: unknown) => (error as { code: string }).code === '23514',
        );
        // A cross-order case link is rejected before insertion.
        const otherRfq = randomUUID();
        const otherOrder = randomUUID();
        await sql.query(
          `INSERT INTO "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation",status,"procurementManaged","updatedAt")
           VALUES ($1,$2,$3,'weaving','Synthetic upgrade other order','Synthetic specification','Synthetic requirements',5,'2027-12-01','Synthetic site','ACCEPTED',true,now())`,
          [otherRfq, ids.buyerOrg, ids.operatorOrg],
        );
        await sql.query(
          'INSERT INTO "CommercialOrder"(id,"rfqId",status) VALUES ($1,$2,\'APPROVED\')',
          [otherOrder, otherRfq],
        );
        const foreignTicket = randomUUID();
        await sql.query(
          `INSERT INTO "SupportTicket"(id,category,"relatedType","relatedId","reporterId","organizationId",description,status,"updatedAt")
           VALUES ($1,'COMMERCIAL','ORDER',$2,$3,$4,'Synthetic other claim','OPEN',now())`,
          [foreignTicket, otherOrder, ids.buyer, ids.operatorOrg],
        );
        await assert.rejects(
          sql.query(
            `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,"linkedTicketId",reason) VALUES ($1,$2,2,'CASE_LINK',$3,'OVERALL',$4,'Cross-order link attempt')`,
            [randomUUID(), feedbackId, ids.operator, foreignTicket],
          ),
          /this order/i,
        );
        // Append-only and identity guards hold.
        await assert.rejects(
          sql.query(
            `UPDATE "BuyerOrderFeedbackRevision" SET comment='rewritten' WHERE "feedbackId"=$1`,
            [feedbackId],
          ),
          /append-only/i,
        );
        await assert.rejects(
          sql.query(`DELETE FROM "BuyerOrderFeedbackRevision" WHERE "feedbackId"=$1`, [feedbackId]),
          /append-only/i,
        );
        await assert.rejects(
          sql.query(`UPDATE "BuyerOrderFeedback" SET "receiptConfirmationId"=$2 WHERE id=$1`, [
            feedbackId,
            ids.receipt,
          ]),
          /immutable|exactly one/i,
        );
        // A valid correction and a valid case link are accepted.
        await sql.query(
          `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,rating,comment,"followUpStatus",reason) VALUES ($1,$2,2,'BUYER_CORRECTION',$3,'QUALITY',4,'Synthetic corrected feedback','OPEN','Method notes corrected')`,
          [randomUUID(), feedbackId, ids.buyer],
        );
        await sql.query(`UPDATE "BuyerOrderFeedback" SET "currentVersion"=3 WHERE id=$1`, [
          feedbackId,
        ]);
        await sql.query(
          `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,rating,comment,"followUpStatus","linkedTicketId",reason) VALUES ($1,$2,3,'CASE_LINK',$3,'QUALITY',4,'Synthetic corrected feedback','OPEN',$4,'Link the existing claim')`,
          [randomUUID(), feedbackId, ids.operator, ids.ticket],
        );
        assert.equal(
          (
            await sql.query<{ n: string }>(
              'SELECT "currentVersion"::text AS n FROM "BuyerOrderFeedback" WHERE id=$1',
              [feedbackId],
            )
          ).rows[0].n,
          '3',
        );
        assert.equal(
          (
            await sql.query('SELECT 1 FROM "BuyerOrderFeedbackRevision" WHERE "feedbackId"=$1', [
              feedbackId,
            ])
          ).rowCount,
          3,
        );
        // A failed revision and its header advance roll back together.
        await sql.query('BEGIN');
        try {
          await sql.query(`UPDATE "BuyerOrderFeedback" SET "currentVersion"=4 WHERE id=$1`, [
            feedbackId,
          ]);
          await assert.rejects(
            sql.query(
              `INSERT INTO "BuyerOrderFeedbackRevision"(id,"feedbackId",version,kind,"actorId",category,"linkedTicketId",reason) VALUES ($1,$2,4,'CASE_LINK',$3,'OVERALL','missing-ticket','Rollback attempt')`,
              [randomUUID(), feedbackId, ids.operator],
            ),
          );
        } finally {
          await sql.query('ROLLBACK');
        }
        assert.equal(
          (
            await sql.query<{ n: string }>(
              'SELECT "currentVersion"::text AS n FROM "BuyerOrderFeedback" WHERE id=$1',
              [feedbackId],
            )
          ).rows[0].n,
          '3',
        );
      },
    );

    await check(
      'B13-M05 migration history matches every SQL file with no failed migration',
      async () => {
        const history = (
          await sql.query<{
            migration_name: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }>('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations"')
        ).rows;
        const record = history.find((row) => row.migration_name === migration);
        assert.ok(record?.finished_at, 'the new migration applied cleanly');
        assert.equal(record.rolled_back_at, null);
        const { readdir, readFile } = await import('node:fs/promises');
        const root = new URL('../prisma/migrations/', import.meta.url);
        const names = (await readdir(root, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
        assert.equal(history.length, names.length, 'every migration file is recorded exactly once');
        assert.ok(names.includes(migration));
        assert.ok(names.includes(previous), 'historical migrations are preserved');
        assert.equal(
          createHash('sha256')
            .update(await readFile(new URL(`${migration}/migration.sql`, root)))
            .digest('hex').length,
          64,
        );
      },
    );

    const sourceRows = async (connection: string) => {
      const client = new Client({ connectionString: connection });
      await client.connect();
      try {
        const rows = await client.query<{ row: string }>(
          'SELECT row_to_json(t)::text AS row FROM "BuyerOrderFeedbackRevision" t',
        );
        const headers = await client.query<{ row: string }>(
          'SELECT row_to_json(t)::text AS row FROM "BuyerOrderFeedback" t',
        );
        return {
          headers: headers.rows.map((r) => r.row).sort(),
          revisions: rows.rows.map((r) => r.row).sort(),
        };
      } finally {
        await client.end();
      }
    };

    await check(
      'B13-M06 backup of a populated feedback database restores both history tables exactly',
      async () => {
        const reference = await sourceRows(database.url);
        assert.equal(reference.headers.length, 1);
        assert.equal(reference.revisions.length, 3);
        const target = await disposableDatabase();
        const directory = await mkdtemp(join(tmpdir(), 'nasj-feedback-restore-'));
        try {
          // The dump is produced inside the source container so binary bytes never pass through Node.
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
            '/tmp/feedback.dump',
          ]);
          const archive = join(directory, 'feedback.dump');
          await exec('docker', [
            '--context',
            'default',
            'cp',
            `${database.containerName}:/tmp/feedback.dump`,
            archive,
          ]);
          await exec('docker', [
            '--context',
            'default',
            'cp',
            archive,
            `${target.containerName}:/tmp/feedback.dump`,
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
            '/tmp/feedback.dump',
          ]);
          const restored = await sourceRows(target.url);
          assert.deepEqual(restored, reference, 'restored history matches the source exactly');
          // Append-only protection survives a restore.
          const client = new Client({ connectionString: target.url });
          await client.connect();
          try {
            await assert.rejects(
              client.query('DELETE FROM "BuyerOrderFeedbackRevision"'),
              /append-only/i,
            );
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
        evidence: 'DISPOSABLE_NATIVE_POSTGRESQL_FEEDBACK_UPGRADE',
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
