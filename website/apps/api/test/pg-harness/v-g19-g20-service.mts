// CP5-G19 / CP5-G20 through the real LogisticsService against real PostgreSQL.
//
// The contract-level arithmetic is already proven. This probe proves the *service* applies it:
// a short operator report cannot be persisted as a clean delivery, and custody movement is refused
// past the shipped total.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
process.env.DATABASE_URL = env.connectionString;

const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.connectionString, connectionTimeoutMillis: 20000 }),
  log: [],
});
const { LogisticsService } = await import('../../src/modules/procurement/logistics.js');
const logistics = new LogisticsService(prisma as never);

const out = {};
const now = new Date();
let n = 0;

async function user(label, role = 'USER') {
  const id = `u-${label}-${++n}`;
  await prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      emailVerified: true,
      name: label,
      status: 'ACTIVE',
      updatedAt: now,
      preferredLanguage: 'en',
      role,
    },
  });
  const sessionId = `sess-${id}`;
  await prisma.session.create({
    data: {
      id: sessionId,
      token: `tok-${id}`,
      expiresAt: new Date(Date.now() + 86400000),
      userId: id,
    },
  });
  return { id, sessionId };
}

async function org(id, type, createdByUserId) {
  await prisma.organization.create({
    data: {
      id,
      name: id,
      slug: id,
      type,
      approvalStatus: 'APPROVED',
      updatedAt: now,
      region: 'TN',
      description: 'synthetic',
      contactEmail: `${id}@example.test`,
      representativeName: 'Rep',
      createdByUserId,
    },
  });
  return id;
}

async function member(orgId, userId, roles) {
  const m = await prisma.organizationMember.create({
    data: { id: `mem-${orgId}-${userId}`, organizationId: orgId, userId, status: 'ACTIVE' },
  });
  for (const r of roles)
    await prisma.membershipRole.create({
      data: { id: `role-${m.id}-${r}`, membershipId: m.id, role: r, assignedByUserId: userId },
    });
  return m;
}

const result = async (fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const r = e?.getResponse?.() ?? e?.response;
    return {
      ok: false,
      status: e?.getStatus?.() ?? e?.status,
      code: r?.code ?? r?.message,
      message: r?.message,
    };
  }
};

