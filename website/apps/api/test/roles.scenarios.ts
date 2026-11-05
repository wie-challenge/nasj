import { hasPrivilegedAccess } from '../src/modules/foundation/mfa.js';
import assert from 'node:assert/strict';
import type { PrismaService } from '../src/database/prisma.service.js';
type Reply = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Reply>;
};
type Identity = { client: Client; me: { user: { id: string } } };
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Reply>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  mail: { token(email: string, path: string): Promise<string> };
};
export async function runRoleScenarios({ db, register, mutate, check, mail }: Harness) {
  const make = (label: string) => register(`revised-${label}@example.com`, `Synthetic ${label}`);
  const [admin, a, b, c, d, buyer, rep, operator, unassigned, linked] = await Promise.all(
    [
      'admin',
      'coordinator-a',
      'coordinator-b',
      'coordinator-c',
      'coordinator-d',
      'buyer',
      'representative',
      'operator',
      'unassigned',
      'linked-account',
    ].map(make),
  );
  await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
  const createOrg = (
    id: string,
    type: 'ASSOCIATION' | 'PARTNER_COOPERATIVE' | 'BUYER_BUSINESS' | 'INTERNAL',
  ) =>
    db.organization.create({
      data: {
        id,
        name: `Synthetic ${id}`,
        slug: id,
        type,
        approvalStatus: 'APPROVED',
        region: 'Tunis',
        description: 'Revised foundation synthetic test organization',
        contactEmail: 'synthetic@example.com',
        representativeName: 'Synthetic reviewer',
        createdByUserId: admin.me.user.id,
      },
    });
  const [orgA, orgB, business, internal] = await Promise.all([
    createOrg('revised-association-a', 'ASSOCIATION'),
    createOrg('revised-cooperative-b', 'PARTNER_COOPERATIVE'),
    createOrg('revised-business', 'BUYER_BUSINESS'),
    createOrg('revised-internal', 'INTERNAL'),
  ]);
  const orgC = await createOrg('revised-association-c', 'ASSOCIATION');
  const member = (
    who: Identity,
    organizationId: string,
    role: 'ASSOCIATION_COORDINATOR' | 'BUYER_REPRESENTATIVE' | 'NASJ_OPERATOR',
    manager = false,
  ) =>
    db.organizationMember.create({
      data: {
        userId: who.me.user.id,
        organizationId,
        isManager: manager,
        roles: { create: { role, assignedByUserId: admin.me.user.id } },
      },
    });
  const [ma, mb, , md, _mp, mo] = await Promise.all([
    member(a, orgA.id, 'ASSOCIATION_COORDINATOR'),
    member(b, orgA.id, 'ASSOCIATION_COORDINATOR'),
    member(c, orgA.id, 'ASSOCIATION_COORDINATOR'),
    member(d, orgB.id, 'ASSOCIATION_COORDINATOR'),
    member(buyer, business.id, 'BUYER_REPRESENTATIVE', true),
    member(operator, internal.id, 'NASJ_OPERATOR'),
  ]);
  const call = (who: Identity, path: string, body: unknown, method = 'POST') =>
    mutate(who.client, `/api/v1/${path}`, method, body);
  async function ok(who: Identity, path: string, body: unknown, method = 'POST') {
    const r = await call(who, path, body, method);
    assert.ok([200, 201].includes(r.status), JSON.stringify(r));
    return r.body as Record<string, unknown>;
  }
  const reason = 'Synthetic independently reviewed authorization decision';
  let policyId = '',
    artisanId = '',
    authorizationId = '',
    participationId = '';
  const evidence = () => ({
    policyId,
    purpose: 'PARTICIPATION',
    method: 'WITNESSED_VERBAL',
    occurredAt: new Date(Date.now() - 60000).toISOString(),
    language: 'fr',
    witnessReference: 'independent-witness-synthetic',
    evidenceReference: 'synthetic-authorization-reference',
  });
  const artisan = () => ({
    displayName: 'Synthetic no-account participant',
    region: 'Tunis',
    preferredLanguage: 'fr',
    contactPhone: '+21600000000',
    experienceDescription: 'Synthetic weaving experience',
    equipment: ['Loom'],
    availabilityStatus: 'AVAILABLE',
    skills: ['weaving'],
    authorization: evidence(),
  });
  await check(
    'revised roles resolve four personas, three coordinators share one association, unassigned access is denied',
    async () => {
      assert.equal(
        await db.organizationMember.count({
          where: { organizationId: orgA.id, isCoordinator: true, status: 'ACTIVE' },
        }),
        3,
      );
      for (const [who, persona, path] of [
        [admin, 'PLATFORM_ADMIN', '/nasj/organizations'],
        [a, 'ASSOCIATION_COORDINATOR', '/association/requests'],
        [buyer, 'BUYER_REPRESENTATIVE', '/catalog'],
        [operator, 'NASJ_OPERATOR', '/nasj/organizations'],
      ] as const) {
        const r = await who.client.request('/api/v1/me/context');
        assert.equal(r.status, 200);
        assert.ok((r.body as { personas: string[] }).personas.includes(persona));
        assert.equal((r.body as { landingPath: string }).landingPath, path);
      }
      assert.equal((await unassigned.client.request('/api/v1/associations/me')).status, 403);
      assert.equal((await buyer.client.request('/api/v1/operator/dashboard')).status, 403);
      assert.equal((await admin.client.request('/api/v1/operator/dashboard')).status, 403);
    },
  );
  await check(
    'four-role API matrix separates platform governance, operator coordination and association registry',
    async () => {
      for (const [who, allowed] of [
        [admin, [200, 403, 403]],
        [operator, [403, 200, 403]],
        [a, [403, 403, 200]],
        [buyer, [403, 403, 403]],
      ] as const) {
        for (const [index, path] of [
          '/admin/users',
          '/operator/dashboard',
          '/associations/me/artisans',
        ].entries()) {
          const reply = await who.client.request(`/api/v1${path}`);
          assert.equal(reply.status, allowed[index], path);
        }
      }
    },
  );
  await check(
    'assisted policies require administrator review and independent witness evidence',
    async () => {
      assert.equal(
        (
          await call(a, 'admin/authorization-policies', {
            version: 'synthetic-v1',
            methods: ['WITNESSED_VERBAL'],
            reviewReference: reason,
          })
        ).status,
        403,
      );
      policyId = (
        await ok(admin, 'admin/authorization-policies', {
          version: 'synthetic-v1',
          methods: ['WITNESSED_VERBAL', 'SIGNED'],
          reviewReference: reason,
        })
      ).id as string;
      assert.equal(
        (
          await call(a, 'associations/me/artisans', {
            ...artisan(),
            authorization: { ...evidence(), witnessReference: undefined },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call(a, 'associations/me/artisans', {
            ...artisan(),
            authorization: { ...evidence(), witnessReference: a.me.user.id },
          })
        ).status,
        400,
      );
    },
  );
  await check(
    'second active coordinator affiliation is rejected through concurrent database writes and invitation acceptance',
    async () => {
      const races = await Promise.allSettled([
        member(a, orgB.id, 'ASSOCIATION_COORDINATOR'),
        member(a, orgB.id, 'ASSOCIATION_COORDINATOR'),
      ]);
      assert.ok(races.every((r) => r.status === 'rejected'));
      assert.equal(
        await db.organizationMember.count({
          where: { userId: a.me.user.id, isCoordinator: true, status: 'ACTIVE' },
        }),
        1,
      );
      const concurrentActor = await register(
        'revised-concurrent-roles@example.com',
        'Synthetic concurrent role recipient',
      );
      const membershipA = await db.organizationMember.create({
        data: { userId: concurrentActor.me.user.id, organizationId: orgA.id },
      });
      const membershipB = await db.organizationMember.create({
        data: { userId: concurrentActor.me.user.id, organizationId: orgB.id },
      });
      const roleChanges = await Promise.all([
        call(
          admin,
          `organizations/${orgA.id}/members/${membershipA.id}/roles`,
          { roles: ['ASSOCIATION_COORDINATOR'], reason },
          'PUT',
        ),
        call(
          admin,
          `organizations/${orgB.id}/members/${membershipB.id}/roles`,
          { roles: ['ASSOCIATION_COORDINATOR'], reason },
          'PUT',
        ),
      ]);
      assert.equal(roleChanges.filter((r) => r.status === 200).length, 1);
      assert.equal(roleChanges.filter((r) => r.status === 409).length, 1);
      assert.equal(
        await db.organizationMember.count({
          where: { userId: concurrentActor.me.user.id, isCoordinator: true, status: 'ACTIVE' },
        }),
        1,
      );
      const active = await db.organizationMember.findFirstOrThrow({
        where: { userId: concurrentActor.me.user.id, isCoordinator: true, status: 'ACTIVE' },
      });
      const other = active.organizationId === orgA.id ? membershipB : membershipA;
      await ok(
        admin,
        `admin/coordinators/${concurrentActor.me.user.id}/status`,
        { status: 'SUSPENDED', organizationId: active.organizationId, reason },
        'PATCH',
      );
      await ok(
        admin,
        `organizations/${other.organizationId}/members/${other.id}/roles`,
        { roles: ['ASSOCIATION_COORDINATOR'], reason },
        'PUT',
      );
      await ok(
        admin,
        `admin/coordinators/${concurrentActor.me.user.id}/status`,
        { status: 'SUSPENDED', organizationId: other.organizationId, reason },
        'PATCH',
      );
      assert.equal(
        (
          await call(
            admin,
            `admin/coordinators/${concurrentActor.me.user.id}/status`,
            { status: 'ACTIVE', reason },
            'PATCH',
          )
        ).status,
        409,
      );
      await ok(
        admin,
        `admin/coordinators/${concurrentActor.me.user.id}/status`,
        { status: 'ACTIVE', organizationId: active.organizationId, reason },
        'PATCH',
      );
      assert.equal(
        (
          await call(
            admin,
            `admin/coordinators/${concurrentActor.me.user.id}/status`,
            { status: 'ACTIVE', organizationId: other.organizationId, reason },
            'PATCH',
          )
        ).status,
        409,
      );
      await ok(admin, 'admin/personnel/invite', {
        organizationId: orgB.id,
        email: 'revised-coordinator-a@example.com',
        persona: 'ASSOCIATION_COORDINATOR',
        reason,
      });
      const token = await mail.token('revised-coordinator-a@example.com', '/invitations/accept');
      assert.equal((await call(a, 'invitations/accept', { token })).status, 409);
      assert.equal(
        await db.invitation.count({
          where: { email: 'revised-coordinator-a@example.com', status: 'PENDING' },
        }),
        1,
      );
    },
  );
  await check(
    'privileged invitations recheck administrator authority even when the former administrator remains an organization manager',
    async () => {
      const inviter = await register(
        'revised-former-admin@example.com',
        'Synthetic former administrator',
      );
      await db.user.update({ where: { id: inviter.me.user.id }, data: { role: 'ADMIN' } });
      await db.organizationMember.create({
        data: { userId: inviter.me.user.id, organizationId: orgB.id, isManager: true },
      });
      await ok(inviter, 'admin/personnel/invite', {
        organizationId: orgB.id,
        email: 'revised-unassigned@example.com',
        persona: 'ASSOCIATION_COORDINATOR',
        reason,
      });
      const token = await mail.token('revised-unassigned@example.com', '/invitations/accept');
      await db.user.update({ where: { id: inviter.me.user.id }, data: { role: 'USER' } });
      assert.equal((await call(unassigned, 'invitations/accept', { token })).status, 403);
      assert.equal(
        await db.organizationMember.count({ where: { userId: unassigned.me.user.id } }),
        0,
      );
    },
  );
  await check(
    'coordinator creates an authorized artisan without an account; scope mass assignment and duplicate creation are rejected',
    async () => {
      const users = await db.user.count();
      assert.equal(
        (await call(a, 'associations/me/artisans', { ...artisan(), organizationId: orgB.id }))
          .status,
        400,
      );
      assert.equal(
        (
          await call(a, 'associations/me/artisans', {
            ...artisan(),
            authorization: { ...evidence(), checkbox: true },
          })
        ).status,
        400,
      );
      artisanId = (await ok(a, 'associations/me/artisans', artisan())).id as string;
      assert.equal(await db.user.count(), users);
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: artisanId } })).userId,
        null,
      );
      assert.equal(
        (
          await db.artisanManagement.findFirstOrThrow({
            where: { artisanProfileId: artisanId, endedAt: null },
          })
        ).organizationId,
        orgA.id,
      );
      participationId = (
        await db.onboardingAuthorization.findFirstOrThrow({
          where: { artisanProfileId: artisanId },
        })
      ).id;
      const concurrentBody = { ...artisan(), displayName: 'Synthetic concurrent participant' };
      const creates = await Promise.all([
        call(a, 'associations/me/artisans', concurrentBody),
        call(a, 'associations/me/artisans', concurrentBody),
      ]);
      assert.equal(creates.filter((r) => r.status === 201).length, 1);
      assert.equal(creates.filter((r) => r.status === 409).length, 1);
      const duplicates = await Promise.all([
        call(a, 'associations/me/artisans', artisan()),
        call(a, 'associations/me/artisans', artisan()),
      ]);
      assert.ok(duplicates.every((r) => r.status === 409));
    },
  );
  await check(
    'unassigned same-association coordinators, other associations, buyers and administrators cannot read private artisan fields',
    async () => {
      for (const who of [b, d, buyer, admin, operator]) {
        const r = await who.client.request(`/api/v1/associations/me/artisans/${artisanId}`);
        assert.ok([403, 404].includes(r.status));
        assert.ok(!JSON.stringify(r.body).includes('+21600000000'));
      }
      assert.equal(
        (await call(d, `associations/me/artisans/${artisanId}`, { ...artisan(), reason }, 'PATCH'))
          .status,
        400,
      );
      assert.equal(
        (
          await call(d, `associations/me/artisans/${artisanId}/capacity`, {
            craftSkillId: 'weaving',
            quantity: '10',
            unitType: 'PIECES',
            effectiveFrom: '2027-01-01T00:00:00Z',
            effectiveTo: '2027-01-08T00:00:00Z',
            authorizationId: participationId,
          })
        ).status,
        404,
      );
    },
  );
  const capacity = () => ({
    craftSkillId: 'weaving',
    quantity: '10',
    unitType: 'PIECES',
    effectiveFrom: '2027-01-01T00:00:00Z',
    effectiveTo: '2027-01-08T00:00:00Z',
    authorizationId,
  });
  let offerId = '';
  await check(
    'assisted capacity requires worker authorization, rejects wearable inputs and preserves accepted work and declaration history',
    async () => {
      assert.equal(
        (
          await call(a, `associations/me/artisans/${artisanId}/capacity`, {
            ...capacity(),
            authorizationId: 'wrong',
          })
        ).status,
        403,
      );
      for (const field of ['wearable', 'sensorData', 'strainScore', 'healthStatus'])
        assert.equal(
          (
            await call(a, `associations/me/artisans/${artisanId}/capacity`, {
              ...capacity(),
              [field]: 1,
            })
          ).status,
          400,
        );
      authorizationId = (
        await ok(a, `associations/me/artisans/${artisanId}/authorization`, {
          ...evidence(),
          purpose: 'CAPACITY',
        })
      ).id as string;
      const first = await ok(a, `associations/me/artisans/${artisanId}/capacity`, capacity());
      const rfq = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: business.id,
          operatorOrganizationId: internal.id,
          craftSkillId: 'weaving',
          title: 'Synthetic accepted obligation',
          specification: 'Fictional test only',
          designRequirements: 'Fictional test only',
          quantity: 2,
          deliveryAt: new Date('2027-01-05'),
          deliveryLocation: 'Synthetic site',
          status: 'ACCEPTED',
          order: { create: {} },
        },
        include: { order: true },
      });
      const offer = await db.commercialOffer.create({
        data: {
          orderId: rfq.order!.id,
          artisanProfileId: artisanId,
          capacityDeclarationId: first.id as string,
          quantity: 2,
          unitPayMillimes: 1000n,
          estimatedHours: '2',
          expiresAt: new Date('2027-01-03'),
          materials: 'Synthetic materials',
          reworkTerms: 'Synthetic agreed terms',
          paymentConditions: 'Synthetic only',
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          batch: { create: { orderId: rfq.order!.id, artisanProfileId: artisanId } },
        },
      });
      offerId = offer.id;
      await ok(a, `associations/me/artisans/${artisanId}/capacity`, {
        ...capacity(),
        quantity: '3',
      });
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: artisanId } }),
        2,
      );
      const history = await a.client.request(
        `/api/v1/associations/me/artisans/${artisanId}/capacity?pageSize=1&page=2`,
      );
      assert.equal(history.status, 200);
      assert.equal((history.body as { items: unknown[] }).items.length, 1);
      assert.equal((history.body as { total: number }).total, 2);
      assert.equal(
        (await db.commercialOffer.findUniqueOrThrow({ where: { id: offer.id } })).status,
        'ACCEPTED',
      );
      assert.equal(await db.commercialBatch.count({ where: { offerId: offer.id } }), 1);
    },
  );
  await check(
    'operator account assignments scope duplicate review without contact or financial disclosure',
    async () => {
      assert.equal(
        (await operator.client.request(`/api/v1/operator/organizations/${orgA.id}/participants`))
          .status,
        403,
      );
      await ok(admin, 'admin/operator-assignments', {
        operatorId: operator.me.user.id,
        organizationId: orgA.id,
        enabled: true,
        reason,
      });
      const listing = await operator.client.request(
        `/api/v1/operator/organizations/${orgA.id}/participants`,
      );
      assert.equal(listing.status, 200);
      assert.ok(!JSON.stringify(listing.body).includes('contactPhone'));
      assert.ok(!JSON.stringify(listing.body).includes('payments'));
      const activity = await operator.client.request('/api/v1/operator/activity?pageSize=100');
      assert.equal(activity.status, 200);
      const events = (activity.body as { items: { organizationId: string }[] }).items;
      assert.ok(events.length > 0);
      assert.ok(events.every((e) => e.organizationId === orgA.id));
      assert.ok(!JSON.stringify(activity.body).includes('contactPhone'));
      assert.ok(!JSON.stringify(activity.body).includes('before'));
      assert.ok(!JSON.stringify(activity.body).includes('after'));
      assert.equal((await buyer.client.request('/api/v1/operator/activity')).status, 403);
      const ticket = await ok(operator, `operator/organizations/${orgA.id}/duplicate-reviews`, {
        artisanId,
        reason,
      });
      assert.equal(
        (
          await call(a, 'associations/me/artisans', {
            ...artisan(),
            duplicateReviewId: 'forged-review',
          })
        ).status,
        409,
      );
      await ok(a, 'associations/me/artisans', { ...artisan(), duplicateReviewId: ticket.reviewId });
    },
  );
  await check(
    'revoked participation and suspended organizations or affiliations immediately deny assisted activity',
    async () => {
      await ok(
        a,
        `associations/me/artisans/${artisanId}/authorization/${participationId}/withdraw`,
        { reason },
      );
      assert.equal(
        (await call(a, `associations/me/artisans/${artisanId}/capacity`, capacity())).status,
        403,
      );
      assert.equal(
        (
          (await a.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).body as {
            profile: { contactPhone: string | null };
          }
        ).profile.contactPhone,
        null,
      );
      participationId = (
        await ok(a, `associations/me/artisans/${artisanId}/authorization`, evidence())
      ).id as string;
      await ok(
        admin,
        `admin/coordinators/${a.me.user.id}/status`,
        { status: 'SUSPENDED', reason },
        'PATCH',
      );
      assert.equal((await a.client.request('/api/v1/associations/me/artisans')).status, 403);
      await ok(
        admin,
        `admin/coordinators/${a.me.user.id}/status`,
        { status: 'ACTIVE', reason },
        'PATCH',
      );
      await db.organization.update({
        where: { id: orgA.id },
        data: { approvalStatus: 'SUSPENDED' },
      });
      assert.equal(
        (await a.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        403,
      );
      await db.organization.update({
        where: { id: orgA.id },
        data: { approvalStatus: 'APPROVED' },
      });
    },
  );
  await check(
    'concurrent coordinator reassignment leaves one responsible person and blocks the previous coordinator',
    async () => {
      const responses = await Promise.all([
        call(admin, `admin/artisans/${artisanId}/assignment`, {
          coordinatorId: b.me.user.id,
          reason,
        }),
        call(admin, `admin/artisans/${artisanId}/assignment`, {
          coordinatorId: c.me.user.id,
          reason,
        }),
      ]);
      assert.ok(responses.every((r) => r.status === 201));
      assert.equal(
        await db.artisanAssignment.count({ where: { artisanProfileId: artisanId, endedAt: null } }),
        1,
      );
      assert.equal(
        (await a.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        404,
      );
      const current = await db.artisanAssignment.findFirstOrThrow({
        where: { artisanProfileId: artisanId, endedAt: null },
      });
      if (current.coordinatorId !== b.me.user.id) {
        await ok(admin, `admin/artisans/${artisanId}/assignment`, {
          coordinatorId: b.me.user.id,
          reason,
        });
      }
      assert.equal(
        (await b.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        200,
      );
    },
  );
  await check(
    'reviewed optional account linking preserves profile, authorization, capacity and accepted production references',
    async () => {
      const evidenceCount = await db.onboardingAuthorization.count({
        where: { artisanProfileId: artisanId },
      });
      assert.equal(
        (
          await call(b, `admin/artisans/${artisanId}/link-account`, {
            userId: linked.me.user.id,
            verificationReference: reason,
            reason,
          })
        ).status,
        403,
      );
      await ok(admin, `admin/artisans/${artisanId}/link-account`, {
        userId: linked.me.user.id,
        verificationReference: reason,
        reason,
      });
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: artisanId } })).userId,
        linked.me.user.id,
      );
      assert.equal(await db.artisanProfile.count({ where: { userId: linked.me.user.id } }), 1);
      assert.equal(
        await db.onboardingAuthorization.count({ where: { artisanProfileId: artisanId } }),
        evidenceCount,
      );
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: artisanId } }),
        2,
      );
      assert.equal(
        (await db.commercialOffer.findUniqueOrThrow({ where: { id: offerId } })).artisanProfileId,
        artisanId,
      );
    },
  );
  await check(
    'coordinator and artisan transfers preserve affiliation history and remove previous association access',
    async () => {
      const responses = await Promise.all([
        call(admin, `admin/coordinators/${a.me.user.id}/transfer`, {
          organizationId: orgB.id,
          reason,
        }),
        call(admin, `admin/coordinators/${a.me.user.id}/transfer`, {
          organizationId: orgC.id,
          reason,
        }),
      ]);
      assert.ok(responses.every((r) => r.status === 201));
      assert.equal(
        await db.organizationMember.count({
          where: { userId: a.me.user.id, isCoordinator: true, status: 'ACTIVE' },
        }),
        1,
      );
      assert.ok(
        (await db.auditEvent.count({
          where: { action: 'coordinator.affiliation.transfer', actorId: admin.me.user.id },
        })) >= 2,
      );
      await ok(admin, `admin/artisans/${artisanId}/transfer`, {
        organizationId: orgB.id,
        coordinatorId: d.me.user.id,
        authorization: evidence(),
        reason,
      });
      assert.equal(
        (await b.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        404,
      );
      assert.equal(
        (await d.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        200,
      );
      assert.equal(
        await db.artisanManagement.count({ where: { artisanProfileId: artisanId, endedAt: null } }),
        1,
      );
      assert.equal(await db.artisanManagement.count({ where: { artisanProfileId: artisanId } }), 2);
    },
  );
  await check(
    'buyer representatives share only their own company; approval requires a separately audited permission',
    async () => {
      assert.ok(
        !(await buyer.client.request('/api/v1/me/context')).body ||
          !JSON.stringify((await buyer.client.request('/api/v1/me/context')).body).includes(
            'operator.payout.initiate',
          ),
      );
      await ok(buyer, `organizations/${business.id}/invitations`, {
        email: 'revised-representative@example.com',
        roles: ['BUYER_REPRESENTATIVE'],
        isManager: false,
      });
      const token = await mail.token('revised-representative@example.com', '/invitations/accept');
      const acceptance = await Promise.all([
        call(rep, 'invitations/accept', { token }),
        call(rep, 'invitations/accept', { token }),
      ]);
      assert.equal(acceptance.filter((r) => r.status === 200).length, 1);
      assert.equal(await hasPrivilegedAccess(db, rep.me.user.id), false);
      assert.equal(await hasPrivilegedAccess(db, operator.me.user.id), true);
      const membership = await db.organizationMember.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: business.id, userId: rep.me.user.id } },
      });
      assert.equal((await rep.client.request(`/api/v1/organizations/${business.id}`)).status, 200);
      assert.equal((await rep.client.request(`/api/v1/organizations/${orgA.id}`)).status, 403);
      assert.equal(
        await db.membershipPermission.count({ where: { membershipId: membership.id } }),
        0,
      );
      await ok(
        buyer,
        `organizations/${business.id}/members/${membership.id}/permissions`,
        { permission: 'buyer.quotation.approve', enabled: true, reason },
        'PUT',
      );
      await ok(
        buyer,
        `organizations/${business.id}/members/${membership.id}/permissions`,
        { permission: 'buyer.rfq.create', enabled: false, reason },
        'PUT',
      );
      const permissionAudit = await db.auditEvent.findFirstOrThrow({
        where: { targetId: membership.id, action: 'membership.permission.revoke' },
        orderBy: { timestamp: 'desc' },
      });
      assert.deepEqual(permissionAudit.after, { permission: 'buyer.rfq.create', enabled: false });
      assert.ok(
        !JSON.stringify((await rep.client.request('/api/v1/me/context')).body).includes(
          'buyer.rfq.create',
        ),
      );
      assert.equal(
        (
          await call(rep, 'commerce/rfqs', {
            buyerOrganizationId: business.id,
            operatorOrganizationId: internal.id,
            craftSkillId: 'weaving',
            title: 'Synthetic denied purchasing',
            provenance: 'SYNTHETIC',
            specification: 'Synthetic specification',
            designRequirements: 'Synthetic requirements',
            quantity: 2,
            deliveryAt: '2027-01-05T00:00:00Z',
            deliveryLocation: 'Synthetic location',
          })
        ).status,
        403,
      );
      await ok(
        buyer,
        `organizations/${business.id}/members/${membership.id}/permissions`,
        { permission: 'buyer.rfq.create', enabled: true, reason },
        'PUT',
      );
      assert.ok(
        JSON.stringify((await rep.client.request('/api/v1/me/context')).body).includes(
          'buyer.quotation.approve',
        ),
      );
      assert.equal(
        (
          await call(
            buyer,
            `organizations/${business.id}/members/${membership.id}/permissions`,
            { permission: 'operator.payout.initiate', enabled: true, reason },
            'PUT',
          )
        ).status,
        403,
      );
    },
  );
  await check(
    'sensitive payout grants require separate people; administrator governance never enables real payouts',
    async () => {
      await ok(
        admin,
        `organizations/${internal.id}/members/${mo.id}/permissions`,
        { permission: 'operator.payout.initiate', enabled: true, reason },
        'PUT',
      );
      assert.equal(
        (
          await call(
            admin,
            `organizations/${internal.id}/members/${mo.id}/permissions`,
            { permission: 'operator.payout.approve', enabled: true, reason },
            'PUT',
          )
        ).status,
        409,
      );
      assert.equal((await admin.client.request('/api/v1/operator/dashboard')).status, 403);
      assert.equal((await admin.client.request('/api/v1/admin/access-report')).status, 200);
      assert.equal(
        (
          (await operator.client.request('/api/v1/me/context')).body as {
            realPayoutsEnabled: boolean;
          }
        ).realPayoutsEnabled,
        false,
      );
    },
  );
  await check(
    'coordinators cannot self-assign affiliation, approve organizations, invite privileged personnel or read audit governance',
    async () => {
      assert.equal(
        (
          await call(
            a,
            `organizations/${orgA.id}/members/${ma.id}/roles`,
            { roles: ['NASJ_OPERATOR'], reason },
            'PUT',
          )
        ).status,
        403,
      );
      assert.equal(
        (await call(a, `admin/organizations/${orgA.id}/approve`, { reason })).status,
        403,
      );
      assert.equal(
        (
          await call(a, 'admin/personnel/invite', {
            organizationId: internal.id,
            email: 'forged@example.com',
            persona: 'NASJ_OPERATOR',
            reason,
          })
        ).status,
        403,
      );
      assert.equal((await a.client.request('/api/v1/admin/access-report')).status, 403);
      assert.equal(
        (
          await call(
            b,
            `organizations/${orgA.id}/members/${mb.id}`,
            { organizationId: orgB.id, status: 'ACTIVE', reason },
            'PATCH',
          )
        ).status,
        400,
      );
      assert.equal((await a.client.request('/api/v1/wearable/telemetry')).status, 404);
    },
  );
  await check(
    'revoking coordinator access immediately removes assigned registry access while preserving all historical records',
    async () => {
      await ok(
        admin,
        `admin/coordinators/${d.me.user.id}/status`,
        { status: 'REVOKED', reason },
        'PATCH',
      );
      assert.equal(
        (await d.client.request(`/api/v1/associations/me/artisans/${artisanId}`)).status,
        403,
      );
      assert.equal(await db.artisanProfile.count({ where: { id: artisanId } }), 1);
      assert.ok((await db.auditEvent.count({ where: { organizationId: orgB.id } })) > 0);
      assert.equal(
        (await db.commercialOffer.findUniqueOrThrow({ where: { id: offerId } })).status,
        'ACCEPTED',
      );
      assert.equal(
        (await db.organizationMember.findUniqueOrThrow({ where: { id: md.id } })).status,
        'REVOKED',
      );
    },
  );
  await check(
    'participants without accounts can independently dispute records without an identity oracle or coordinator disclosure',
    async () => {
      const report = await unassigned.client.request('/api/v1/participant-concerns', 'POST', {
        subjectReference: artisanId,
        concernType: 'OFFER_DECISION',
        description: 'Synthetic incorrectly recorded decision requires independent review.',
      });
      assert.equal(report.status, 202);
      assert.equal((await a.client.request('/api/v1/admin/participant-concerns')).status, 403);
      const concern = await db.participantConcern.findFirstOrThrow({
        where: { subjectReference: artisanId },
      });
      await db.user.update({ where: { id: a.me.user.id }, data: { role: 'ADMIN' } });
      assert.equal(
        (
          await call(
            a,
            `admin/participant-concerns/${concern.id}`,
            { status: 'RESOLVED', resolution: reason },
            'PATCH',
          )
        ).status,
        403,
      );
      await db.user.update({ where: { id: a.me.user.id }, data: { role: 'USER' } });
      await ok(
        admin,
        `admin/participant-concerns/${concern.id}`,
        { status: 'RESOLVED', resolution: reason },
        'PATCH',
      );
      assert.equal(
        (await db.participantConcern.findUniqueOrThrow({ where: { id: concern.id } })).status,
        'RESOLVED',
      );
    },
  );
}
