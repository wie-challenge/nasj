import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Loopback browser control only. Extends the synthetic production fixture with a buyer member, a
 * scoped support role for the operator and a shipment awaiting buyer confirmation. Everything here
 * is synthetic and lives in a disposable database.
 */
export async function seedBrowserFeedbackFixture(url: string, suffix: string, buyerEmail: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const buyer = await db.user.findUniqueOrThrow({ where: { email: buyerEmail } });
    const operator = await db.user.findUniqueOrThrow({
      where: { email: `production-operator-${suffix}@example.com` },
    });
    const coordinator = await db.user.findUniqueOrThrow({
      where: { email: `production-coordinator-${suffix}@example.com` },
    });
    const order = await db.commercialOrder.findFirstOrThrow({
      where: { rfq: { title: `Synthetic production ${suffix}` } },
      include: { rfq: true },
    });
    const buyerOrg = await db.organization.findUniqueOrThrow({
      where: { id: order.rfq.buyerOrganizationId },
    });
    const operatorOrg = await db.organization.findUniqueOrThrow({
      where: { id: order.rfq.operatorOrganizationId },
    });
    const association = await db.organization.findFirstOrThrow({
      where: { type: 'ASSOCIATION', name: `Production association ${suffix}` },
    });
    // The buyer account joins the fixture buyer organization; no new default role is invented.
    await db.organizationMember.create({
      data: {
        organizationId: buyerOrg.id,
        userId: buyer.id,
        roles: { create: { role: 'BUYER', assignedByUserId: operator.id } },
      },
    });
    // Scoped support needs support.case.manage inside the operating organization plus an assignment.
    const operatorMembership = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: operatorOrg.id, userId: operator.id },
      },
    });
    await db.membershipRole.upsert({
      where: { membershipId_role: { membershipId: operatorMembership.id, role: 'SUPPORT' } },
      create: {
        membershipId: operatorMembership.id,
        role: 'SUPPORT',
        assignedByUserId: operator.id,
      },
      update: {},
    });
    await db.operatorAssignment.upsert({
      where: {
        operatorId_organizationId: { operatorId: operator.id, organizationId: buyerOrg.id },
      },
      create: { operatorId: operator.id, organizationId: buyerOrg.id, assignedById: operator.id },
      update: { revokedAt: null },
    });
    const profile = await db.artisanProfile.findFirstOrThrow({
      where: { displayName: `Synthetic linked ${suffix}` },
    });
    const offer = await db.commercialOffer.create({
      data: {
        orderId: order.id,
        capacityDeclarationId: (
          await db.capacityDeclaration.findFirstOrThrow({
            where: { artisanProfileId: profile.id },
          })
        ).id,
        artisanProfileId: profile.id,
        quantity: 10,
        unitPayMillimes: 3000n,
        estimatedHours: '3',
        expiresAt: new Date('2027-09-20T00:00:00Z'),
        materials: 'Synthetic feedback materials',
        reworkTerms: 'Synthetic feedback rework',
        paymentConditions: 'Synthetic feedback payment',
        collectionArrangement: 'Association pickup',
        instructions: 'Synthetic feedback instructions',
        status: 'ACCEPTED',
        associationOrganizationId: association.id,
        termsSha256: 'cd'.repeat(32),
      },
    });
    const batch = await db.commercialBatch.create({
      data: {
        orderId: order.id,
        offerId: offer.id,
        artisanProfileId: profile.id,
        status: 'APPROVED',
        produced: 10,
        submitted: 10,
        approved: 10,
      },
    });
    const preparation = await db.shipmentPreparation.create({
      data: {
        orderId: order.id,
        actorId: operator.id,
        items: { create: { batchId: batch.id, quantity: 10 } },
      },
      include: { items: true },
    });
    const shipment = await db.shipment.create({
      data: {
        orderId: order.id,
        status: 'DELIVERY_REPORTED',
        hub: 'Synthetic feedback hub',
        destination: 'Synthetic Tunis site',
        actorId: operator.id,
        items: {
          create: { preparationItemId: preparation.items[0]!.id, quantity: 10 },
        },
        pickups: {
          create: {
            associationOrganizationId: association.id,
            hub: 'Synthetic feedback hub',
            windowStart: new Date('2026-10-01T09:00:00Z'),
            windowEnd: new Date('2026-10-01T12:00:00Z'),
            coordinatorId: coordinator.id,
            operatorId: operator.id,
            quantity: 10,
            actorId: operator.id,
          },
        },
        deliveryReport: {
          create: {
            quantity: 10,
            actorId: operator.id,
            occurredAt: new Date('2026-10-02T09:00:00Z'),
          },
        },
      },
    });
    return {
      rfqId: order.rfqId,
      orderId: order.id,
      shipmentId: shipment.id,
      buyerOrganizationId: buyerOrg.id,
      operatorOrganizationId: operatorOrg.id,
    };
  } finally {
    await db.$disconnect();
  }
}
