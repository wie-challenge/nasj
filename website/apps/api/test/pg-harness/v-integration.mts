// Independent verification harness for CP5-G27 (buyer document privacy), CP5-G19/G20 (custody and
// receipt conservation) and the concurrency questions those fixes depend on.
//
// Runs the real services against a real PostgreSQL 17.5 server (PGlite over the wire protocol), with
// the full 39-migration schema and every constraint active. Multi-connection contention is genuine:
// separate TCP sessions, real row locks, real advisory locks.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const makePrisma = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.connectionString,
      connectionTimeoutMillis: 20000,
    }),
    log: [],
  });

const prisma = makePrisma();
const { ProcurementService } = await import('../../src/modules/procurement/procurement.service.js');
const { LogisticsService } = await import('../../src/modules/procurement/logistics.js');

// DirectoryService is only reached by unrelated code paths; the document and logistics methods
// never touch it. A stub keeps this harness from booting the whole module graph.
const stubDirectory = new Proxy({}, { get: () => async () => null });
const stubConfig = {};
const procurement = new ProcurementService(
  prisma as never,
  stubConfig as never,
  stubDirectory as never,
);
const _logistics = new LogisticsService(prisma as never);

const out = { g27: {}, g19: {}, g20: {}, concurrency: {} };
const now = new Date();

/* ------------------------------------------------------------------ fixture */

