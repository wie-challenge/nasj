import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedBrowserProductionFixture } from './production.fixture.js';
// Nonce-protected loopback test control only, always on a disposable database.
// All accepted work/payable prerequisites are synthetic and are never verified bank evidence.
export async function seedBrowserBatch5Fixture(url: string, suffix: string) {
  const base = await seedBrowserProductionFixture(url, suffix);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const rfq = await db.commercialRfq.findUniqueOrThrow({
      where: { id: base.rfqId },
      include: {
        order: { select: { id: true } },
        revisions: true,
        samples: { select: { id: true } },
      },
    });
    const operator = await db.user.findUniqueOrThrow({
      where: { email: `production-operator-${suffix}@example.com` },
    });
    const artisan = await db.artisanProfile.findFirstOrThrow({
      where: { displayName: base.linkedName },
    });
    const checker = await db.user.findUniqueOrThrow({
      where: { email: `production-checker-${suffix}@example.com` },
    });
    const management = await db.artisanManagement.findFirstOrThrow({
      where: { artisanProfileId: artisan.id, endedAt: null },
    });
    const membership = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: rfq.operatorOrganizationId, userId: operator.id },
      },
    });
    const grants = [
      'inventory.stock.read',
      'inventory.stock.register',
      'inventory.stock.reserve',
      'inventory.stock.handover',
      'inventory.stock.adjust',
      'finance.deposit.record',
      'finance.payable.reconcile',
      'finance.payout.read',
      'finance.payout.request',
      'finance.payout.approve',
      'finance.payout.execute',
      'finance.dispute.manage',
      'finance.closure.assess',
      'finance.adjustment.propose',
    ];
    await db.membershipPermission.createMany({
      data: grants.map((permission) => ({
        membershipId: membership.id,
        permission,
        grantedById: operator.id,
        reason: 'Explicit synthetic browser test authority',
      })),
    });
    await db.organizationMember.create({
      data: {
        organizationId: rfq.operatorOrganizationId,
        userId: checker.id,
        roles: { create: { role: 'FINANCE_MANAGER', assignedByUserId: operator.id } },
        permissionGrants: {
          create: [
            {
              permission: 'finance.payout.approve',
              grantedById: operator.id,
              reason: 'Synthetic independent checker grant',
            },
            {
              permission: 'finance.dispute.manage',
              grantedById: operator.id,
              reason: 'Synthetic dispute reviewer grant',
            },
          ],
        },
      },
    });
    await db.operatorAssignment.create({
      data: {
        operatorId: checker.id,
        organizationId: rfq.buyerOrganizationId,
        assignedById: operator.id,
      },
    });
    const capacity = await db.capacityDeclaration.findFirstOrThrow({
      where: { artisanProfileId: artisan.id },
    });
    const offer = await db.commercialOffer.create({
      select: { id: true },
      data: {
        orderId: rfq.order!.id,
        capacityDeclarationId: capacity.id,
        artisanProfileId: artisan.id,
        quantity: 10,
        unitPayMillimes: 3000n,
        estimatedHours: '10',
        expiresAt: new Date('2027-09-20T00:00:00Z'),
        materials: 'Synthetic yarn',
        reworkTerms: 'New agreement required',
        paymentConditions: 'Synthetic accepted compensation',
        status: 'ACCEPTED',
        quoteId: base.quoteId,
        associationOrganizationId: management.organizationId,
      },
    });
    const batch = await db.commercialBatch.create({
      data: {
        orderId: rfq.order!.id,
        offerId: offer.id,
        artisanProfileId: artisan.id,
        revisionId: rfq.revisions[0].id,
        status: 'ACCEPTED',
      },
    });
    const release = await db.batchRelease.create({
      select: { id: true },
      data: {
        batchId: batch.id,
        actorId: operator.id,
        revisionId: rfq.revisions[0].id,
        sampleId: rfq.samples[0].id,
        fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      },
    });
    await db.batchMaterialRequirement.create({
      data: {
        batchId: batch.id,
        releaseId: release.id,
        materialCode: 'yarn',
        name: 'Yarn',
        unit: 'METERS',
        perItemMilli: 1000,
        wastageBps: 0,
        batchQuantity: 10,
        requiredMilli: 10000,
        readiness: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      },
    });
    const payable = await db.artisanPayable.create({
      select: { id: true },
      data: {
        offerId: offer.id,
        orderId: rfq.order!.id,
        batchId: batch.id,
        artisanProfileId: artisan.id,
        milestone: 'BUYER_ACCEPTED_PIECE',
        policyVersion: 1,
        quantity: 5,
        unitPayMillimes: 3000n,
        amountMillimes: 15000n,
        sourceEventId: `synthetic-browser-prerequisite-${suffix}`,
        termsSnapshot: 'Synthetic browser payable prerequisite; not a verified payment',
      },
    });
    return {
      ...base,
      orderId: rfq.order!.id,
      organizationId: rfq.operatorOrganizationId,
      receiverOrganizationId: management.organizationId,
      batchId: batch.id,
      payableId: payable.id,
    };
  } finally {
    await db.$disconnect();
  }
}
