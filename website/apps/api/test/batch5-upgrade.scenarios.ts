import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedCommerceFixture } from './commerce.fixture.js';
import { disposableDatabase } from './support.js';

export async function runBatch5UpgradeScenario(
  check: (name: string, run: () => Promise<void>) => Promise<void>,
) {
  await check(
    'Batch 5 additive chain preserves populated identity, sessions and commercial records',
    async () => {
      const isolated = await disposableDatabase({ foundationOnly: true });
      const sql = new Client({ connectionString: isolated.url });
      try {
        await sql.connect();
        const root = new URL('../prisma/migrations/', import.meta.url);
        const names = (await readdir(root, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
        for (const name of names.filter(
          (name) => name > '202610150001_foundation' && name < '20261027070000',
        )) {
          await sql.query(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
        }
        const userId = randomUUID();
        const sessionId = randomUUID();
        await sql.query(
          'INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,NOW())',
          [userId, 'Synthetic migration sentinel', 'batch5-upgrade@example.com'],
        );
        await sql.query(
          'INSERT INTO "Session" (id,"userId",token,"expiresAt","updatedAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 day\',NOW())',
          [sessionId, userId, 'synthetic-preserved-session'],
        );
        const qualityId = randomUUID(),
          outsiderId = randomUUID();
        for (const id of [qualityId, outsiderId])
          await sql.query(
            'INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,NOW())',
            [id, 'Synthetic sentinel', `${id}@example.com`],
          );
        const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolated.url }) });
        try {
          const f = await seedCommerceFixture(
            db,
            { buyerId: userId, operatorId: userId, artisanId: userId, qualityId, outsiderId },
            'batch5-upgrade',
          );
          const rfq = await db.commercialRfq.create({
            data: {
              buyerOrganizationId: f.buyerOrganizationId,
              operatorOrganizationId: f.operatorOrganizationId,
              craftSkillId: 'weaving',
              title: 'Synthetic preserved batch',
              specification: 'Synthetic only',
              designRequirements: 'Synthetic only',
              quantity: 10,
              deliveryAt: new Date(f.deliveryAt),
              deliveryLocation: 'Synthetic location',
              status: 'ACCEPTED',
              order: { create: { status: 'APPROVED', delivered: 3 } },
            },
            include: { order: { select: { id: true } } },
          });
          const offer = await db.commercialOffer.create({
            data: {
              orderId: rfq.order!.id,
              artisanProfileId: f.artisanProfileId,
              capacityDeclarationId: f.capacityDeclarationId,
              quantity: 10,
              unitPayMillimes: 1000n,
              estimatedHours: 'Synthetic',
              expiresAt: new Date(f.offerExpiresAt),
              materials: 'Synthetic',
              reworkTerms: 'Preserved',
              paymentConditions: 'Preserved synthetic obligation',
              status: 'ACCEPTED',
              batch: { create: { orderId: rfq.order!.id, artisanProfileId: f.artisanProfileId } },
            },
            select: { id: true, paymentConditions: true, batch: { select: { id: true } } },
          });
          await db.artisanPayable.create({
            select: { id: true },
            data: {
              offerId: offer.id,
              orderId: rfq.order!.id,
              batchId: offer.batch!.id,
              artisanProfileId: f.artisanProfileId,
              milestone: 'BUYER_ACCEPTED_PIECE',
              policyVersion: 1,
              quantity: 5,
              unitPayMillimes: 1000n,
              amountMillimes: 5000n,
              sourceEventId: 'synthetic-migration-sentinel',
              termsSnapshot: offer.paymentConditions,
            },
          });
        } finally {
          await db.$disconnect();
        }
        const beforeUsers = (await sql.query('SELECT * FROM "User" ORDER BY id')).rows;
        const beforeSessions = (await sql.query('SELECT * FROM "Session" ORDER BY id')).rows;
        const tables = [
          'CommercialOrder',
          'CommercialOffer',
          'CommercialBatch',
          'BatchRelease',
          'BatchMaterialRequirement',
          'ShipmentPreparation',
          'BuyerDeliveryConfirmation',
          'ArtisanPayable',
          'SimulatedSettlement',
        ];
        const baselineColumns = new Map<string, string[]>();
        for (const table of tables)
          baselineColumns.set(
            table,
            (
              await sql.query<{ column_name: string }>(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
                [table],
              )
            ).rows.map((r) => r.column_name),
          );
        const preservedRows = (table: string) =>
          sql.query(
            `SELECT ${baselineColumns
              .get(table)!
              .map((c) => `"${c.replaceAll('"', '""')}"`)
              .join(',')} FROM "${table}" ORDER BY id`,
          );
        const before: unknown[][] = [];
        for (const table of tables) before.push((await preservedRows(table)).rows);
        for (const name of names.filter((name) => name >= '20261027070000')) {
          await sql.query(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
        }
        assert.deepEqual((await sql.query('SELECT * FROM "User" ORDER BY id')).rows, beforeUsers);
        assert.deepEqual(
          (await sql.query('SELECT * FROM "Session" ORDER BY id')).rows,
          beforeSessions,
        );
        for (const [index, table] of tables.entries()) {
          assert.deepEqual((await preservedRows(table)).rows, before[index]);
        }
        assert.equal(
          (await sql.query('SELECT COUNT(*)::int AS count FROM "MaterialLot"')).rows[0].count,
          0,
        );
        // Existing immutable financial evidence still has its trigger after every additive migration.
        assert.ok(
          (
            await sql.query(
              `SELECT 1 FROM pg_trigger WHERE tgname='ArtisanPayable_immutable' AND NOT tgisinternal`,
            )
          ).rowCount,
        );
      } finally {
        await sql.end();
        await isolated.stop();
      }
    },
  );
}