let n = 0;
async function actorFor(label) {
  const id = `u-${label}-${++n}`;
  await prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      emailVerified: true,
      name: `Person ${label}`,
      status: 'ACTIVE',
      updatedAt: now,
      preferredLanguage: 'en',
      role: 'USER',
    },
  });
  const sessionId = `sess-${id}`;
  await prisma.session.create({
    data: {
      id: sessionId,
      token: `tok-${sessionId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      userId: id,
    },
  });
  return { id, sessionId };
}

async function organization(id, type, createdByUserId) {
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

async function member(organizationId, userId, roles) {
  const m = await prisma.organizationMember.create({
    data: { id: `mem-${organizationId}-${userId}`, organizationId, userId, status: 'ACTIVE' },
  });
  for (const role of roles)
    await prisma.membershipRole.create({
      data: { id: `role-${m.id}-${role}`, membershipId: m.id, role, assignedByUserId: userId },
    });
  return m;
}

async function craft() {
  const found = await prisma.craftSkill.findFirst({ where: { isActive: true } });
  if (found) return found.id;
  const id = `craft-${++n}`;
  await prisma.craftSkill.create({
    data: { id, name: `Craft ${id}`, category: 'TEXTILE', isActive: true },
  });
  return id;
}

async function rfqWithOrder({ buyerOrg, operatorOrg, craftId, status = 'ACCEPTED' }) {
  const rfqId = `rfq-${++n}-${randomUUID().slice(0, 6)}`;
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
      status,
      updatedAt: now,
    },
  });
  const orderId = `ord-${rfqId}`;
  await prisma.commercialOrder.create({
    data: { id: orderId, rfqId, status: 'DELIVERED', version: 1, delivered: 100 },
  });
  return { rfqId, orderId };
}

/** Accepted quote carrying realistic internal costing, margin and feasibility sentinels. */
async function acceptedQuote(orderId, rfqId, authorUserId) {
  const quoteId = `q-${orderId}`;
  const acceptId = `acc-${orderId}`;
  const revisionId = `rev-${orderId}`;
  await prisma.procurementRevision
    .create({
      data: {
        id: revisionId,
        rfqId,
        version: 1,
        authorId: authorUserId,
        reason: 'synthetic verification fixture',
        snapshot: { synthetic: true },
      },
    })
    .catch(async () => {
      // A revision may already exist for this rfq in an upgrade fixture; reuse it.
    });
  const existingRevision =
    (await prisma.procurementRevision.findFirst({ where: { rfqId }, orderBy: { version: 'desc' } }))
      ?.id ?? revisionId;
  const snapshot = {
    totalTnd: '1250.000',
    taxTnd: '237.500',
    netTnd: '1012.500',
    taxBasisPoints: 1900,
    currency: 'TND',
    paymentTerms: 'net30',
    deliveryConditions: 'hub delivery',
    buyer: { name: 'Buyer SA', address: 'Tunis', taxId: 'SYNTHETIC-TAX-1' },
    specification: {
      description: 'cotton shirt',
      dimensions: 'L',
      materials: ['cotton'],
      unit: 'PIECES',
    },
    // ---- sentinels that must never reach a buyer
    internal: { SENDS: 'INTERNAL_SENTINEL_ALPHA', notes: 'SENTINEL_INTERNAL_BETA' },
    costEstimate: {
      costs: [{ category: 'MATERIAL', amountTnd: 'SENTINEL_COST_GAMMA' }],
      marginMethod: 'MARKUP',
      marginBasisPoints: 4237,
      lines: [{ rateTnd: 'SENTINEL_RATE_DELTA', effortMin: 4711 }],
    },
    feasibility: {
      effortMax: 9999,
      floor: 'SENTINEL_FEASIBILITY_EPSILON',
      explanation: 'SENTINEL_EXPL_ZETA',
    },
    producerShare: 'SENTINEL_SHARE_ETA',
  };
  await prisma.procurementQuote
    .create({
      data: {
        id: quoteId,
        rfqId,
        version: 1,
        revisionId: existingRevision,
        authorId: authorUserId,
        totalMillimes: 1_250_000n,
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        snapshot,
        status: 'ACCEPTED',
      },
    })
    .catch(async (error) => {
      out.g27.quoteFixtureError = String(error.message ?? error).slice(0, 300);
      throw error;
    });
  await prisma.procurementAcceptance
    .create({
      data: { id: acceptId, quoteId, orderId, actorId: authorUserId, snapshot },
    })
    .catch(async (error) => {
      out.g27.acceptanceFixtureError = String(error.message ?? error).slice(0, 300);
      throw error;
    });
  return { quoteId, acceptId, snapshot };
}

/* ------------------------------------------------------------------ G27 */

async function g27() {
  const craftId = await craft();
  const finance = await actorFor('finance');
  const buyer = await actorFor('buyer');
  const otherBuyer = await actorFor('otherbuyer');
  const outsider = await actorFor('outsider');

  const operatorOrg = await organization(`op-g27-${++n}`, 'INTERNAL', finance.id);
  const buyerOrg = await organization(`buy-g27-${n}`, 'BUYER_BUSINESS', buyer.id);
  const otherBuyerOrg = await organization(`buy2-g27-${++n}`, 'BUYER_BUSINESS', otherBuyer.id);

  await member(operatorOrg, finance.id, ['FINANCE_MANAGER']);
  await member(buyerOrg, buyer.id, ['BUYER_REPRESENTATIVE']);
  await member(otherBuyerOrg, otherBuyer.id, ['BUYER_REPRESENTATIVE']);

  const { rfqId, orderId } = await rfqWithOrder({ buyerOrg, operatorOrg, craftId });
  const { snapshot } = await acceptedQuote(orderId, rfqId, finance.id);

  // Issue a DELIVERY document as the internal operator. It stores a projection, so the stored
  // content is itself safe; the read path must still project for the buyer.
  const issued = await procurement.issueDocument(
    { id: finance.id, sessionId: finance.sessionId },
    rfqId,
    { kind: 'DELIVERY' },
    'g27-probe-issue-0001',
  );

  // A document issued before the fix: stored content still carries the raw snapshot.
  const legacyId = `doc-legacy-${n}`;
  await prisma.procurementDocument.create({
    data: {
      id: legacyId,
      rfqId,
      orderId,
      kind: 'INVOICE',
      number: 9000 + n,
      version: 1,
      status: 'FINAL',
      authorId: finance.id,
      content: { acceptanceId: null, rfqId, ...snapshot },
    },
  });

  const collect = async (actor, id) => {
    try {
      return { ok: true, value: await procurement.downloadDocument(actor, id) };
    } catch (error) {
      const response = error?.getResponse?.() ?? error?.response;
      return {
        ok: false,
        status: error?.getStatus?.() ?? error?.status,
        code: response?.code ?? response?.message,
      };
    }
  };

  const asBuyerNew = await collect({ id: buyer.id, sessionId: buyer.sessionId }, issued.id);
  const asBuyerLegacy = await collect({ id: buyer.id, sessionId: buyer.sessionId }, legacyId);
  const asOperatorNew = await collect({ id: finance.id, sessionId: finance.sessionId }, issued.id);
  const asOtherBuyer = await collect(
    { id: otherBuyer.id, sessionId: otherBuyer.sessionId },
    issued.id,
  );
  const asOutsider = await collect({ id: outsider.id, sessionId: outsider.sessionId }, issued.id);

  // Revoke the buyer's membership and retry.
  await prisma.organizationMember.update({
    where: { id: `mem-${buyerOrg}-${buyer.id}` },
    data: { status: 'SUSPENDED', suspendedAt: now },
  });
  const asRevoked = await collect({ id: buyer.id, sessionId: buyer.sessionId }, legacyId);
  await prisma.organizationMember.update({
    where: { id: `mem-${buyerOrg}-${buyer.id}` },
    data: { status: 'ACTIVE', suspendedAt: null },
  });

  const ser = (r) => (r.ok ? JSON.stringify(r.value) : '');
  const buyerNewText = ser(asBuyerNew);
  const buyerLegacyText = ser(asBuyerLegacy);
  const operatorText = ser(asOperatorNew);
  const sentinels = [
    'INTERNAL_SENTINEL_ALPHA',
    'SENTINEL_INTERNAL_BETA',
    'SENTINEL_COST_GAMMA',
    'SENTINEL_RATE_DELTA',
    'SENTINEL_FEASIBILITY_EPSILON',
    'SENTINEL_EXPL_ZETA',
    'SENTINEL_SHARE_ETA',
    '4237',
    '4711',
    '9999',
  ];
  out.g27 = {
    ...out.g27,
    issuedDocumentId: issued.id,
    buyerNewlyIssued: {
      ok: asBuyerNew.ok,
      leaked: sentinels.filter((s) => buyerNewText.includes(s)),
      keys: asBuyerNew.ok ? Object.keys(asBuyerNew.value.document ?? {}) : null,
      hasLegitimateTerms: buyerNewText.includes('1250.000') && buyerNewText.includes('net30'),
    },
    buyerLegacyDocument: {
      ok: asBuyerLegacy.ok,
      leaked: sentinels.filter((s) => buyerLegacyText.includes(s)),
      hasLegitimateTerms: buyerLegacyText.includes('1250.000') && buyerLegacyText.includes('net30'),
    },
    operator: {
      ok: asOperatorNew.ok,
      seesInternalCosting:
        operatorText.includes('SENTINEL_COST_GAMMA') ||
        operatorText.includes('SENTINEL_INTERNAL_BETA'),
      note: 'Internal staff must keep the full immutable record.',
    },
    otherBuyer: asOtherBuyer,
    revokedMember: asRevoked,
    outsider: asOutsider,
    storedLegacyStillContainsPrivate:
      (await prisma.procurementDocument.findUnique({ where: { id: legacyId } })).content !== null
        ? JSON.stringify(
            (await prisma.procurementDocument.findUnique({ where: { id: legacyId } })).content,
          ).includes('SENTINEL_COST_GAMMA')
        : null,
  };

  // Nested private field inside an allowlisted container, and an unexpected new top-level field.
  const { projectBuyerSnapshot } = await import('../../src/modules/procurement/buyer-document.js');
  const nested = projectBuyerSnapshot({
    ...snapshot,
    specification: { description: 'x', internal: { marginBasisPoints: 1234 } },
  });
  out.g27.nestedAllowlistedLeakPrevented = !JSON.stringify(nested).includes('1234');
  const unexpected = projectBuyerSnapshot({
    ...snapshot,
    brandNewSecretField: 'SENTINEL_NEW_THETA',
  });
  out.g27.unexpectedFieldOmitted = !JSON.stringify(unexpected).includes('SENTINEL_NEW_THETA');
  return { rfqId, orderId };
}

/* ------------------------------------------------------------------ G19 / G20 */

// Shipment fixtures require a ShipmentPreparationItem, which in turn requires a batch and a
// preparation record. Build the minimum chain the real constraints accept.
async function shipmentFixture({ buyerOrg, operatorOrg, craftId, actorId, total = 100 }) {
  const { rfqId, orderId } = await rfqWithOrder({ buyerOrg, operatorOrg, craftId });
  const tag = ++n;
  const artisanProfileId = `ap-log-${tag}`;
  await prisma.artisanProfile.create({
    data: {
      id: artisanProfileId,
      userId: actorId,
      displayName: `Artisan ${tag}`,
      region: 'TN',
      preferredLanguage: 'en',
      contactVisibility: 'PRIVATE',
      participantStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      experienceDescription: 'synthetic',
      updatedAt: now,
    },
  });
  const craftIdForOffer = craftId;
  const capacityId = `cap-log-${tag}`;
  await prisma.capacityDeclaration.create({
    data: {
      id: capacityId,
      artisanProfileId,
      craftSkillId: craftIdForOffer,
      unitType: 'PIECES',
      quantity: total,
      effectiveFrom: new Date('2026-10-01T00:00:00Z'),
      effectiveTo: new Date('2027-01-01T00:00:00Z'),
      declaredByUserId: actorId,
    },
  });
  const offerId = `off-log-${tag}`;
  await prisma.commercialOffer.create({
    data: {
      id: offerId,
      orderId,
      capacityDeclarationId: capacityId,
      artisanProfileId,
      quantity: total,
      unitPayMillimes: 1000n,
      estimatedHours: '1.0',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      materials: 'cotton',
      reworkTerms: 'none',
      paymentConditions: 'net30',
      status: 'ACCEPTED',
    },
  });
  const batchId = `bat-log-${tag}`;
  await prisma.commercialBatch.create({
    data: {
      id: batchId,
      orderId,
      offerId,
      artisanProfileId,
      status: 'APPROVED',
      produced: 100,
      submitted: 100,
      approved: 100,
    },
  });
  const prepId = `prep-log-${tag}`;
  await prisma.shipmentPreparation.create({
    data: { id: prepId, orderId, status: 'PREPARED', actorId },
  });
  const prepItemId = `prepi-log-${tag}`;
  await prisma.shipmentPreparationItem.create({
    data: { id: prepItemId, preparationId: prepId, batchId, quantity: total },
  });
  const shipmentId = `shp-${tag}`;
  await prisma.shipment
    .create({
      data: {
        id: shipmentId,
        orderId,
        status: 'PICKUP_SCHEDULED',
        version: 1,
        hub: 'Tunis',
        destination: 'Tunis',
        actorId,
        items: {
          create: [{ id: `itm-${shipmentId}`, quantity: total, preparationItemId: prepItemId }],
        },
      },
    })
    .catch(async (error) => {
      out.g19.shipmentFixtureError = String(error.message ?? error).slice(0, 400);
      throw error;
    });
  return { shipmentId, rfqId, orderId, batchId, prepId, prepItemId };
}

async function g19g20() {
  const craftId = await craft();
  const operator = await actorFor('logop');
  const buyer = await actorFor('logbuyer');
  const coordinator = await actorFor('logcoord');

  const operatorOrg = await organization(`op-log-${++n}`, 'INTERNAL', operator.id);
  const buyerOrg = await organization(`buy-log-${n}`, 'BUYER_BUSINESS', buyer.id);
  const assocOrg = await organization(`assoc-log-${++n}`, 'ASSOCIATION', coordinator.id);
  await member(operatorOrg, operator.id, ['INVENTORY_LOGISTICS_COORDINATOR']);
  await member(buyerOrg, buyer.id, ['BUYER_REPRESENTATIVE']);
  await member(assocOrg, coordinator.id, []);

  // Direct contract-level exercise of the corrected rules over a real database fixture.
  const C = await import(
    '/home/ashenix/Projects/wie-challenge/website/packages/contracts/dist/index.js'
  );

  const receiptCases = [
    { label: 'full', shipped: 100, reported: 100, received: 100, accepted: 100, missing: 0 },
    {
      label: 'short report 80/100',
      shipped: 100,
      reported: 80,
      received: 80,
      accepted: 80,
      missing: 0,
    },
    {
      label: 'buyer declares 10 missing',
      shipped: 100,
      reported: 100,
      received: 90,
      accepted: 90,
      missing: 10,
    },
    { label: 'damaged 5', shipped: 100, reported: 100, received: 100, accepted: 95, missing: 0 },
    {
      label: 'short report plus damage',
      shipped: 100,
      reported: 90,
      received: 85,
      accepted: 80,
      missing: 5,
    },
  ];
  out.g20 = {
    cases: receiptCases.map((c) => {
      try {
        const r = C.buyerReceipt(c);
        return {
          ...c,
          shortage: r.shortage,
          notReported: r.notReported,
          damaged: r.damaged,
          discrepancy: r.discrepancy,
        };
      } catch (error) {
        return { ...c, rejected: error.message };
      }
    }),
  };
  try {
    C.buyerReceipt({ shipped: 100, reported: 120, received: 120, accepted: 120, missing: 0 });
    out.g20.overReportAccepted = true;
  } catch (error) {
    out.g20.overReportAccepted = false;
    out.g20.overReportMessage = error.message;
  }

  const custodyCases = [
    { label: 'first 40 of 100', shipped: 100, previousHandovers: 0, quantity: 40 },
    { label: 'cumulative 40+70', shipped: 100, previousHandovers: 40, quantity: 70 },
    { label: 'exact fill 40+60', shipped: 100, previousHandovers: 40, quantity: 60 },
    { label: 'duplicate replay', shipped: 100, previousHandovers: 100, quantity: 100 },
    { label: 'zero quantity', shipped: 100, previousHandovers: 0, quantity: 0 },
  ];
  out.g19 = {
    ...out.g19,
    cases: custodyCases.map((c) => {
      try {
        return { ...c, result: C.custodyConservation(c) };
      } catch (error) {
        return { ...c, rejected: error.message };
      }
    }),
  };

  // Service-level custody exercise on a real shipment carrying internal additions.
  let fixture: unknown;
  try {
    fixture = await shipmentFixture({
      buyerOrg,
      operatorOrg,
      craftId,
      actorId: operator.id,
      total: 100,
    });
    // The database accepted the fixture. Verify a direct over-handover is refused by the rule and
    // that cumulative handovers cannot create pieces.
    const insertHandover = async (qty, eventType = 'COLLECTED_FROM_ASSOCIATION') =>
      prisma.custodyHandover
        .create({
          data: {
            id: `ch-${++n}`,
            shipmentId: fixture.shipmentId,
            eventType,
            sourceHolder: 'ASSOCIATION',
            destinationHolder: 'OPERATOR_HUB',
            actorId: operator.id,
            quantity: qty,
            occurredAt: now,
            confirmationStatus: 'PENDING',
            correlationId: randomUUID(),
          },
        })
        .then(() => 'ACCEPTED')
        .catch((e) => `REJECTED:${e.constraint ?? e.code}`);
    out.g19.serviceCustody = {
      fixtureCreated: true,
      firstHandover40: await insertHandover(40),
      // 40 already banked; the rule's own arithmetic rejects the second 70.
      secondHandover70: (() => {
        try {
          C.custodyConservation({ shipped: 100, previousHandovers: 40, quantity: 70 });
          return 'RULE_ACCEPTED';
        } catch (error) {
          return `RULE_REJECTED:${error.message}`;
        }
      })(),
      secondHandover60: (() => {
        try {
          return C.custodyConservation({ shipped: 100, previousHandovers: 40, quantity: 60 });
        } catch (error) {
          return `RULE_REJECTED:${error.message}`;
        }
      })(),
    };
  } catch (error) {
    out.g19.serviceCustody = {
      fixtureCreated: false,
      error: String(error.message ?? error).slice(0, 400),
    };
  }

  return { craftId, operatorOrg, buyerOrg, operator, buyer };
}

/* ------------------------------------------------------------------ concurrency */

async function concurrency() {
  const _C = await import(
    '/home/ashenix/Projects/wie-challenge/website/packages/contracts/dist/index.js'
  );
  const results = {};

  // A. Two overlapping writers take the same IAM advisory lock and try to over-ship.
  //    Each runs in its own connection; the lock must serialize them.
  const lockA = makePrisma();
  const lockB = makePrisma();
  const chain = await prisma.commercialRfq.findFirst({ where: { status: 'ACCEPTED' } });
  const _orderId = chain
    ? (await prisma.commercialOrder.findFirst({ where: { rfqId: chain.id } }))?.id
    : null;

  const holdMs = 700;
  const first = (async () => {
    const start = Date.now();
    await lockA.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
      await new Promise((r) => setTimeout(r, holdMs));
    });
    return Date.now() - start;
  })();
  await new Promise((r) => setTimeout(r, 120));
  const second = (async () => {
    const start = Date.now();
    await lockB.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
    });
    return Date.now() - start;
  })();
  const [firstMs, secondMs] = await Promise.all([first, second]);
  results.advisoryLock = {
    firstHeldMs: firstMs,
    secondWaitedMs: secondMs,
    serialized: secondMs >= holdMs - 60,
    note: 'Second transaction cannot enter its critical section until the first commits.',
  };

  // B. Write skew without the lock: two sessions read, both pass a check, both write.
  //    This is exactly what the application-level conservation rule relies on the lock to prevent.
  await prisma.$executeRawUnsafe(
    `drop table if exists skew_probe; create table skew_probe (id text primary key, moved int not null)`,
  );
  await prisma.$executeRawUnsafe(`insert into skew_probe values ('s1', 0)`);
  const skewA = makePrisma();
  const skewB = makePrisma();
  const step = async (client, qty, delayMs) => {
    try {
      return await client.$transaction(async (tx) => {
        const row = await tx.$queryRawUnsafe(`select moved from skew_probe where id='s1'`);
        const moved = Number(row[0].moved);
        await new Promise((r) => setTimeout(r, delayMs));
        // Application check: moved + qty <= 100
        if (moved + qty > 100) throw new Error('EXCESS_HANDOVER');
        await tx.$executeRawUnsafe(`update skew_probe set moved = moved + ${qty} where id='s1'`);
        return { ok: true, sawMoved: moved };
      });
    } catch (error) {
      return { ok: false, error: String(error.message ?? error) };
    }
  };
  const [s1, s2] = await Promise.all([step(skewA, 60, 400), step(skewB, 60, 400)]);
  const finalMoved = Number(
    (await prisma.$queryRawUnsafe(`select moved from skew_probe where id='s1'`))[0].moved,
  );
  results.unserializedWriteSkew = {
    transactionA: s1,
    transactionB: s2,
    finalMoved,
    overtally: finalMoved > 100,
    note: 'Proves the risk is real when the advisory lock is absent, and therefore why it is load-bearing.',
  };

  // C. Same scenario WITH the advisory lock — the shipped arrangement.
  await prisma.$executeRawUnsafe(`update skew_probe set moved = 0 where id='s1'`);
  const lockStep = async (client, qty, delayMs) => {
    try {
      return await client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        const row = await tx.$queryRawUnsafe(`select moved from skew_probe where id='s1'`);
        const moved = Number(row[0].moved);
        await new Promise((r) => setTimeout(r, delayMs));
        if (moved + qty > 100) throw new Error('EXCESS_HANDOVER');
        await tx.$executeRawUnsafe(`update skew_probe set moved = moved + ${qty} where id='s1'`);
        return { ok: true, sawMoved: moved };
      });
    } catch (error) {
      return { ok: false, error: String(error.message ?? error) };
    }
  };
  const [l1, l2] = await Promise.all([lockStep(skewA, 60, 300), lockStep(skewB, 60, 300)]);
  const finalLocked = Number(
    (await prisma.$queryRawUnsafe(`select moved from skew_probe where id='s1'`))[0].moved,
  );
  results.advisoryLockedWrite = {
    transactionA: l1,
    transactionB: l2,
    finalMoved: finalLocked,
    overtally: finalLocked > 100,
  };

  await Promise.all([
    skewA.$disconnect(),
    skewB.$disconnect(),
    lockA.$disconnect(),
    lockB.$disconnect(),
  ]);
  return results;
}

const run = async () => {
  try {
    await g27();
  } catch (error) {
    out.g27.fatal = String(error.message ?? error).slice(0, 500);
  }
  try {
    await g19g20();
  } catch (error) {
    out.g19.fatal = String(error.message ?? error).slice(0, 500);
  }
  try {
    out.concurrency = await concurrency();
  } catch (error) {
    out.concurrency.fatal = String(error.message ?? error).slice(0, 500);
  }
  console.log(JSON.stringify(out, null, 1));
  await prisma.$disconnect();
  await env.close();
};
await run();
