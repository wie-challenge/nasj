import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { disposableDatabase } from './support.js';
import { seedCommerceFixture } from './commerce.fixture.js';
import { projectCapacity } from '../src/modules/artisans/capacity.js';

export async function runCapacityUpgradeScenario(
  check: (name: string, run: () => Promise<void>) => Promise<void>,
) {
  await check(
    'capacity migration backfills lineage while preserving declarations, accepted work, identities and sessions',
    async () => {
      const isolated = await disposableDatabase();
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolated.url }) });
      const sql = new Client({ connectionString: isolated.url });
      try {
        await sql.connect();
        const users = await Promise.all(
          ['buyer', 'operator', 'artisan', 'quality', 'outsider'].map((role) =>
            db.user.create({
              data: {
                id: randomUUID(),
                name: `Synthetic upgrade ${role}`,
                email: `capacity-upgrade-${role}@example.com`,
                emailVerified: true,
              },
            }),
          ),
        );
        const [buyer, operator, artisan, quality, outsider] = users;
        await db.account.create({
          data: {
            id: randomUUID(),
            userId: artisan.id,
            accountId: artisan.id,
            providerId: 'credential',
            password: 'synthetic-preservation-sentinel',
          },
        });
        await db.session.create({
          data: {
            id: randomUUID(),
            userId: artisan.id,
            token: 'synthetic-capacity-upgrade-session',
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const fixture = await seedCommerceFixture(
          db,
          {
            buyerId: buyer.id,
            operatorId: operator.id,
            artisanId: artisan.id,
            qualityId: quality.id,
            outsiderId: outsider.id,
          },
          'capacity-upgrade',
        );
        const original = await db.capacityDeclaration.update({
          where: { id: fixture.capacityDeclarationId },
          data: { supersededAt: new Date(), createdAt: new Date('2026-10-01') },
        });
        const second = await db.capacityDeclaration.create({
          data: {
            artisanProfileId: original.artisanProfileId,
            craftSkillId: original.craftSkillId,
            unitType: original.unitType,
            effectiveFrom: original.effectiveFrom,
            effectiveTo: original.effectiveTo,
            quantity: 20,
            declaredByUserId: artisan.id,
            supersededAt: new Date(),
            createdAt: new Date('2026-10-02'),
          },
        });
        const latest = await db.capacityDeclaration.create({
          data: {
            artisanProfileId: original.artisanProfileId,
            craftSkillId: original.craftSkillId,
            unitType: original.unitType,
            effectiveFrom: original.effectiveFrom,
            effectiveTo: original.effectiveTo,
            quantity: 25,
            declaredByUserId: artisan.id,
            createdAt: new Date('2026-10-03'),
          },
        });
        const rfq = await db.commercialRfq.create({
          data: {
            buyerOrganizationId: fixture.buyerOrganizationId,
            operatorOrganizationId: fixture.operatorOrganizationId,
            craftSkillId: 'weaving',
            title: 'Synthetic preserved work',
            specification: 'Synthetic only',
            designRequirements: 'Synthetic only',
            quantity: 30,
            deliveryAt: new Date(fixture.deliveryAt),
            deliveryLocation: 'Synthetic site',
            status: 'ACCEPTED',
            order: { create: { status: 'PLANNING' } },
          },
          include: { order: true },
        });
        const offer = await db.commercialOffer.create({
          data: {
            orderId: rfq.order!.id,
            artisanProfileId: original.artisanProfileId,
            capacityDeclarationId: original.id,
            quantity: 30,
            unitPayMillimes: 1000n,
            estimatedHours: 'Synthetic only',
            expiresAt: new Date(fixture.offerExpiresAt),
            materials: 'Synthetic only',
            reworkTerms: 'Synthetic only',
            paymentConditions: 'Simulated only',
            status: 'ACCEPTED',
            batch: {
              create: { orderId: rfq.order!.id, artisanProfileId: original.artisanProfileId },
            },
          },
        });
        const before = {
          users: await db.user.findMany(),
          accounts: await db.account.findMany(),
          sessions: await db.session.findMany(),
          offer: await db.commercialOffer.findUniqueOrThrow({ where: { id: offer.id } }),
        };
        // Only this newly created disposable database: remove the added metadata to recreate the pre-migration schema.
        await sql.query(
          'ALTER TABLE "CapacityDeclaration" DROP COLUMN "previousDeclarationId", DROP COLUMN "version"',
        );
        const migration = await readFile(
          new URL(
            '../prisma/migrations/20261027010000_capacity_revisions/migration.sql',
            import.meta.url,
          ),
          'utf8',
        );
        await sql.query(migration);
        const records = await db.capacityDeclaration.findMany({ orderBy: { createdAt: 'asc' } });
        assert.deepEqual(
          records.map((r) => r.id),
          [original.id, second.id, latest.id],
        );
        assert.deepEqual(
          records.map((r) => r.version),
          [1, 2, 3],
        );
        assert.deepEqual(
          records.map((r) => r.previousDeclarationId),
          [null, original.id, second.id],
        );
        assert.deepEqual(
          records.map((r) => r.quantity.toString()),
          ['10', '20', '25'],
        );
        assert.deepEqual(
          {
            users: await db.user.findMany(),
            accounts: await db.account.findMany(),
            sessions: await db.session.findMany(),
            offer: await db.commercialOffer.findUniqueOrThrow({ where: { id: offer.id } }),
          },
          before,
        );
        const projected = await projectCapacity(db, records[2]);
        assert.equal(projected.committed, '30.00');
        assert.equal(projected.deficit, '5.00');
      } finally {
        await sql.end();
        await db.$disconnect();
        await isolated.stop();
      }
    },
  );
}