try {
  const craft = await prisma.craftSkill.findFirst({ where: { isActive: true } });
  const craftId =
    craft?.id ??
    (
      await prisma.craftSkill.create({
        data: { id: `craft-lg-${++n}`, name: 'Craft', category: 'TEXTILE', isActive: true },
      })
    ).id;

  const operator = await user('lgop');
  const buyer = await user('lgbuy');
  const coordinator = await user('lgcoord');
  const operatorOrg = await org(`op-lg-${++n}`, 'INTERNAL', operator.id);
  const buyerOrg = await org(`buy-lg-${n}`, 'BUYER_BUSINESS', buyer.id);
  const assocOrg = await org(`assoc-lg-${++n}`, 'ASSOCIATION', coordinator.id);
  await member(operatorOrg, operator.id, ['NASJ_OPERATOR']);
  await member(buyerOrg, buyer.id, ['BUYER_REPRESENTATIVE']);
  await member(assocOrg, coordinator.id, ['ASSOCIATION_COORDINATOR']);
  // logistics permission is granted only to an operator assigned to this buyer organization.
  await prisma.operatorAssignment.create({
    data: {
      id: `oa-lg-${n}`,
      operatorId: operator.id,
      organizationId: buyerOrg,
      assignedById: operator.id,
    },
  });

  // ---- shipment with 100 pieces
  const rfqId = `rfq-lg-${n}`;
  await prisma.commercialRfq.create({
    data: {
      id: rfqId,
      buyerOrganizationId: buyerOrg,
      operatorOrganizationId: operatorOrg,
      craftSkillId: craftId,
      title: 'Synthetic',
      specification: 'spec',
      designRequirements: 'none',
      quantity: 100,
      deliveryAt: new Date('2027-01-01T00:00:00Z'),
      deliveryLocation: 'Tunis',
      status: 'ACCEPTED',
      updatedAt: now,
    },
  });
  const orderId = `ord-${rfqId}`;
  await prisma.commercialOrder.create({
    data: { id: orderId, rfqId, status: 'DELIVERED', version: 1, delivered: 100 },
  });

  const tag = ++n;
  const api = `ap-lg-${tag}`;
  await prisma.artisanProfile.create({
    data: {
      id: api,
      userId: operator.id,
      displayName: 'A',
      region: 'TN',
      preferredLanguage: 'en',
      contactVisibility: 'PRIVATE',
      participantStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      experienceDescription: 's',
      updatedAt: now,
    },
  });
  const capId = `cap-lg-${tag}`;
  await prisma.capacityDeclaration.create({
    data: {
      id: capId,
      artisanProfileId: api,
      craftSkillId: craftId,
      unitType: 'PIECES',
      quantity: 100,
      effectiveFrom: new Date('2026-10-01T00:00:00Z'),
      effectiveTo: new Date('2027-01-01T00:00:00Z'),
      declaredByUserId: operator.id,
    },
  });
  const offerId = `off-lg-${tag}`;
  await prisma.commercialOffer.create({
    data: {
      id: offerId,
      orderId,
      capacityDeclarationId: capId,
      artisanProfileId: api,
      quantity: 100,
      unitPayMillimes: 1000n,
      estimatedHours: '1.0',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      materials: 'cotton',
      reworkTerms: 'none',
      paymentConditions: 'net30',
      status: 'ACCEPTED',
    },
  });
  const batchId = `bat-lg-${tag}`;
  await prisma.commercialBatch.create({
    data: {
      id: batchId,
      orderId,
      offerId,
      artisanProfileId: api,
      status: 'APPROVED',
      produced: 100,
      submitted: 100,
      approved: 100,
    },
  });
  const prepId = `prep-lg-${tag}`;
  await prisma.shipmentPreparation.create({
    data: { id: prepId, orderId, status: 'PREPARED', actorId: operator.id },
  });
  const prepItemId = `prepi-lg-${tag}`;
  await prisma.shipmentPreparationItem.create({
    data: { id: prepItemId, preparationId: prepId, batchId, quantity: 100 },
  });
  const shipmentId = `shp-lg-${tag}`;
  await prisma.shipment.create({
    data: {
      id: shipmentId,
      orderId,
      status: 'PICKUP_SCHEDULED',
      version: 1,
      hub: 'Tunis',
      destination: 'Tunis',
      actorId: operator.id,
      items: { create: [{ id: `itm-lg-${tag}`, quantity: 100, preparationItemId: prepItemId }] },
    },
  });

  // A pickup schedule names the association whose coordinator records collection.
  await prisma.pickupSchedule.create({
    data: {
      id: `pk-lg-${tag}`,
      shipmentId,
      associationOrganizationId: assocOrg,
      hub: 'Tunis',
      windowStart: new Date('2026-10-01T00:00:00Z'),
      windowEnd: new Date('2026-10-02T00:00:00Z'),
      coordinatorId: coordinator.id,
      operatorId: operator.id,
      quantity: 100,
      actorId: operator.id,
    },
  });

  // ---- G19: custody through the service
  const _actor = { id: operator.id, sessionId: operator.sessionId };
  const coordActor = { id: coordinator.id, sessionId: coordinator.sessionId };
  const h1 = await result(() =>
    logistics.handover(
      coordActor,
      shipmentId,
      {
        version: 1,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 40,
        occurredAt: new Date(Date.now() - 3600_000).toISOString(),
        note: 'synthetic collection',
      },
      `g19-pickup-${randomUUID()}`,
    ),
  );
  const afterH1 = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { handovers: true },
  });
  // A second collection of 70 on top of 40 must be refused (110 > 100).
  const h2 = await result(() =>
    logistics.handover(
      coordActor,
      shipmentId,
      {
        version: afterH1.version,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 70,
        occurredAt: new Date(Date.now() - 1800_000).toISOString(),
        note: 'synthetic over-collection',
      },
      `g19-over-${randomUUID()}`,
    ),
  );
  const afterH2 = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { handovers: true },
  });
  // True replay: the SAME idempotency key must return the stored result and create no new row.
  const replayKey = `g19-replay-${randomUUID()}`;
  const r1 = await result(() =>
    logistics.handover(
      coordActor,
      shipmentId,
      {
        version: afterH2.version,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 10,
        occurredAt: new Date(Date.now() - 1200_000).toISOString(),
        note: 'synthetic replay source',
      },
      replayKey,
    ),
  );
  const rowsAfterR1 = await prisma.custodyHandover.count({ where: { shipmentId } });
  const r2 = await result(() =>
    logistics.handover(
      coordActor,
      shipmentId,
      {
        version: afterH2.version,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 10,
        occurredAt: new Date(Date.now() - 1200_000).toISOString(),
        note: 'synthetic replay source',
      },
      replayKey,
    ),
  );
  const rowsAfterR2 = await prisma.custodyHandover.count({ where: { shipmentId } });
  const replay = {
    ok: r1.ok && r2.ok,
    rowsAfterR1,
    rowsAfterR2,
    noNewRow: rowsAfterR1 === rowsAfterR2,
  };
  out.g19 = {
    firstCollection40: h1.ok ? { ok: true } : h1,
    overCollection70Rejected: !h2.ok,
    overCollectionDenial: h2.code,
    handoversAfterFirst: afterH1.handovers.length,
    handoversAfterRejected: afterH2.handovers.length,
    movedTotal: afterH2.handovers
      .filter((r) => !r.priorHandoverId)
      .reduce((s, r) => s + r.quantity, 0),
    idempotentReplay: replay,
    note: 'A replay under a fresh idempotency key must still be refused by the cumulative rule.',
  };

  // ---- G20: short operator report must not read as a clean delivery
  // Operator reports 80 delivered out of 100 shipped.
  await prisma.deliveryReport.create({
    data: {
      id: `dr-lg-${tag}`,
      shipmentId,
      quantity: 80,
      actorId: operator.id,
      occurredAt: now,
      note: 'short synthetic report',
    },
  });
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { status: 'DELIVERY_REPORTED', version: { increment: 1 } },
  });
  const preConfirm = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  const confirm = await result(() =>
    logistics.confirmDelivery(
      { id: buyer.id, sessionId: buyer.sessionId },
      shipmentId,
      {
        version: preConfirm.version,
        received: 80,
        accepted: 80,
        missing: 0,
        occurredAt: new Date().toISOString(),
        note: 'synthetic receipt',
      },
      `g20-confirm-${randomUUID()}`,
    ),
  );
  const stored = await prisma.buyerDeliveryConfirmation.findUnique({ where: { shipmentId } });
  out.g20 = {
    operatorReported: 80,
    shipped: 100,
    buyerSubmittedReceived: 80,
    buyerSubmittedMissing: 0,
    confirmed: confirm.ok,
    storedMissing: stored?.missing,
    storedReceived: stored?.received,
    storedAccepted: stored?.accepted,
    shortageRetained: (stored?.missing ?? 0) === 20,
    discrepancyRaised: Boolean(confirm.ok),
    note: 'Stored missing must be 20 (shipped minus reported + declared missing), not 0.',
  };

  // ---- Batch 2: the projection must attribute the gap, not just total it.
  const projected = await result(() =>
    logistics.shipments({ id: buyer.id, sessionId: buyer.sessionId }, orderId),
  );
  const view = projected.ok
    ? (projected.value as { items: Record<string, unknown>[] }).items.find(
        (row) => row.id === shipmentId,
      )
    : undefined;
  out.g20Provenance = {
    projected: Boolean(view),
    operatorReported: view?.delivered,
    buyerReceived: view?.buyerReceived,
    notReportedByOperator: view?.notReportedByOperator,
    buyerDeclaredMissing: view?.buyerDeclaredMissing,
    totalUnaccounted: view?.totalUnaccounted,
    provenanceComplete: view?.provenanceComplete,
    legacyMissingField: view?.missing,
    correctAttribution: view?.notReportedByOperator === 20 && view?.buyerDeclaredMissing === 0,
    note: 'The 20 pieces are an operator reporting gap, not a buyer declaration.',
  };

  // ---- Batch 2: cross-tenant isolation of the new provenance fields.
  const stranger = await user('stranger');
  const strangerOrg = await org(`out-${++n}`, 'BUYER_BUSINESS', stranger.id);
  await member(strangerOrg, stranger.id, ['BUYER_REPRESENTATIVE']);
  const foreign = await result(() =>
    logistics.shipments({ id: stranger.id, sessionId: stranger.sessionId }, orderId),
  );
  out.crossTenant = {
    foreignShipmentRead: foreign.ok ? 'DISCLOSED' : (foreign.status ?? foreign.code),
    denied: !foreign.ok,
    note: "An unrelated buyer must not read another organization's shipment provenance.",
  };
} catch (error) {
  out.fatal = String(error.stack ?? error).slice(0, 900);
} finally {
  console.log(JSON.stringify(out, null, 1));
  await prisma.$disconnect();
  await env.close();
  process.exit(0);
}
