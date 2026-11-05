import assert from 'node:assert/strict';
import type { DirectoryDetail, DirectoryPage } from '@nasj/contracts';
import type { PrismaService } from '../src/database/prisma.service.js';
type Result = { status: number; body: unknown };
type Identity = {
  client: { request(path: string, method?: string, body?: unknown): Promise<Result> };
  me: { user: { id: string } };
};
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
const period = {
  effectiveFrom: new Date('2027-05-03T00:00:00+01:00'),
  effectiveTo: new Date('2027-05-10T00:00:00+01:00'),
};
export async function runDirectoryScenarios({ db, register, check }: Harness) {
  const [buyer, operator, sfaxCoordinator, kairouanCoordinator, outsider, admin] =
    await Promise.all(
      ['buyer', 'operator', 'sfax', 'kairouan', 'outsider', 'admin'].map((role) =>
        register(`directory-${role}@example.com`, `Synthetic directory ${role}`),
      ),
    );
  await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
  const organization = async (
    name: string,
    region: string,
    type: 'ASSOCIATION' | 'BUYER_BUSINESS' | 'INTERNAL',
    userId: string,
    role: 'ASSOCIATION_COORDINATOR' | 'BUYER' | 'PRODUCTION_MANAGER',
  ) =>
    db.organization.create({
      data: {
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        type,
        approvalStatus: 'APPROVED',
        region,
        description: 'Synthetic directory fixture',
        contactEmail: 'directory@example.com',
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        members: {
          create: {
            userId,
            roles: { create: { role, assignedByUserId: userId } },
          },
        },
      },
    });
  const [sfax, kairouan, buyerOrg, operatorOrg] = await Promise.all([
    organization(
      'Directory group Sfax',
      'Sfax',
      'ASSOCIATION',
      sfaxCoordinator.me.user.id,
      'ASSOCIATION_COORDINATOR',
    ),
    organization(
      'Directory group Kairouan',
      'Kairouan',
      'ASSOCIATION',
      kairouanCoordinator.me.user.id,
      'ASSOCIATION_COORDINATOR',
    ),
    organization('Directory buyer', 'Tunis', 'BUYER_BUSINESS', buyer.me.user.id, 'BUYER'),
    organization(
      'Directory operator',
      'Tunis',
      'INTERNAL',
      operator.me.user.id,
      'PRODUCTION_MANAGER',
    ),
  ]);
  const policy = await db.authorizationPolicy.create({
    data: {
      version: 'directory-test-v1',
      methods: ['SIGNED'],
      reviewReference: 'Synthetic reviewed directory method',
      reviewedById: admin.me.user.id,
    },
  });
  async function participant(
    org: { id: string },
    coordinatorId: string,
    name: string,
    quantity: number,
    unitType = 'PIECES',
  ) {
    const profile = await db.artisanProfile.create({
      data: {
        displayName: name,
        region: 'Synthetic quarter',
        contactPhone: '+21699000111',
        userId: null,
        participantStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    await db.artisanManagement.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: org.id,
        recordedById: coordinatorId,
        reason: 'Synthetic directory management',
      },
    });
    await db.artisanAssignment.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: org.id,
        coordinatorId,
        assignedById: coordinatorId,
        reason: 'Synthetic directory assignment',
      },
    });
    await db.onboardingAuthorization.create({
      data: {
        artisanProfileId: profile.id,
        policyId: policy.id,
        purpose: 'PARTICIPATION',
        method: 'SIGNED',
        occurredAt: new Date(),
        language: 'fr',
        evidenceReference: 'Synthetic participation confirmation',
        recordedById: coordinatorId,
      },
    });
    const declaration = await db.capacityDeclaration.create({
      data: {
        artisanProfileId: profile.id,
        craftSkillId: 'weaving',
        unitType,
        quantity,
        ...period,
        declaredByUserId: coordinatorId,
      },
    });
    return { profile, declaration };
  }
  const alpha = await participant(
    sfax,
    sfaxCoordinator.me.user.id,
    'Hidden participant alpha',
    100,
  );
  const beta = await participant(sfax, sfaxCoordinator.me.user.id, 'Hidden participant beta', 80);
  const gamma = await participant(
    sfax,
    sfaxCoordinator.me.user.id,
    'Hidden participant gamma',
    120,
  );
  await participant(kairouan, kairouanCoordinator.me.user.id, 'Hidden participant solo', 40);
  await db.capacityDeclaration.create({
    data: {
      artisanProfileId: alpha.profile.id,
      craftSkillId: 'weaving',
      unitType: 'HOURS',
      quantity: 10,
      ...period,
      declaredByUserId: sfaxCoordinator.me.user.id,
    },
  });
  async function offer(
    profileId: string,
    declarationId: string,
    quantity: number,
    status: 'OFFERED' | 'ACCEPTED',
    completed = false,
  ) {
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: buyerOrg.id,
        operatorOrganizationId: operatorOrg.id,
        craftSkillId: 'weaving',
        title: 'Synthetic directory obligation',
        specification: 'Synthetic only',
        designRequirements: 'Synthetic only',
        quantity: 400,
        deliveryAt: new Date('2027-05-06T12:00:00+01:00'),
        deliveryLocation: 'Synthetic site',
        status: 'ACCEPTED',
        order: { create: { status: 'PLANNING' } },
      },
      include: { order: true },
    });
    return db.commercialOffer.create({
      data: {
        orderId: rfq.order!.id,
        artisanProfileId: profileId,
        capacityDeclarationId: declarationId,
        quantity,
        unitPayMillimes: 1000n,
        estimatedHours: 'Synthetic range',
        expiresAt: new Date('2027-05-05T00:00:00Z'),
        materials: 'Synthetic only',
        reworkTerms: 'Synthetic only',
        paymentConditions: 'Simulated only',
        status,
        ...(status === 'ACCEPTED'
          ? {
              acceptedAt: new Date(),
              batch: {
                create: {
                  orderId: rfq.order!.id,
                  artisanProfileId: profileId,
                  status: completed ? 'COMPLETED' : 'ACCEPTED',
                  produced: completed ? quantity : 0,
                },
              },
            }
          : {}),
      },
      include: { order: true },
    });
  }
  const alphaReserved = await offer(alpha.profile.id, alpha.declaration.id, 20, 'OFFERED');
  await offer(alpha.profile.id, alpha.declaration.id, 30, 'ACCEPTED', true);
  await offer(beta.profile.id, beta.declaration.id, 10, 'OFFERED');
  await offer(beta.profile.id, beta.declaration.id, 20, 'ACCEPTED');
  const gammaReserved = await offer(gamma.profile.id, gamma.declaration.id, 30, 'OFFERED');
  await offer(gamma.profile.id, gamma.declaration.id, 40, 'ACCEPTED');
  const path = '/api/v1/directory/groups?craft=weaving&region=Sfax&unit=PIECES';
  async function groups(who: Identity, suffix = path) {
    const result = await who.client.request(suffix);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body as DirectoryPage;
  }
  await check(
    'directory aggregates compatible capacity and withholds small groups and private fields',
    async () => {
      const page = await groups(buyer);
      assert.equal(page.reservation, false);
      assert.equal(page.provenance, 'SYNTHETIC_DECLARED_CAPACITY');
      assert.equal(page.items.length, 1);
      const group = page.items[0];
      assert.equal(group.declared, '300.00');
      assert.equal(group.reserved, '60.00');
      assert.equal(group.committed, '90.00');
      assert.equal(group.remaining, '150.00');
      assert.equal(group.availabilityKnown, true);
      assert.equal(group.region, 'Sfax');
      assert.equal(group.unitType, 'PIECES');
      const body = JSON.stringify(page);
      for (const secret of ['Hidden participant', '+21699000111', 'unitPay', '40.00'])
        assert.equal(body.includes(secret), false, secret);
      const category = await groups(
        buyer,
        '/api/v1/directory/groups?craft=TEXTILE&region=sfax&unit=PIECES',
      );
      assert.equal(category.items[0].remaining, '150.00');
      const minimum = await groups(buyer, '/api/v1/directory/groups?unit=PIECES&minRemaining=149');
      assert.ok(minimum.items.some((item) => item.remaining === '150.00'));
      assert.equal(
        (await groups(buyer, '/api/v1/directory/groups?unit=PIECES&minRemaining=151')).items.length,
        0,
      );
      const known = await groups(buyer, '/api/v1/directory/availability?unit=PIECES');
      assert.ok(known.items.every((item) => item.availabilityKnown));
      assert.equal(
        known.items.some((item) => item.unitType === 'HOURS'),
        false,
      );
      const hours = await groups(buyer, '/api/v1/directory/groups?region=Sfax&unit=HOURS');
      assert.equal(hours.items[0].availabilityKnown, false);
      assert.equal(hours.items[0].remaining, null);
      assert.ok(hours.items[0].constraints.includes('INCOMPLETE_AGGREGATE'));
      assert.equal(hours.items[0].constraints.includes('INCOMPATIBLE_COMMITMENT_UNIT'), true);
      const first = await groups(buyer, '/api/v1/directory/groups?page=1&pageSize=1');
      const second = await groups(buyer, '/api/v1/directory/groups?page=2&pageSize=1');
      const repeated = await groups(buyer, '/api/v1/directory/groups?page=1&pageSize=1');
      assert.equal(first.total >= 2, true);
      assert.notEqual(first.items[0].id, second.items[0].id);
      assert.equal(first.items[0].id, repeated.items[0].id);
      const home = await sfaxCoordinator.client.request(`/api/v1/directory/groups/${group.id}`);
      assert.equal(home.status, 200);
      const detail = home.body as DirectoryDetail;
      assert.ok(
        detail.contributors?.some((person) => person.displayName === 'Hidden participant alpha'),
      );
      assert.equal(
        detail.contributors?.some((person) => person.committed === '30.00'),
        true,
      );
      const commercial = await buyer.client.request(`/api/v1/directory/groups/${group.id}`);
      assert.equal((commercial.body as DirectoryDetail).contributors, null);
      const suppressed = await buyer.client.request(
        `/api/v1/directory/groups?region=Kairouan&unit=PIECES`,
      );
      assert.equal((suppressed.body as DirectoryPage).items[0].remaining, null);
      assert.ok(
        (suppressed.body as DirectoryPage).items[0].constraints.includes('SMALL_GROUP_SUPPRESSED'),
      );
      const local = await kairouanCoordinator.client.request(
        `/api/v1/directory/groups?region=Kairouan&unit=PIECES`,
      );
      const small = (local.body as DirectoryPage).items[0];
      assert.equal(small.declared, '40.00');
      const smallDetail = await kairouanCoordinator.client.request(
        `/api/v1/directory/groups/${small.id}`,
      );
      assert.equal(
        (smallDetail.body as DirectoryDetail).contributors?.[0].displayName,
        'Hidden participant solo',
      );
      const cross = await sfaxCoordinator.client.request(`/api/v1/directory/groups/${small.id}`);
      assert.equal((cross.body as DirectoryDetail).contributors, null);
      assert.equal(JSON.stringify(cross.body).includes('Hidden participant solo'), false);
      const administrator = await admin.client.request(`/api/v1/directory/groups/${group.id}`);
      assert.equal((administrator.body as DirectoryDetail).contributors, null);
      assert.equal((administrator.body as DirectoryDetail).group.remaining, '150.00');
      assert.equal((await outsider.client.request(path)).status, 403);
      for (const invalid of [
        '/api/v1/directory/groups?unit=STRAIN',
        '/api/v1/directory/groups?sensorData=1',
        '/api/v1/directory/groups?effectiveFrom=2027-05-10T00:00:00.000Z&effectiveTo=2027-05-03T00:00:00.000Z',
      ])
        assert.equal((await buyer.client.request(invalid)).status, 400);
      assert.equal((await buyer.client.request('/api/v1/directory/crafts')).status, 200);
      assert.equal((await buyer.client.request('/api/v1/directory/regions')).status, 200);
    },
  );
  await check(
    'directory releases only unproduced cancellations and keeps completed throughput',
    async () => {
      const cancelled = await offer(alpha.profile.id, alpha.declaration.id, 15, 'OFFERED');
      await db.commercialOrder.update({
        where: { id: cancelled.orderId },
        data: { status: 'CANCELLED' },
      });
      let page = await groups(buyer);
      assert.equal(page.items[0].reserved, '60.00');
      await db.commercialOffer.update({
        where: { id: gammaReserved.id },
        data: { status: 'DECLINED' },
      });
      page = await groups(buyer);
      assert.equal(page.items[0].reserved, '30.00');
      assert.equal(page.items[0].committed, '90.00');
      await db.commercialOffer.update({
        where: { id: gammaReserved.id },
        data: { status: 'DECLINED' },
      });
      assert.equal((await groups(buyer)).items[0].reserved, '30.00');
      await db.capacityDeclaration.update({
        where: { id: alpha.declaration.id },
        data: { supersededAt: new Date() },
      });
      const revised = await db.capacityDeclaration.create({
        data: {
          artisanProfileId: alpha.profile.id,
          craftSkillId: 'weaving',
          unitType: 'PIECES',
          quantity: 25,
          ...period,
          declaredByUserId: alpha.declaration.declaredByUserId,
          version: 2,
          previousDeclarationId: alpha.declaration.id,
        },
      });
      page = await groups(buyer);
      assert.equal(page.items[0].declared, '225.00');
      assert.equal(page.items[0].committed, '90.00');
      assert.equal(page.items[0].remaining, '105.00');
      const detail = await sfaxCoordinator.client.request(
        `/api/v1/directory/groups/${page.items[0].id}`,
      );
      const person = (detail.body as DirectoryDetail).contributors?.find(
        (item) => item.artisanProfileId === alpha.profile.id,
      );
      assert.equal(person?.committed, '30.00');
      assert.equal(person?.deficit, '5.00');
      assert.equal(person?.declarationId, revised.id);
      await db.artisanAssignment.updateMany({
        where: { artisanProfileId: alpha.profile.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      const unassigned = await sfaxCoordinator.client.request(
        `/api/v1/directory/groups/${page.items[0].id}`,
      );
      assert.equal(
        (unassigned.body as DirectoryDetail).contributors?.some(
          (item) => item.artisanProfileId === alpha.profile.id,
        ),
        false,
      );
      assert.equal((unassigned.body as DirectoryDetail).group.committed, '90.00');
      await db.onboardingAuthorization.updateMany({
        where: { artisanProfileId: gamma.profile.id, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      const reduced = await groups(sfaxCoordinator);
      assert.equal(reduced.items[0].declared, '105.00');
      assert.equal(reduced.items[0].committed, '50.00');
      assert.equal(reduced.items[0].remaining, '25.00');
      const hidden = await groups(buyer);
      assert.equal(hidden.items[0].remaining, null);
      assert.ok(hidden.items[0].constraints.includes('SMALL_GROUP_SUPPRESSED'));
      await db.organizationMember.update({
        where: {
          organizationId_userId: { organizationId: sfax.id, userId: sfaxCoordinator.me.user.id },
        },
        data: { status: 'SUSPENDED' },
      });
      assert.equal((await sfaxCoordinator.client.request(path)).status, 403);
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: alpha.profile.id } }),
        3,
      );
      assert.equal(
        await db.capacityDeclaration.count({
          where: {
            artisanProfileId: alpha.profile.id,
            unitType: 'PIECES',
            supersededAt: { not: null },
          },
        }),
        1,
      );
      void alphaReserved;
    },
  );
}
