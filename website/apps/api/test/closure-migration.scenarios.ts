import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { disposableDatabase } from './support.js';
import { runRestoreScenario } from './restore.scenarios.js';
export async function runClosureMigrationScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ throughMigration: '20261028170000_demo_feedback' });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.url }) });
  try {
    const actor = await db.user.create({
      data: {
        id: 'synthetic-closure-upgrade-actor',
        email: 'closure-upgrade@example.com',
        name: 'Synthetic migration actor',
        emailVerified: true,
      },
    });
    const org = async (type: 'BUYER_BUSINESS' | 'INTERNAL') =>
      db.organization.create({
        data: {
          name: `Synthetic upgrade ${type}`,
          slug: `upgrade-${type.toLowerCase()}`,
          type,
          region: 'Tunis',
          description: 'Synthetic additive migration verification',
          contactEmail: 'synthetic-upgrade@example.com',
          representativeName: 'Synthetic representative',
          createdByUserId: actor.id,
        },
      });
    const buyer = await org('BUYER_BUSINESS'),
      operator = await org('INTERNAL');
    await db.craftSkill.upsert({
      where: { id: 'weaving' },
      create: { id: 'weaving', name: 'Weaving', category: 'TEXTILE' },
      update: {},
    });
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: buyer.id,
        operatorOrganizationId: operator.id,
        craftSkillId: 'weaving',
        title: 'Synthetic upgrade',
        specification: 'Synthetic',
        designRequirements: 'Synthetic',
        quantity: 1,
        deliveryAt: new Date('2027-01-01'),
        deliveryLocation: 'Synthetic Tunis',
        order: { create: {} },
      },
      include: { order: true },
    });
    const input = {
      orderId: rfq.order!.id,
      actorId: actor.id,
      status: 'BLOCKED',
      blockers: ['POLICY_UNAPPROVED'],
      snapshot: { verifiedPaidTnd: '0.000' },
    };
    const legacy = await db.orderClosureAssessment.create({ data: input });
    const audit = await db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: 'test.synthetic.closure.upgrade',
        targetType: 'OrderClosureAssessment',
        targetId: legacy.id,
        correlationId: 'synthetic-closure-upgrade',
      },
    });
    await db.outboxEvent.create({
      data: {
        id: 'synthetic-closure-upgrade-outbox',
        auditEventId: audit.id,
        actorId: actor.id,
        eventType: audit.action,
        targetType: audit.targetType,
        targetId: audit.targetId,
        correlationId: audit.correlationId,
      },
    });
    await check('FPA-03 migration 39 preserves all populated pre-existing rows', async () => {
      const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
      );
      const rows = async () => {
        const result: Record<string, unknown> = {};
        for (const { tablename } of tables) {
          const quoted = tablename.replaceAll('"', '""');
          result[tablename] = await db.$queryRawUnsafe(
            `SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY row_to_json(t)::text), '[]'::jsonb)::text AS rows FROM "${quoted}" t`,
          );
        }
        return result;
      };
      const before = await rows();
      await assert.rejects(
        db.orderClosureAssessment.create({
          data: { ...input, status: 'SYNTHETIC_ONLY_READY', blockers: [] },
        }),
      );
      await promisify(execFile)('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, DATABASE_URL: database.url, MIGRATION_DATABASE_URL: database.url },
      });
      assert.deepEqual(await rows(), before);
      const migrations = await db.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      assert.equal(migrations[0].count, 39n);
    });
    await check(
      'FPA-03 native synthetic readiness rejects verified payment and unresolved blockers',
      async () => {
        const saved = await db.orderClosureAssessment.create({
          data: { ...input, status: 'SYNTHETIC_ONLY_READY', blockers: [] },
        });
        assert.equal(saved.status, 'SYNTHETIC_ONLY_READY');
        for (const snapshot of [{}, { verifiedPaidTnd: '1.000' }, { verifiedPaidTnd: null }])
          await assert.rejects(
            db.orderClosureAssessment.create({
              data: { ...input, status: 'SYNTHETIC_ONLY_READY', blockers: [], snapshot },
            }),
          );
        await assert.rejects(
          db.orderClosureAssessment.create({ data: { ...input, status: 'SYNTHETIC_ONLY_READY' } }),
        );
        await assert.rejects(
          db.orderClosureAssessment.create({ data: { ...input, status: 'READY_FOR_CLOSURE' } }),
        );
        await assert.rejects(
          db.orderClosureAssessment.update({
            where: { id: saved.id },
            data: { status: 'BLOCKED' },
          }),
        );
      },
    );
    await runRestoreScenario(database, (name, fn) => check(`FPA-03 migration 39 ${name}`, fn));
  } finally {
    await db.$disconnect();
    await database.stop();
  }
}
