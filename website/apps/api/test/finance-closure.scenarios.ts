import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import { seedCommerceFixture } from './commerce.fixture.js';
type Result = { status: number; body: unknown };
type Identity = {
  me: { user: { id: string } };
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<Result>;
  };
};
export async function runFinanceClosureScenarios({
  db,
  register,
  check,
}: {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
}) {
  const people = [];
  for (const role of ['buyer', 'operator', 'artisan', 'quality', 'stranger'])
    people.push(await register(`closure-${role}@example.com`, `Synthetic closure ${role}`));
  const [buyer, operator, artisan, quality, stranger] = people;
  await db.craftSkill.upsert({
    where: { id: 'weaving' },
    create: { id: 'weaving', name: 'Weaving', category: 'TEXTILE' },
    update: {},
  });
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: stranger.me.user.id,
    },
    'closure-remediation',
  );
  await db.operatorAssignment.create({
    data: {
      operatorId: operator.me.user.id,
      organizationId: fixture.buyerOrganizationId,
      assignedById: operator.me.user.id,
    },
  });
  const membership = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: fixture.operatorOrganizationId,
        userId: operator.me.user.id,
      },
    },
  });
  await db.membershipPermission.create({
    data: {
      membershipId: membership.id,
      permission: 'finance.closure.assess',
      grantedById: operator.me.user.id,
      reason: 'Synthetic explicit closure assessment authority',
    },
  });
  const rfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: fixture.buyerOrganizationId,
      operatorOrganizationId: fixture.operatorOrganizationId,
      craftSkillId: 'weaving',
      title: 'Synthetic closure remediation fixture',
      specification: 'Synthetic legacy test only',
      designRequirements: 'Fictional piece',
      quantity: 1,
      deliveryAt: new Date(fixture.deliveryAt),
      deliveryLocation: 'Synthetic Tunis',
      quoteMillimes: 1000n,
      order: { create: { status: 'SETTLED', delivered: 1, materialsResolved: true } },
    },
    include: { order: true },
  });
  const orderId = rfq.order!.id;
  const offer = await db.commercialOffer.create({
    data: {
      orderId,
      capacityDeclarationId: fixture.capacityDeclarationId,
      artisanProfileId: fixture.artisanProfileId,
      quantity: 1,
      unitPayMillimes: 500n,
      estimatedHours: '1',
      expiresAt: new Date(fixture.offerExpiresAt),
      materials: 'Synthetic materials',
      reworkTerms: 'Synthetic review',
      paymentConditions: 'Simulation only',
      status: 'ACCEPTED',
    },
  });
  const batch = await db.commercialBatch.create({
    data: {
      orderId,
      offerId: offer.id,
      artisanProfileId: fixture.artisanProfileId,
      status: 'COMPLETED',
      produced: 1,
      submitted: 1,
      approved: 1,
    },
  });
  await db.syntheticPayment.createMany({
    data: [
      {
        orderId,
        kind: 'BUYER_RECEIPT',
        status: 'SETTLED',
        amountMillimes: 1000n,
        evidenceType: 'SIMULATED_SETTLEMENT',
      },
      {
        orderId,
        batchId: batch.id,
        kind: 'ARTISAN_PAYOUT',
        status: 'SETTLED',
        amountMillimes: 500n,
        evidenceType: 'SIMULATED_SETTLEMENT',
      },
    ],
  });
  const path = `/api/v1/finance/orders/${orderId}/closure`;
  async function send(who: Identity, target: string, body: unknown, key = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(target, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  await check(
    'FPA-03 HTTP synthetic assessment persists, replays and returns attributable immutable history',
    async () => {
      const assessed = await operator.client.request(path);
      assert.equal(assessed.status, 200, JSON.stringify(assessed.body));
      assert.equal((assessed.body as { status: string }).status, 'SYNTHETIC_ONLY_READY');
      const key = randomUUID();
      const stored = await send(operator, path, {}, key);
      assert.equal(stored.status, 201, JSON.stringify(stored.body));
      const id = (stored.body as { id: string }).id;
      const replayed = await send(operator, path, {}, key);
      assert.deepEqual(replayed.body, stored.body);
      assert.equal(await db.orderClosureAssessment.count({ where: { orderId } }), 1);
      const review = await operator.client.request(path);
      const history = (
        review.body as {
          history: {
            id: string;
            status: string;
            actorId: string;
            snapshot: { verifiedPaidTnd: string };
          }[];
        }
      ).history;
      assert.equal(history.length, 1);
      assert.equal(history[0].id, id);
      assert.equal(history[0].status, 'SYNTHETIC_ONLY_READY');
      assert.equal(history[0].actorId, operator.me.user.id);
      assert.equal(history[0].snapshot.verifiedPaidTnd, '0.000');
      assert.equal(
        await db.financeRecordEvent.count({
          where: { targetId: id, status: 'SYNTHETIC_ONLY_READY' },
        }),
        1,
      );
      assert.equal(await db.auditEvent.count({ where: { targetId: id } }), 1);
      await assert.rejects(
        db.orderClosureAssessment.update({ where: { id }, data: { status: 'BLOCKED' } }),
      );
      await assert.rejects(db.orderClosureAssessment.delete({ where: { id } }));
      for (const who of [buyer, stranger, artisan]) {
        assert.equal((await who.client.request(path)).status, 404);
        assert.equal((await send(who, path, {})).status, 404);
      }
      assert.equal(await db.orderClosureAssessment.count({ where: { orderId } }), 1);
      await assert.rejects(
        db.orderClosureAssessment.create({
          data: {
            orderId,
            actorId: operator.me.user.id,
            status: 'READY_FOR_CLOSURE',
            blockers: [],
            snapshot: {},
          },
        }),
      );
    },
  );
  await check(
    'FPA-03 synthetic readiness never authorizes live closure or a liability exception',
    async () => {
      const before = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      const denied = await send(operator, `/api/v1/finance/orders/${orderId}/close`, {
        version: before.version,
        reason: 'Synthetic review is not approved closure authority',
        exceptionReference: 'Synthetic cannot waive liabilities',
      });
      assert.equal(denied.status, 201, JSON.stringify(denied.body));
      assert.equal((denied.body as { status: string }).status, 'DENIED');
      assert.deepEqual(
        await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } }),
        before,
      );
      assert.equal(
        await db.orderClosureAssessment.count({ where: { orderId, status: 'BLOCKED' } }),
        1,
      );
    },
  );
  await check(
    'FPA-03 failed history write rolls back assessment, receipt and audit atomically',
    async () => {
      const before = {
        assessments: await db.orderClosureAssessment.count({ where: { orderId } }),
        outcomes: await db.commandOutcome.count(),
        audits: await db.auditEvent.count(),
      };
      // Test-only failing trigger in this disposable database; never part of migrations or app code.
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fpa03_test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetType"='OrderClosureAssessment' THEN RAISE EXCEPTION 'Synthetic forced history failure'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER fpa03_test_reject_event BEFORE INSERT ON "FinanceRecordEvent" FOR EACH ROW EXECUTE FUNCTION fpa03_test_reject_event()`,
      );
      const key = randomUUID();
      try {
        const failed = await send(operator, path, {}, key);
        assert.equal(failed.status, 500);
        assert.equal(
          await db.orderClosureAssessment.count({ where: { orderId } }),
          before.assessments,
        );
        assert.equal(await db.commandOutcome.count(), before.outcomes);
        assert.equal(await db.auditEvent.count(), before.audits);
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER fpa03_test_reject_event ON "FinanceRecordEvent"');
        await db.$executeRawUnsafe('DROP FUNCTION fpa03_test_reject_event()');
      }
      assert.equal(
        (await send(operator, path, {}, key)).status,
        201,
        'rolled-back receipt must allow retry',
      );
    },
  );
}
