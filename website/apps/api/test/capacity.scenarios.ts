import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { replaySafe } from '../src/modules/foundation/idempotency.js';
import type { CapacityDeclarationView } from '@nasj/contracts';
import type { PrismaService } from '../src/database/prisma.service.js';
import { seedCommerceFixture } from './commerce.fixture.js';
type Result = { status: number; body: unknown };
type Identity = {
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      extra?: Record<string, string>,
    ): Promise<Result>;
  };
  me: { user: { id: string } };
};
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
export async function runCapacityScenarios({ db, register, check }: Harness) {
  const identities = await Promise.all(
    ['buyer', 'operator', 'artisan', 'quality', 'outsider', 'coordinator', 'unassigned'].map((r) =>
      register(`capacity-${r}@example.com`, `Synthetic capacity ${r}`),
    ),
  );
  const [buyer, operator, artisan, quality, outsider, coordinator, unassigned] = identities;
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: outsider.me.user.id,
    },
    'capacity',
  );
  const period = {
    effectiveFrom: '2027-03-01T00:00:00+01:00',
    effectiveTo: '2027-03-08T00:00:00+01:00',
  };
  await db.capacityDeclaration.update({
    where: { id: fixture.capacityDeclarationId },
    data: {
      effectiveFrom: new Date(period.effectiveFrom),
      effectiveTo: new Date(period.effectiveTo),
    },
  });
  const association = await db.organization.create({
    data: {
      name: 'Synthetic capacity association',
      slug: 'synthetic-capacity-association',
      type: 'ASSOCIATION',
      approvalStatus: 'APPROVED',
      region: 'Tunis',
      description: 'Synthetic capacity authorization fixture',
      contactEmail: 'capacity@example.com',
      representativeName: 'Synthetic coordinator',
      createdByUserId: coordinator.me.user.id,
      members: {
        create: [coordinator, unassigned].map((who) => ({
          userId: who.me.user.id,
          roles: {
            create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinator.me.user.id },
          },
        })),
      },
    },
  });
  await db.artisanManagement.create({
    data: {
      artisanProfileId: fixture.artisanProfileId,
      organizationId: association.id,
      recordedById: coordinator.me.user.id,
      reason: 'Synthetic management fixture',
    },
  });
  await db.artisanAssignment.create({
    data: {
      artisanProfileId: fixture.artisanProfileId,
      organizationId: association.id,
      coordinatorId: coordinator.me.user.id,
      assignedById: coordinator.me.user.id,
      reason: 'Synthetic assignment fixture',
    },
  });
  const policy = await db.authorizationPolicy.create({
    data: {
      version: 'capacity-test-v1',
      methods: ['SIGNED'],
      reviewReference: 'Synthetic independently reviewed method',
      reviewedById: coordinator.me.user.id,
    },
  });
  const evidence = async (purpose: 'PARTICIPATION' | 'CAPACITY') =>
    db.onboardingAuthorization.create({
      data: {
        artisanProfileId: fixture.artisanProfileId,
        policyId: policy.id,
        purpose,
        method: 'SIGNED',
        occurredAt: new Date(),
        language: 'fr',
        evidenceReference: 'Synthetic signed worker confirmation',
        recordedById: coordinator.me.user.id,
      },
    });
  await evidence('PARTICIPATION');
  const authorization = await evidence('CAPACITY');
  const selfPath = '/api/v1/artisans/me/capacity';
  const assistedPath = `/api/v1/associations/me/artisans/${fixture.artisanProfileId}/capacity`;
  async function command(who: Identity, path: string, body: unknown, key = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function read(who = artisan, path = selfPath) {
    const result = await who.client.request(path);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return (result.body as { items: CapacityDeclarationView[] }).items;
  }
  const declaration = (quantity: number, expectedVersion: number) => ({
    ...period,
    craftSkillId: 'weaving',
    unitType: 'PIECES',
    quantity,
    expectedVersion,
  });
  const rfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: fixture.buyerOrganizationId,
      operatorOrganizationId: fixture.operatorOrganizationId,
      craftSkillId: 'weaving',
      title: 'Synthetic capacity order',
      specification: 'Synthetic fixture only',
      designRequirements: 'Synthetic fixture only',
      quantity: 200,
      deliveryAt: new Date('2027-03-05T12:00:00+01:00'),
      deliveryLocation: 'Synthetic site',
      status: 'ACCEPTED',
      order: { create: { status: 'PLANNING' } },
    },
    include: { order: true },
  });
  const orderId = rfq.order!.id;
  const offerInput = (id: string, quantity: number) => ({
    orderId,
    capacityDeclarationId: id,
    quantity,
    unitPayTnd: '1.000',
    estimatedHours: 'Synthetic effort range',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    materials: 'Synthetic material responsibility',
    reworkTerms: 'Synthetic rework agreement',
    paymentConditions: 'Simulated only',
    provenance: 'SYNTHETIC',
  });
  async function offer(id: string, quantity: number) {
    const result = await command(operator, '/api/v1/commerce/offers', offerInput(id, quantity));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body as { id: string; version: number };
  }
  let current!: CapacityDeclarationView;
  let reserved!: { id: string; version: number }, accepted!: { id: string; version: number };
  await check(
    'capacity exact projection agrees for self and assigned coordinator without exposing terms',
    async () => {
      const result = await command(artisan, selfPath, declaration(100, 1));
      assert.equal(result.status, 201, JSON.stringify(result.body));
      current = result.body as CapacityDeclarationView;
      reserved = await offer(current.id, 20);
      accepted = await offer(current.id, 30);
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${accepted.id}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: accepted.version,
          })
        ).status,
        201,
      );
      const a = (await read()).find((r) => !r.supersededAt)!;
      const b = (await read(coordinator, assistedPath)).find((r) => !r.supersededAt)!;
      for (const key of ['declared', 'reserved', 'committed', 'remaining', 'deficit'] as const)
        assert.equal(a.summary[key], b.summary[key]);
      assert.equal(a.summary.remaining, '50.00');
      assert.equal(a.summary.reserved, '20.00');
      assert.equal(a.summary.committed, '30.00');
      assert.equal(JSON.stringify(b).includes('unitPay'), false);
      // A durable result written by the pre-upgrade endpoint must still replay, not conflict or redeclare.
      const { expectedVersion: _version, ...legacyInput } = declaration(100, current.version);
      const legacyKey = randomUUID();
      await db.$transaction(async (tx) =>
        replaySafe(
          tx,
          {
            actorId: artisan.me.user.id,
            resourceId: fixture.artisanProfileId,
            operation: 'capacity.declare',
            key: legacyKey,
          },
          legacyInput,
          async () => ({ id: current.id, quantity: current.quantity }),
        ),
      );
      const legacyReplay = await command(artisan, selfPath, legacyInput, legacyKey);
      assert.equal(legacyReplay.status, 201);
      assert.equal((legacyReplay.body as CapacityDeclarationView).id, current.id);
      assert.equal((legacyReplay.body as CapacityDeclarationView).summary.remaining, '50.00');

      const history = await artisan.client.request(`${selfPath}?page=2&pageSize=1`);
      assert.equal(history.status, 200);
      assert.equal((history.body as { items: unknown[] }).items.length, 1);
      assert.equal((history.body as { total: number }).total, 2);
      assert.equal((await artisan.client.request(`${selfPath}?sensorData=private`)).status, 400);
    },
  );
  await check(
    'assisted revision preserves predecessor commitments, exact deficit, replay and actor audit',
    async () => {
      const key = randomUUID();
      const input = {
        ...declaration(25, current.version),
        quantity: '25',
        authorizationId: authorization.id,
      };
      const result = await command(coordinator, assistedPath, input, key);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      current = result.body as CapacityDeclarationView;
      assert.equal(current.summary.deficit, '5.00');
      assert.equal(current.summary.remaining, '0.00');
      assert.equal(current.summary.reserved, '20.00');
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${reserved.id}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: reserved.version,
          })
        ).status,
        409,
      );
      assert.equal(current.recordingMode, 'ASSISTED');
      assert.equal(current.authorizationId, authorization.id);
      const replay = await command(coordinator, assistedPath, input, key);
      assert.deepEqual(replay.body, result.body);
      assert.equal(
        (await command(coordinator, assistedPath, { ...input, quantity: '26' }, key)).status,
        409,
      );
      assert.equal(
        (await command(operator, '/api/v1/commerce/offers', offerInput(current.id, 1))).status,
        409,
      );
      assert.equal(await db.commercialBatch.count({ where: { offerId: accepted.id } }), 1);
      const audit = await db.auditEvent.findFirstOrThrow({
        where: { targetId: current.id, action: 'association.capacity.record' },
      });
      assert.equal(audit.actorId, coordinator.me.user.id);
      assert.equal(audit.organizationId, association.id);
      assert.equal((audit.after as { version: number }).version, current.version);
      assert.equal(
        (await command(artisan, selfPath, declaration(50, current.version - 1))).status,
        409,
      );
    },
  );
  await check(
    'expired reservations release once while accepted work remains; completed throughput stays consumed',
    async () => {
      await db.commercialOffer.update({
        where: { id: reserved.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const key = randomUUID(),
        input = { next: 'EXPIRED', version: reserved.version };
      assert.equal(
        (await command(operator, `/api/v1/commerce/offers/${reserved.id}/actions`, input, key))
          .status,
        201,
      );
      assert.equal(
        (await command(operator, `/api/v1/commerce/offers/${reserved.id}/actions`, input, key))
          .status,
        201,
      );
      let row = (await read()).find((r) => !r.supersededAt)!;
      assert.equal(row.summary.reserved, '0.00');
      assert.equal(row.summary.committed, '30.00');
      // Terminal-state fixture; the existing commerce suite separately exercises guarded batch transitions.
      await db.commercialBatch.update({
        where: { offerId: accepted.id },
        data: { status: 'COMPLETED' },
      });
      row = (await read()).find((r) => !r.supersededAt)!;
      assert.equal(row.summary.committed, '30.00');
      assert.equal(row.summary.remaining, '0.00');
      assert.notEqual(row.summary.remaining, '25.00');
    },
  );
  await check(
    'concurrent offers and concurrent expected-version revisions cannot oversubscribe',
    async () => {
      const revisions = await Promise.all(
        [100, 90].map((n) => command(artisan, selfPath, declaration(n, current.version))),
      );
      assert.deepEqual(revisions.map((r) => r.status).sort(), [201, 409]);
      current = revisions.find((r) => r.status === 201)!.body as CapacityDeclarationView;
      const attempts = await Promise.all(
        [1, 2].map(() => command(operator, '/api/v1/commerce/offers', offerInput(current.id, 60))),
      );
      assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await read()).find((r) => !r.supersededAt)!.summary.reserved, '60.00');
      const held = attempts.find((r) => r.status === 201)!.body as { id: string; version: number };
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${held.id}/actions`, {
            next: 'DECLINED',
            version: held.version,
          })
        ).status,
        201,
      );
      assert.equal((await read()).find((r) => !r.supersededAt)!.summary.reserved, '0.00');
      const pending = await offer(current.id, 5);
      const raised = await command(artisan, selfPath, declaration(110, current.version));
      assert.equal(raised.status, 201);
      current = raised.body as CapacityDeclarationView;
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${pending.id}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: pending.version,
          })
        ).status,
        201,
      );
      assert.equal((await read()).find((r) => !r.supersededAt)!.summary.committed, '35.00');
    },
  );
  await check(
    'capacity validates zero, overlap, craft, units and forbidden fields on both write paths',
    async () => {
      for (const who of [artisan, coordinator]) {
        const path = who === artisan ? selfPath : assistedPath;
        const base =
          who === artisan
            ? declaration(10, current.version)
            : {
                ...declaration(10, current.version),
                quantity: '10',
                authorizationId: authorization.id,
              };
        for (const invalid of [
          { unitType: 'FATIGUE' },
          { sensorData: [] },
          { craftSkillId: 'missing' },
          { effectiveTo: period.effectiveFrom },
          { quantity: who === artisan ? -1 : '-1' },
        ])
          assert.equal((await command(who, path, { ...base, ...invalid })).status, 400);
        assert.equal(
          (await command(who, path, { ...base, effectiveFrom: '2027-03-02T00:00:00+01:00' }))
            .status,
          409,
        );
      }
      const zero = await command(artisan, selfPath, declaration(0, current.version));
      assert.equal(zero.status, 201);
      current = zero.body as CapacityDeclarationView;
      assert.equal(current.summary.remaining, '0.00');
    },
  );
  await check(
    'half-open boundaries accept start and reject end; adjacent periods do not overlap',
    async () => {
      const changed = await command(artisan, selfPath, declaration(100, current.version));
      assert.equal(changed.status, 201);
      current = changed.body as CapacityDeclarationView;
      await db.commercialRfq.update({
        where: { id: rfq.id },
        data: { deliveryAt: new Date(period.effectiveTo) },
      });
      assert.equal(
        (await command(operator, '/api/v1/commerce/offers', offerInput(current.id, 1))).status,
        409,
      );
      await db.commercialRfq.update({
        where: { id: rfq.id },
        data: { deliveryAt: new Date(period.effectiveFrom) },
      });
      const atStart = await offer(current.id, 1);
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${atStart.id}/actions`, {
            next: 'DECLINED',
            version: atStart.version,
          })
        ).status,
        201,
      );
      const adjacent = await command(artisan, selfPath, {
        ...declaration(10, 0),
        effectiveFrom: period.effectiveTo,
        effectiveTo: '2027-03-15T00:00:00+01:00',
      });
      assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));
    },
  );
  await check(
    'incompatible units and legacy cross-week allocations expose unknown rather than false availability',
    async () => {
      const held = await offer(current.id, 5);
      assert.equal(
        (
          await command(artisan, `/api/v1/commerce/offers/${held.id}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: held.version,
          })
        ).status,
        201,
      );
      const hours = await command(artisan, selfPath, { ...declaration(100, 0), unitType: 'HOURS' });
      assert.equal(hours.status, 201);
      const h = hours.body as CapacityDeclarationView;
      assert.deepEqual(h.summary.constraints, ['INCOMPATIBLE_COMMITMENT_UNIT']);
      assert.equal(h.summary.remaining, '0.00');
      // Ambiguous legacy allocation overlapping a week boundary is retained and explicitly blocks new offers.
      const legacy = await db.capacityDeclaration.create({
        data: {
          artisanProfileId: fixture.artisanProfileId,
          craftSkillId: 'weaving',
          unitType: 'PIECES',
          quantity: 10,
          effectiveFrom: new Date('2027-03-04T00:00:00+01:00'),
          effectiveTo: new Date('2027-03-11T00:00:00+01:00'),
          declaredByUserId: artisan.me.user.id,
        },
      });
      const history = await read();
      const ambiguous = history.find((r) => r.id === legacy.id)!;
      assert.ok(ambiguous.summary.constraints.includes('PERIOD_ALLOCATION_UNKNOWN'));
      const row = (await read()).find((r) => r.id === current.id)!;
      assert.equal(row.summary.availabilityKnown, false);
      assert.equal(row.summary.remaining, '0.00');
      assert.equal(
        (await command(operator, '/api/v1/commerce/offers', offerInput(current.id, 1))).status,
        409,
      );
    },
  );
  await check(
    'assisted scope, membership suspension and authorization withdrawal deny writes without mutation',
    async () => {
      const before = await db.capacityDeclaration.count({
        where: { artisanProfileId: fixture.artisanProfileId },
      });
      const input = {
        ...declaration(50, current.version),
        quantity: '50',
        authorizationId: authorization.id,
      };
      const otherCoordinator = await register(
        'capacity-other-coordinator@example.com',
        'Synthetic capacity other coordinator',
      );
      await db.organization.create({
        data: {
          name: 'Synthetic other capacity association',
          slug: 'synthetic-other-capacity-association',
          type: 'ASSOCIATION',
          approvalStatus: 'APPROVED',
          region: 'Sfax',
          description: 'Synthetic cross-organization denial fixture',
          contactEmail: 'other-capacity@example.com',
          representativeName: 'Synthetic other coordinator',
          createdByUserId: otherCoordinator.me.user.id,
          members: {
            create: {
              userId: otherCoordinator.me.user.id,
              roles: {
                create: {
                  role: 'ASSOCIATION_COORDINATOR',
                  assignedByUserId: otherCoordinator.me.user.id,
                },
              },
            },
          },
        },
      });
      for (const who of [unassigned, outsider, otherCoordinator]) {
        assert.ok([403, 404].includes((await who.client.request(assistedPath)).status));
        assert.ok([403, 404].includes((await command(who, assistedPath, input)).status));
      }
      await db.organizationMember.update({
        where: {
          organizationId_userId: { organizationId: association.id, userId: coordinator.me.user.id },
        },
        data: { status: 'SUSPENDED' },
      });
      assert.equal((await command(coordinator, assistedPath, input)).status, 403);
      await db.organizationMember.update({
        where: {
          organizationId_userId: { organizationId: association.id, userId: coordinator.me.user.id },
        },
        data: { status: 'ACTIVE' },
      });
      await db.onboardingAuthorization.update({
        where: { id: authorization.id },
        data: { withdrawnAt: new Date() },
      });
      assert.equal((await command(coordinator, assistedPath, input)).status, 403);
      assert.equal(
        await db.capacityDeclaration.count({
          where: { artisanProfileId: fixture.artisanProfileId },
        }),
        before,
      );
    },
  );
}
