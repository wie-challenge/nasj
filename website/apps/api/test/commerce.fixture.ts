import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaService } from '../src/database/prisma.service.js';

// Called only by disposable integration/browser harnesses, never imported into application code.
export async function seedCommerceFixture(
  db: Pick<
    PrismaService,
    | 'organization'
    | 'organizationMember'
    | 'artisanProfile'
    | 'consentRecord'
    | 'capacityDeclaration'
  >,
  users: {
    buyerId: string;
    operatorId: string;
    artisanId: string;
    qualityId: string;
    outsiderId: string;
  },
  suffix: string,
) {
  const createOrg = async (
    type: 'BUYER_BUSINESS' | 'INTERNAL',
    userId: string,
    name: string,
    roles: (
      | 'BUYER'
      | 'PRODUCTION_MANAGER'
      | 'FINANCE_MANAGER'
      | 'QUALITY_INSPECTOR'
      | 'INVENTORY_LOGISTICS_COORDINATOR'
    )[],
  ) =>
    db.organization.create({
      data: {
        name,
        slug: `commerce-${suffix}-${type.toLowerCase()}-${userId}`,
        type,
        approvalStatus: 'APPROVED',
        country: 'TN',
        region: 'Tunis',
        description: 'Synthetic commerce regression fixture',
        contactEmail: 'fictional-commerce@example.com',
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        members: {
          create: {
            userId,
            isManager: true,
            roles: { create: roles.map((role) => ({ role, assignedByUserId: userId })) },
            ...(roles.includes('BUYER')
              ? {
                  permissionGrants: {
                    create: {
                      permission: 'buyer.quotation.approve',
                      grantedById: userId,
                      reason: 'Synthetic explicit approval authority fixture',
                    },
                  },
                }
              : {}),
          },
        },
      },
    });
  const buyer = await createOrg('BUYER_BUSINESS', users.buyerId, `Synthetic Buyer ${suffix}`, [
    'BUYER',
  ]);
  const operator = await createOrg('INTERNAL', users.operatorId, `Synthetic Operator ${suffix}`, [
    'PRODUCTION_MANAGER',
    'FINANCE_MANAGER',
    'QUALITY_INSPECTOR',
    'INVENTORY_LOGISTICS_COORDINATOR',
  ]);
  const outsider = await createOrg('BUYER_BUSINESS', users.outsiderId, `Other Buyer ${suffix}`, [
    'BUYER',
  ]);
  await db.organizationMember.create({
    data: {
      organizationId: operator.id,
      userId: users.qualityId,
      roles: { create: { role: 'QUALITY_INSPECTOR', assignedByUserId: users.operatorId } },
    },
  });
  const profile = await db.artisanProfile.create({
    data: {
      userId: users.artisanId,
      displayName: `Synthetic Artisan ${suffix}`,
      region: 'Tunis',
      equipment: [],
      skills: { create: { craftSkillId: 'weaving' } },
    },
  });
  await db.consentRecord.create({
    data: {
      userId: users.artisanId,
      purpose: 'artisan.profile',
      decision: true,
      policyVersion: 'artisan-profile-v1',
      collectionContext: 'synthetic_test_fixture',
    },
  });
  const now = Date.now();
  const capacity = await db.capacityDeclaration.create({
    data: {
      artisanProfileId: profile.id,
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      quantity: '10',
      effectiveFrom: new Date(now - 86400000),
      effectiveTo: new Date(now + 8 * 86400000),
      declaredByUserId: users.artisanId,
    },
  });
  return {
    buyerOrganizationId: buyer.id,
    operatorOrganizationId: operator.id,
    otherBuyerOrganizationId: outsider.id,
    artisanProfileId: profile.id,
    capacityDeclarationId: capacity.id,
    deliveryAt: new Date(now + 6 * 86400000).toISOString(),
    quoteExpiresAt: new Date(now + 2 * 86400000).toISOString(),
    offerExpiresAt: new Date(now + 3 * 86400000).toISOString(),
  };
}

export async function seedBrowserCommerceFixture(url: string, suffix: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const get = async (role: string) =>
      (
        await db.user.findUniqueOrThrow({
          where: { email: `commerce-${role}-${suffix}@example.com` },
        })
      ).id;
    return await seedCommerceFixture(
      db,
      {
        buyerId: await get('buyer'),
        operatorId: await get('operator'),
        artisanId: await get('artisan'),
        qualityId: await get('quality'),
        outsiderId: await get('outsider'),
      },
      suffix,
    );
  } finally {
    await db.$disconnect();
  }
}

// Loopback browser control only: synthetic obligations for the capacity screens.
export async function seedBrowserCapacityFixture(url: string, suffix: string) {
  const fixture = await seedBrowserCommerceFixture(url, suffix);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const coordinator = await db.user.findUniqueOrThrow({
      where: { email: `commerce-coordinator-${suffix}@example.com` },
    });
    const artisan = await db.artisanProfile.findUniqueOrThrow({
      where: { id: fixture.artisanProfileId },
    });
    const association = await db.organization.create({
      data: {
        name: `Synthetic capacity association ${suffix}`,
        slug: `capacity-${suffix}`,
        type: 'ASSOCIATION',
        approvalStatus: 'APPROVED',
        region: 'Tunis',
        description: 'Synthetic browser capacity fixture',
        contactEmail: 'fictional-capacity@example.com',
        representativeName: 'Synthetic coordinator',
        createdByUserId: coordinator.id,
        members: {
          create: {
            userId: coordinator.id,
            roles: {
              create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinator.id },
            },
          },
        },
      },
    });
    await db.artisanManagement.create({
      data: {
        artisanProfileId: artisan.id,
        organizationId: association.id,
        recordedById: coordinator.id,
        reason: 'Synthetic browser management fixture',
      },
    });
    await db.artisanAssignment.create({
      data: {
        artisanProfileId: artisan.id,
        organizationId: association.id,
        coordinatorId: coordinator.id,
        assignedById: coordinator.id,
        reason: 'Synthetic browser assignment fixture',
      },
    });
    const policy = await db.authorizationPolicy.create({
      data: {
        version: `capacity-browser-${suffix}`,
        methods: ['SIGNED'],
        reviewReference: 'Synthetic reviewed method fixture',
        reviewedById: coordinator.id,
      },
    });
    const authorizations = [];
    for (const purpose of ['PARTICIPATION', 'CAPACITY'] as const)
      authorizations.push(
        await db.onboardingAuthorization.create({
          data: {
            artisanProfileId: artisan.id,
            policyId: policy.id,
            purpose,
            method: 'SIGNED',
            occurredAt: new Date(),
            language: 'fr',
            evidenceReference: 'Synthetic worker confirmation fixture',
            recordedById: coordinator.id,
          },
        }),
      );
    const period = {
      effectiveFrom: new Date('2027-04-05T00:00:00+01:00'),
      effectiveTo: new Date('2027-04-12T00:00:00+01:00'),
    };
    await db.capacityDeclaration.update({
      where: { id: fixture.capacityDeclarationId },
      data: { ...period, quantity: 100 },
    });
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: fixture.buyerOrganizationId,
        operatorOrganizationId: fixture.operatorOrganizationId,
        craftSkillId: 'weaving',
        title: 'Synthetic capacity demonstration',
        specification: 'Synthetic only',
        designRequirements: 'Synthetic only',
        quantity: 100,
        deliveryAt: new Date('2027-04-08T12:00:00+01:00'),
        deliveryLocation: 'Synthetic site',
        status: 'ACCEPTED',
        order: { create: { status: 'PLANNING' } },
      },
      include: { order: true },
    });
    for (const [status, quantity] of [
      ['OFFERED', 20],
      ['ACCEPTED', 30],
    ] as const)
      await db.commercialOffer.create({
        data: {
          orderId: rfq.order!.id,
          artisanProfileId: artisan.id,
          capacityDeclarationId: fixture.capacityDeclarationId,
          status,
          quantity,
          unitPayMillimes: 1000n,
          estimatedHours: 'Synthetic range',
          expiresAt: new Date(Date.now() + 86400000),
          materials: 'Synthetic only',
          reworkTerms: 'Synthetic only',
          paymentConditions: 'Simulated only',
          ...(status === 'ACCEPTED'
            ? {
                acceptedAt: new Date(),
                batch: { create: { orderId: rfq.order!.id, artisanProfileId: artisan.id } },
              }
            : {}),
        },
      });
    return { artisanProfileId: artisan.id, authorizationId: authorizations[1].id };
  } finally {
    await db.$disconnect();
  }
}
