import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';

type Result = { status: number; body: unknown };
type Identity = {
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<Result>;
  };
  me: { user: { id: string } };
};
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};

const code = (result: Result) => (result.body as { code?: string }).code;
const root = '/api/v1/collaboration';
const procurement = '/api/v1/procurement';

/**
 * E18-06 end-to-end: a real buyer receipt through HTTP, then the private assessment, correction,
 * scoped support follow-up and an existing formal order claim. Every fixture is synthetic and the
 * disposable database is destroyed afterwards.
 */
export async function runOrderFeedbackScenarios({ db, register, check }: Harness) {
  const [buyer, colleague, operator, support, outsider, artisan] = await Promise.all(
    ['buyer', 'colleague', 'operator', 'support', 'outsider', 'artisan'].map((role) =>
      register(`feedback-${role}@example.com`, `Synthetic feedback ${role}`),
    ),
  );
  const post = async (
    who: Identity,
    path: string,
    body: unknown,
    key = randomUUID(),
    extra: Record<string, string> = {},
  ) => {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
      ...extra,
    });
  };
  const organization = async (
    name: string,
    type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
    userId: string,
    role: 'BUYER' | 'NASJ_OPERATOR' | 'SUPPORT' | 'ASSOCIATION_COORDINATOR',
  ) =>
    db.organization.create({
      data: {
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        type,
        approvalStatus: 'APPROVED',
        region: 'Sfax',
        description: 'Synthetic feedback fixture',
        contactEmail: 'feedback@example.com',
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        members: {
          create: { userId, roles: { create: { role, assignedByUserId: userId } } },
        },
      },
    });
  const [buyerOrg, operatorOrg, association, otherBuyerOrg] = await Promise.all([
    organization('Feedback buyer', 'BUYER_BUSINESS', buyer.me.user.id, 'BUYER'),
    organization('Feedback operator', 'INTERNAL', operator.me.user.id, 'NASJ_OPERATOR'),
    organization(
      'Feedback association',
      'ASSOCIATION',
      operator.me.user.id,
      'ASSOCIATION_COORDINATOR',
    ),
    organization('Feedback other buyer', 'BUYER_BUSINESS', outsider.me.user.id, 'BUYER'),
  ]);
  // A second employee of the same buyer organization never inherits the author's private assessment.
  await db.organizationMember.create({
    data: {
      organizationId: buyerOrg.id,
      userId: colleague.me.user.id,
      roles: { create: { role: 'BUYER', assignedByUserId: buyer.me.user.id } },
    },
  });
  // Scoped support: support.case.manage in the operating organization plus an active assignment.
  await db.organizationMember.create({
    data: {
      organizationId: operatorOrg.id,
      userId: support.me.user.id,
      roles: { create: { role: 'SUPPORT', assignedByUserId: operator.me.user.id } },
    },
  });
  const assignment = await db.operatorAssignment.create({
    data: {
      operatorId: support.me.user.id,
      organizationId: buyerOrg.id,
      assignedById: operator.me.user.id,
    },
  });
  await db.operatorAssignment.create({
    data: {
      operatorId: operator.me.user.id,
      organizationId: buyerOrg.id,
      assignedById: operator.me.user.id,
    },
  });
  const profile = await db.artisanProfile.create({
    data: {
      displayName: 'Synthetic feedback artisan',
      region: 'Synthetic quarter',
      userId: artisan.me.user.id,
      equipment: [],
      skills: { create: { craftSkillId: 'weaving' } },
    },
  });
  await db.artisanManagement.create({
    data: {
      artisanProfileId: profile.id,
      organizationId: association.id,
      recordedById: operator.me.user.id,
      reason: 'Synthetic feedback management',
    },
  });
  const capacity = await db.capacityDeclaration.create({
    data: {
      artisanProfileId: profile.id,
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      quantity: 100,
      effectiveFrom: new Date('2027-09-06T00:00:00+01:00'),
      effectiveTo: new Date('2027-09-13T00:00:00+01:00'),
      declaredByUserId: operator.me.user.id,
    },
  });
  const makeOrder = async (title: string, buyerOrganizationId: string) =>
    db.commercialRfq.create({
      data: {
        buyerOrganizationId,
        operatorOrganizationId: operatorOrg.id,
        craftSkillId: 'weaving',
        title,
        specification: 'Synthetic cotton runner, exact version one.',
        designRequirements: 'Synthetic border and dimensions.',
        quantity: 20,
        deliveryAt: new Date('2027-12-01T00:00:00+01:00'),
        deliveryLocation: 'Synthetic Tunis site',
        status: 'ACCEPTED',
        procurementManaged: true,
        order: { create: { status: 'APPROVED' } },
      },
      include: { order: true },
    });
  const rfq = await makeOrder('Synthetic feedback order', buyerOrg.id);
  const otherRfq = await makeOrder('Synthetic feedback other order', buyerOrg.id);
  const foreignRfq = await makeOrder('Synthetic feedback foreign order', otherBuyerOrg.id);
  const orderId = rfq.order!.id;
  const otherOrderId = otherRfq.order!.id;
  const foreignOrderId = foreignRfq.order!.id;

  /** A synthetic shipment with a recorded operator delivery report, ready for buyer confirmation. */
  const shipments = new Map<string, string>();
  const seedShipment = async (targetOrderId: string, pieces: number) => {
    const offer = await db.commercialOffer.create({
      data: {
        orderId: targetOrderId,
        capacityDeclarationId: capacity.id,
        artisanProfileId: profile.id,
        quantity: pieces,
        unitPayMillimes: 3000n,
        estimatedHours: '2',
        expiresAt: new Date('2027-09-20T00:00:00Z'),
        materials: 'Synthetic materials',
        reworkTerms: 'Synthetic rework',
        paymentConditions: 'Synthetic payment',
        collectionArrangement: 'Association pickup',
        instructions: 'Synthetic instructions',
        status: 'ACCEPTED',
        associationOrganizationId: association.id,
        termsSha256: 'ab'.repeat(32),
      },
    });
    const batch = await db.commercialBatch.create({
      data: {
        orderId: targetOrderId,
        offerId: offer.id,
        artisanProfileId: profile.id,
        status: 'APPROVED',
        produced: pieces,
        submitted: pieces,
        approved: pieces,
      },
    });
    const preparation = await db.shipmentPreparation.create({
      data: {
        orderId: targetOrderId,
        actorId: operator.me.user.id,
        items: { create: { batchId: batch.id, quantity: pieces } },
      },
      include: { items: true },
    });
    const shipment = await db.shipment.create({
      data: {
        orderId: targetOrderId,
        status: 'DELIVERY_REPORTED',
        hub: 'Synthetic hub',
        destination: 'Synthetic Tunis site',
        actorId: operator.me.user.id,
        items: {
          create: { preparationItemId: preparation.items[0]!.id, quantity: pieces },
        },
        pickups: {
          create: {
            associationOrganizationId: association.id,
            hub: 'Synthetic hub',
            windowStart: new Date('2027-11-02T09:00:00Z'),
            windowEnd: new Date('2027-11-02T12:00:00Z'),
            coordinatorId: operator.me.user.id,
            operatorId: operator.me.user.id,
            quantity: pieces,
            actorId: operator.me.user.id,
          },
        },
        deliveryReport: {
          create: {
            quantity: pieces,
            actorId: operator.me.user.id,
            occurredAt: new Date('2026-10-02T13:00:00Z'),
          },
        },
      },
    });
    shipments.set(targetOrderId, shipment.id);
    return shipment.id;
  };
  const orderShipment = await seedShipment(orderId, 10);
  const otherShipment = await seedShipment(otherOrderId, 10);
  const foreignShipment = await seedShipment(foreignOrderId, 10);

  /** Confirms receipt through the real logistics authority and returns the confirmation id. */
  const confirmReceipt = async (
    who: Identity,
    targetOrderId: string,
    shipmentId: string,
    input: { received: number; accepted: number; missing: number; damaged: number },
  ) => {
    const view = await who.client.request(`${procurement}/orders/${targetOrderId}/shipments`);
    const target = (view.body as { items: { id: string; version: number }[] }).items.find(
      (row) => row.id === shipmentId,
    );
    assert.ok(target, 'the shipment is visible to its buyer');
    const confirmed = await post(
      who,
      `${procurement}/shipments/${shipmentId}/buyer-confirmations`,
      {
        version: target.version,
        received: input.received,
        accepted: input.accepted,
        missing: input.missing,
        damaged: input.damaged,
        occurredAt: '2026-10-02T14:00:00Z',
      },
    );
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
    const stored = await db.buyerDeliveryConfirmation.findUniqueOrThrow({
      where: { shipmentId },
    });
    return stored.id;
  };

  let receiptId = '';
  let feedbackId = '';
  let ticketId = '';
  const financialBefore = async () =>
    JSON.stringify({
      payables: await db.artisanPayable.count({ where: { orderId } }),
      adjustments: await db.financialAdjustment.count({ where: { orderId } }),
      disputes: await db.paymentDispute.count({ where: { orderId } }),
      receipts: await db.buyerDeliveryConfirmation.findMany({
        where: { shipment: { orderId } },
        select: { received: true, accepted: true, missing: true, damaged: true },
        orderBy: { id: 'asc' },
      }),
      closure: await db.orderClosureAssessment.count({ where: { orderId } }),
      delivered: (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).delivered,
      status: (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
      acceptances: await db.procurementAcceptance.count({ where: { orderId } }),
      terms: (
        await db.commercialOffer.findMany({
          where: { orderId },
          select: { id: true, unitPayMillimes: true, quantity: true, status: true },
          orderBy: { id: 'asc' },
        })
      ).map((row) => ({ ...row, unitPayMillimes: row.unitPayMillimes.toString() })),
    });

  await check(
    'E18-06 receipt eligibility is enforced before any private assessment exists',
    async () => {
      // An operator delivery report is not buyer receipt.
      const beforeReceipt = await post(buyer, `${root}/orders/${orderId}/feedback`, {
        receiptConfirmationId: 'not-a-receipt',
        category: 'OVERALL',
      });
      assert.equal(beforeReceipt.status, 409, JSON.stringify(beforeReceipt.body));
      assert.equal(code(beforeReceipt), 'NO_CONFIRMED_RECEIPT');
      assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 0);
      // A receipt from another order of the same buyer is not this order's receipt.
      const otherReceipt = await confirmReceipt(buyer, otherOrderId, otherShipment, {
        received: 10,
        accepted: 10,
        missing: 0,
        damaged: 0,
      });
      const crossOrder = await post(buyer, `${root}/orders/${orderId}/feedback`, {
        receiptConfirmationId: otherReceipt,
        category: 'OVERALL',
      });
      assert.equal(crossOrder.status, 409, JSON.stringify(crossOrder.body));
      assert.equal(code(crossOrder), 'RECEIPT_ORDER_MISMATCH');
      assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 0);
      // Partial and damaged receipts stay eligible even with zero accepted pieces.
      const partial = await confirmReceipt(buyer, orderId, orderShipment, {
        received: 7,
        accepted: 0,
        missing: 3,
        damaged: 7,
      });
      receiptId = partial;
      const eligible = await buyer.client.request(`${root}/order-feedback?orderId=${orderId}`);
      assert.equal(eligible.status, 200, JSON.stringify(eligible.body));
      const receipts = (eligible.body as { eligibleReceipts: { confirmationId: string }[] })
        .eligibleReceipts;
      assert.deepEqual(
        receipts.map((row) => row.confirmationId),
        [receiptId],
        'only confirmations on this exact order with received > 0 are offered',
      );
      assert.equal(
        JSON.stringify(eligible.body).includes('note'),
        false,
        'receipt notes are excluded',
      );
    },
  );

  await check(
    'E18-06 a fully missing delivery must use the existing claim workflow, not feedback',
    async () => {
      const missingRfq = await makeOrder('Synthetic feedback missing order', buyerOrg.id);
      const missingOrderId = missingRfq.order!.id;
      const missingShipment = await seedShipment(missingOrderId, 10);
      const zeroReceipt = await confirmReceipt(buyer, missingOrderId, missingShipment, {
        received: 0,
        accepted: 0,
        missing: 10,
        damaged: 0,
      });
      const refused = await post(buyer, `${root}/orders/${missingOrderId}/feedback`, {
        receiptConfirmationId: zeroReceipt,
        category: 'DELIVERY',
        comment: 'Nothing arrived.',
      });
      assert.equal(refused.status, 409, JSON.stringify(refused.body));
      assert.equal(code(refused), 'NO_CONFIRMED_RECEIPT');
      assert.equal(await db.buyerOrderFeedback.count({ where: { orderId: missingOrderId } }), 0);
      // The missing-delivery claim path still works without a satisfaction assessment.
      const claim = await post(buyer, `${root}/tickets`, {
        category: 'COMMERCIAL',
        relatedType: 'ORDER',
        relatedId: missingOrderId,
        description: 'Synthetic missing-delivery claim: nothing was received.',
      });
      assert.equal(claim.status, 201, JSON.stringify(claim.body));
    },
  );

  await check(
    'E18-06 buyer feedback requires buyer order authority and an exact receipt',
    async () => {
      const body = {
        receiptConfirmationId: receiptId,
        category: 'DELIVERY',
        rating: 2,
        comment: 'Three pieces were missing and the rest arrived damaged.',
      };
      assert.equal(
        (
          await post(operator, `${root}/orders/${orderId}/feedback`, {
            receiptConfirmationId: receiptId,
            category: 'OVERALL',
          })
        ).status,
        403,
        'an operator cannot author buyer feedback',
      );
      assert.equal(
        (
          await post(artisan, `${root}/orders/${orderId}/feedback`, {
            receiptConfirmationId: receiptId,
            category: 'OVERALL',
          })
        ).status,
        404,
        'an artisan or coordinator outside this buyer and operator scope learns nothing',
      );
      assert.equal(
        (
          await post(outsider, `${root}/orders/${orderId}/feedback`, {
            receiptConfirmationId: receiptId,
            category: 'OVERALL',
          })
        ).status,
        404,
        'a different tenant cannot see this order',
      );
      assert.equal(
        (
          await post(buyer, `${root}/orders/${orderId}/feedback`, {
            ...body,
            reporterId: operator.me.user.id,
          })
        ).status,
        400,
        'the client cannot choose the reporter',
      );
      assert.equal(
        (await post(buyer, `${root}/orders/${orderId}/feedback`, { ...body, rating: 9 })).status,
        400,
      );
      assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 0);

      const created = await post(buyer, `${root}/orders/${orderId}/feedback`, body);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const saved = created.body as {
        id: string;
        version: number;
        followUpStatus: string;
        sourceClass: string;
      };
      feedbackId = saved.id;
      assert.equal(saved.version, 1);
      assert.equal(saved.followUpStatus, 'OPEN');
      assert.equal(saved.sourceClass, 'OPERATIONAL_USER_SUBMITTED');
      const header = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      assert.equal(header.reporterId, buyer.me.user.id, 'the actor is recorded by the server');
      assert.equal(header.receiptConfirmationId, receiptId);
      assert.equal(header.orderId, orderId);
      assert.equal(header.scenarioId, null);
      const revision = await db.buyerOrderFeedbackRevision.findFirstOrThrow({
        where: { feedbackId },
      });
      assert.equal(revision.kind, 'SUBMITTED');
      assert.equal(revision.category, 'DELIVERY');
      assert.equal(revision.rating, 2);
      assert.equal(revision.followUpStatus, 'OPEN');
      assert.equal(revision.followUpOwnerId, null);
    },
  );

  await check(
    'E18-06 private assessments are not shared with another buyer employee or tenant',
    async () => {
      const own = await buyer.client.request(`${root}/order-feedback?orderId=${orderId}`);
      assert.equal(own.status, 200);
      assert.deepEqual(
        (own.body as { items: { id: string }[] }).items.map((row) => row.id),
        [feedbackId],
      );
      const colleagueView = await colleague.client.request(
        `${root}/order-feedback?orderId=${orderId}`,
      );
      assert.equal(colleagueView.status, 200);
      assert.deepEqual(
        (colleagueView.body as { items: unknown[] }).items,
        [],
        'another employee does not automatically see the private assessment',
      );
      assert.equal(
        (await colleague.client.request(`${root}/order-feedback/${feedbackId}/history`)).status,
        404,
        'another employee cannot open the author history',
      );
      assert.equal(
        JSON.stringify((await colleague.client.request(root)).body).includes(feedbackId),
        false,
      );
      assert.equal(
        (await outsider.client.request(`${root}/order-feedback?orderId=${orderId}`)).status,
        404,
      );
      assert.equal(
        (await outsider.client.request(`${root}/order-feedback/${feedbackId}/history`)).status,
        404,
      );
      assert.equal(
        (await artisan.client.request(`${root}/order-feedback/${feedbackId}/history`)).status,
        404,
        'an artisan cannot read buyer feedback',
      );
      // Support must be scoped: an operator without support.case.manage in this organization is denied.
      const unsupported = await operator.client.request(
        `${root}/order-feedback/${feedbackId}/history`,
      );
      assert.equal(unsupported.status, 404);
      const supported = await support.client.request(
        `${root}/order-feedback/${feedbackId}/history`,
      );
      assert.equal(supported.status, 200, JSON.stringify(supported.body));
      const history = supported.body as {
        items: { kind: string; followUpNote: string | null }[];
      };
      assert.equal(history.items[0]!.kind, 'SUBMITTED');
      assert.notEqual(
        history.items[0]!.followUpNote,
        undefined,
        'support sees its own follow-up notes',
      );
    },
  );

  await check(
    'E18-06 duplicate creation, replay and stale versions never rewrite accepted history',
    async () => {
      const duplicate = await post(buyer, `${root}/orders/${orderId}/feedback`, {
        receiptConfirmationId: receiptId,
        category: 'OVERALL',
      });
      assert.equal(duplicate.status, 409);
      assert.equal(code(duplicate), 'DUPLICATE_FEEDBACK');
      assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 1);

      const key = randomUUID();
      const payload = {
        expectedVersion: 1,
        category: 'QUALITY',
        rating: 3,
        comment: 'The weave is uneven where the pieces were damaged.',
        reason: 'Corrected the category to quality.',
      };
      const corrected = await post(
        buyer,
        `${root}/order-feedback/${feedbackId}/corrections`,
        payload,
        key,
      );
      assert.equal(corrected.status, 201, JSON.stringify(corrected.body));
      assert.equal((corrected.body as { version: number }).version, 2);
      const replay = await post(
        buyer,
        `${root}/order-feedback/${feedbackId}/corrections`,
        payload,
        key,
      );
      assert.deepEqual(replay.body, corrected.body, 'same-key replay returns the original result');
      assert.equal(
        (
          await post(
            buyer,
            `${root}/order-feedback/${feedbackId}/corrections`,
            { ...payload, category: 'DELIVERY' },
            key,
          )
        ).status,
        409,
        'a changed payload under the same key conflicts',
      );
      const stale = await post(buyer, `${root}/order-feedback/${feedbackId}/corrections`, {
        ...payload,
        comment: 'Should not be accepted.',
      });
      assert.equal(stale.status, 409);
      assert.equal(code(stale), 'STALE_VERSION');
      const original = await db.buyerOrderFeedbackRevision.findFirstOrThrow({
        where: { feedbackId, version: 1 },
      });
      assert.equal(original.category, 'DELIVERY');
      assert.equal(original.rating, 2);
      assert.equal(
        original.comment,
        'Three pieces were missing and the rest arrived damaged.',
        'the original statement survives correction',
      );
      assert.equal(await db.buyerOrderFeedbackRevision.count({ where: { feedbackId } }), 2);
      assert.equal(
        (await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } }))
          .currentVersion,
        2,
      );
      // Another buyer employee cannot rewrite someone else's assessment.
      assert.equal(
        (
          await post(colleague, `${root}/order-feedback/${feedbackId}/corrections`, {
            expectedVersion: 2,
            category: 'OVERALL',
            comment: 'Unauthorized rewrite.',
            reason: 'Unauthorized',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await post(operator, `${root}/order-feedback/${feedbackId}/corrections`, {
            expectedVersion: 2,
            category: 'OVERALL',
            comment: 'Support rewriting the buyer.',
            reason: 'Unauthorized',
          })
        ).status,
        404,
      );
    },
  );

  await check(
    'E18-06 support follow-up preserves the buyer words and rejects an invalid owner',
    async () => {
      const invalidOwner = await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
        expectedVersion: 2,
        status: 'FOLLOW_UP',
        ownerId: operator.me.user.id,
        note: 'Should not be accepted.',
        reason: 'Attempted invalid owner',
      });
      assert.equal(invalidOwner.status, 403, JSON.stringify(invalidOwner.body));
      assert.equal(code(invalidOwner), 'INVALID_OWNER');
      assert.equal(
        (
          await post(buyer, `${root}/order-feedback/${feedbackId}/follow-up`, {
            expectedVersion: 2,
            status: 'FOLLOW_UP',
            ownerId: support.me.user.id,
            reason: 'Buyer cannot assign follow-up',
          })
        ).status,
        403,
        'the buyer cannot manage follow-up',
      );
      const missingOwner = await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
        expectedVersion: 2,
        status: 'FOLLOW_UP',
        note: 'No owner given.',
        reason: 'Attempted assignment without owner',
      });
      assert.equal(missingOwner.status, 400);
      assert.equal(code(missingOwner), 'OWNER_REQUIRED');

      const followUp = await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
        expectedVersion: 2,
        status: 'FOLLOW_UP',
        ownerId: support.me.user.id,
        note: 'Internal: opening a formal claim for the three missing pieces.',
        reason: 'Assigned to the support manager for this buyer',
      });
      assert.equal(followUp.status, 201, JSON.stringify(followUp.body));
      assert.equal((followUp.body as { version: number }).version, 3);
      assert.equal((followUp.body as { followUpStatus: string }).followUpStatus, 'FOLLOW_UP');
      const revision = await db.buyerOrderFeedbackRevision.findFirstOrThrow({
        where: { feedbackId, version: 3 },
      });
      assert.equal(revision.kind, 'FOLLOW_UP');
      assert.equal(revision.rating, 3, 'support does not change buyer-owned fields');
      assert.equal(
        revision.comment,
        'The weave is uneven where the pieces were damaged.',
        'support follow-up preserves the buyer comment',
      );
      assert.equal(revision.category, 'QUALITY');
      assert.equal(revision.followUpOwnerId, support.me.user.id);
      assert.equal(revision.actorId, support.me.user.id);
      // The buyer sees the status but never the internal note.
      const buyerHistory = await buyer.client.request(
        `${root}/order-feedback/${feedbackId}/history`,
      );
      assert.equal(buyerHistory.status, 200);
      const buyerItems = (buyerHistory.body as { items: { followUpNote: string | null }[] }).items;
      assert.ok(buyerItems.every((item) => item.followUpNote === null));
      assert.equal(
        JSON.stringify(buyerHistory.body).includes('opening a formal claim'),
        false,
        'internal follow-up notes are withheld from the buyer',
      );
      // A revoked assignment immediately removes the scoped support authority.
      await db.operatorAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: new Date() },
      });
      assert.equal(
        (
          await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
            expectedVersion: 3,
            status: 'RESOLVED',
            note: 'Should not accept.',
            reason: 'Attempted after revocation',
          })
        ).status,
        404,
      );
      assert.equal(
        (await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } }))
          .currentVersion,
        3,
      );
      await db.operatorAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: null },
      });
    },
  );

  await check('E18-06 an inaccessible claim cannot be linked even by scoped support', async () => {
    // A ticket in a different operator organization is invisible to this support actor.
    const foreignOperator = await organization(
      'Feedback foreign operator',
      'INTERNAL',
      buyer.me.user.id,
      'NASJ_OPERATOR',
    );
    const privateTicket = await db.supportTicket.create({
      data: {
        category: 'COMMERCIAL',
        relatedType: 'ORDER',
        relatedId: orderId,
        reporterId: buyer.me.user.id,
        organizationId: foreignOperator.id,
        description: 'Synthetic claim recorded under another operating organization.',
        status: 'OPEN',
      },
    });
    const refused = await post(support, `${root}/order-feedback/${feedbackId}/case-link`, {
      expectedVersion: 3,
      ticketId: privateTicket.id,
      reason: 'Attempted inaccessible ticket link',
    });
    assert.equal(refused.status, 404, JSON.stringify(refused.body));
    assert.equal(code(refused), 'NOT_FOUND');
    assert.equal(
      (await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } })).currentVersion,
      3,
      'no revision is written for an inaccessible claim',
    );
    assert.equal(
      await db.supportTicketEvent.count({
        where: { ticketId: privateTicket.id, kind: 'FEEDBACK_LINKED' },
      }),
      0,
    );
  });

  await check(
    'E18-06 an existing formal order claim is linked separately from the assessment',
    async () => {
      const created = await post(buyer, `${root}/tickets`, {
        category: 'COMMERCIAL',
        relatedType: 'ORDER',
        relatedId: orderId,
        description: 'Synthetic claim for the three missing and seven damaged pieces.',
        priority: 'HIGH',
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      ticketId = (created.body as { id: string }).id;
      const foreignTicket = await post(operator, `${root}/tickets`, {
        category: 'COMMERCIAL',
        relatedType: 'ORDER',
        relatedId: otherOrderId,
        description: 'Synthetic claim on a different order.',
      });
      assert.equal(foreignTicket.status, 201);
      const crossOrderTicketId = (foreignTicket.body as { id: string }).id;
      // A ticket for another order never links, even with correct operator scope.
      const crossOrder = await post(support, `${root}/order-feedback/${feedbackId}/case-link`, {
        expectedVersion: 3,
        ticketId: crossOrderTicketId,
        reason: 'Attempted cross-order link',
      });
      assert.equal(crossOrder.status, 409, JSON.stringify(crossOrder.body));
      assert.equal(code(crossOrder), 'CASE_ORDER_MISMATCH');
      // An outsider cannot link someone else's feedback at all.
      assert.equal(
        (
          await post(outsider, `${root}/order-feedback/${feedbackId}/case-link`, {
            expectedVersion: 3,
            ticketId,
            reason: 'Unauthorized link',
          })
        ).status,
        404,
      );
      const linked = await post(support, `${root}/order-feedback/${feedbackId}/case-link`, {
        expectedVersion: 3,
        ticketId,
        reason: 'Link the buyer claim opened for these pieces',
      });
      assert.equal(linked.status, 201, JSON.stringify(linked.body));
      assert.equal((linked.body as { version: number }).version, 4);
      assert.equal((linked.body as { linkedTicketId: string }).linkedTicketId, ticketId);
      const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
      assert.equal(ticket.status, 'OPEN', 'linking never changes the case status');
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
        'APPROVED',
        'linking never closes the order',
      );
      const revision = await db.buyerOrderFeedbackRevision.findFirstOrThrow({
        where: { feedbackId, version: 4 },
      });
      assert.equal(revision.linkedTicketId, ticketId);
      assert.equal(revision.comment, 'The weave is uneven where the pieces were damaged.');
      assert.equal(revision.followUpStatus, 'FOLLOW_UP');
      assert.equal(
        await db.supportTicketEvent.count({ where: { ticketId, kind: 'FEEDBACK_LINKED' } }),
        1,
      );
      // The buyer sees the claim status through the existing ticket authority only.
      const buyerView = await buyer.client.request(`${root}/order-feedback?orderId=${orderId}`);
      const item = (
        buyerView.body as { items: { linkedTicketId: string; linkedTicketStatus: string }[] }
      ).items[0]!;
      assert.equal(item.linkedTicketId, ticketId);
      assert.equal(item.linkedTicketStatus, 'OPEN');
      // Resolving the follow-up does not resolve the claim.
      const resolved = await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
        expectedVersion: 4,
        status: 'RESOLVED',
        ownerId: support.me.user.id,
        note: 'Support answered the buyer and the claim remains open.',
        reason: 'Buyer informed; the formal claim continues under its own lifecycle',
      });
      assert.equal(resolved.status, 201, JSON.stringify(resolved.body));
      assert.equal((resolved.body as { followUpStatus: string }).followUpStatus, 'RESOLVED');
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status,
        'OPEN',
        'a resolved follow-up never resolves a claim',
      );
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
        'APPROVED',
      );
      // Reopening requires a stated reason, and the resolved state cannot silently loop to itself.
      assert.equal(
        (
          await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
            expectedVersion: 5,
            status: 'FOLLOW_UP',
            ownerId: support.me.user.id,
            reason: '',
          })
        ).status,
        400,
        'a resolved follow-up cannot silently reopen',
      );
      assert.equal(
        (
          await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
            expectedVersion: 5,
            status: 'RESOLVED',
            ownerId: support.me.user.id,
            reason: 'Already resolved',
          })
        ).status,
        409,
        'RESOLVED is a terminal follow-up state until explicitly reopened',
      );
      const reopened = await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
        expectedVersion: 5,
        status: 'FOLLOW_UP',
        ownerId: support.me.user.id,
        note: 'Internal: reopened because the claim moved to review.',
        reason: 'Claim update requires renewed attention',
      });
      assert.equal(reopened.status, 201, JSON.stringify(reopened.body));
      const latest = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      assert.equal(latest.currentVersion, 6);
      assert.equal(
        await db.buyerOrderFeedbackRevision.count({ where: { feedbackId } }),
        6,
        'every accepted revision is retained',
      );
    },
  );

  await check(
    'E18-06 concurrent buyer correction and support follow-up never lose accepted history',
    async () => {
      const current = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      const [correction, followUp] = await Promise.all([
        post(buyer, `${root}/order-feedback/${feedbackId}/corrections`, {
          expectedVersion: current.currentVersion,
          category: 'COMMUNICATION',
          rating: 4,
          comment: 'Support contacted me quickly after the claim was linked.',
          reason: 'Updated after the support response',
        }),
        post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
          expectedVersion: current.currentVersion,
          status: 'RESOLVED',
          ownerId: support.me.user.id,
          note: 'Internal: claim tracked separately.',
          reason: 'Follow-up answered',
        }),
      ]);
      assert.deepEqual(
        [correction.status, followUp.status].sort(),
        [201, 409],
        'the advisory lock serializes the two commands and the stale one conflicts',
      );
      const accepted = correction.status === 201 ? correction : followUp;
      const stored = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      assert.equal(stored.currentVersion, current.currentVersion + 1);
      assert.ok((accepted.body as { version: number }).version);
      assert.equal(
        await db.buyerOrderFeedbackRevision.count({ where: { feedbackId } }),
        stored.currentVersion,
        'no accepted revision is lost or duplicated',
      );
      const versions = await db.buyerOrderFeedbackRevision.findMany({
        where: { feedbackId },
        select: { version: true },
        orderBy: { version: 'asc' },
      });
      assert.deepEqual(
        versions.map((row) => row.version),
        Array.from({ length: stored.currentVersion }, (_unused, index) => index + 1),
        'versions advance monotonically from one',
      );
    },
  );

  await check(
    'E18-06 revoked buyer membership removes feedback authority immediately',
    async () => {
      const membership = await db.organizationMember.findFirstOrThrow({
        where: { userId: buyer.me.user.id, organizationId: buyerOrg.id },
      });
      let current = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      const retainedKey = randomUUID();
      const retainedInput = {
        expectedVersion: current.currentVersion,
        category: 'OVERALL',
        reason: 'Synthetic command accepted before membership revocation',
      };
      assert.equal(
        (
          await post(
            buyer,
            `${root}/order-feedback/${feedbackId}/corrections`,
            retainedInput,
            retainedKey,
          )
        ).status,
        201,
      );
      current = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED' },
      });
      assert.equal(
        (
          await post(
            buyer,
            `${root}/order-feedback/${feedbackId}/corrections`,
            retainedInput,
            retainedKey,
          )
        ).status,
        404,
        'a retained receipt is not authority after membership revocation',
      );
      assert.equal(
        (await buyer.client.request(`${root}/order-feedback?orderId=${orderId}`)).status,
        404,
      );
      assert.equal(
        (await buyer.client.request(`${root}/order-feedback/${feedbackId}/history`)).status,
        404,
      );
      assert.equal(
        (
          await post(buyer, `${root}/order-feedback/${feedbackId}/corrections`, {
            expectedVersion: current.currentVersion,
            category: 'OVERALL',
            reason: 'Attempted after revocation',
          })
        ).status,
        404,
      );
      assert.equal(
        (await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } }))
          .currentVersion,
        current.currentVersion,
      );
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
    },
  );

  await check(
    'E18-06 database constraints reject duplicate aggregates, bad ratings and history rewrites',
    async () => {
      await assert.rejects(
        db.buyerOrderFeedback.create({
          data: {
            orderId,
            reporterId: buyer.me.user.id,
            receiptConfirmationId: receiptId,
            sourceClass: 'OPERATIONAL_USER_SUBMITTED',
          },
        }),
        (error: unknown) => (error as { code?: string }).code === 'P2002',
        'one assessment per order and buyer author',
      );
      const header = await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
      await assert.rejects(
        db.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId,
            version: header.currentVersion + 5,
            kind: 'BUYER_CORRECTION',
            actorId: buyer.me.user.id,
            category: 'OVERALL',
            rating: 6,
            reason: 'Invalid rating and version jump',
          },
        }),
        /rating|version/i,
      );
      await assert.rejects(
        db.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId,
            version: header.currentVersion,
            kind: 'BUYER_CORRECTION',
            actorId: buyer.me.user.id,
            category: 'OVERALL',
            reason: 'Duplicate version',
          },
        }),
        /version/i,
      );
      const revision = await db.buyerOrderFeedbackRevision.findFirstOrThrow({
        where: { feedbackId },
      });
      await assert.rejects(
        db.buyerOrderFeedbackRevision.update({
          where: { id: revision.id },
          data: { comment: 'Rewritten history' },
        }),
        /append-only/i,
      );
      await assert.rejects(
        db.buyerOrderFeedbackRevision.delete({ where: { id: revision.id } }),
        /append-only/i,
      );
      await assert.rejects(
        db.buyerOrderFeedback.update({
          where: { id: feedbackId },
          data: { receiptConfirmationId: 'another-receipt' },
        }),
        /immutable/i,
      );
      await assert.rejects(
        db.buyerOrderFeedback.update({
          where: { id: feedbackId },
          data: { currentVersion: { increment: 3 } },
        }),
        /exactly one/i,
      );
      await assert.rejects(
        db.buyerOrderFeedback.delete({ where: { id: feedbackId } }),
        /append-only/i,
      );
      // A failed insert leaves no partial history.
      const beforeVersions = await db.buyerOrderFeedbackRevision.count({ where: { feedbackId } });
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.buyerOrderFeedbackRevision.create({
            data: {
              feedbackId,
              version: header.currentVersion + 1,
              kind: 'BUYER_CORRECTION',
              actorId: buyer.me.user.id,
              category: 'OVERALL',
              reason: 'Rolled back attempt',
            },
          });
          await tx.supportTicketEvent.create({
            data: { ticketId: 'missing-ticket', actorId: buyer.me.user.id, kind: 'X', detail: 'x' },
          });
        }),
      );
      assert.equal(
        await db.buyerOrderFeedbackRevision.count({ where: { feedbackId } }),
        beforeVersions,
        'a failed transaction leaves no partial revision',
      );
      // A receipt with zero received cannot back an assessment, and a foreign order's receipt cannot either.
      const foreignReceipt = await confirmReceipt(outsider, foreignOrderId, foreignShipment, {
        received: 10,
        accepted: 10,
        missing: 0,
        damaged: 0,
      });
      await assert.rejects(
        db.buyerOrderFeedback.create({
          data: {
            orderId,
            reporterId: colleague.me.user.id,
            receiptConfirmationId: foreignReceipt,
            sourceClass: 'OPERATIONAL_USER_SUBMITTED',
          },
        }),
        /exact order/i,
      );
    },
  );

  await check('E18-06 feedback and case linkage change no financial or receipt state', async () => {
    const before = await financialBefore();
    await post(support, `${root}/order-feedback/${feedbackId}/follow-up`, {
      expectedVersion: (
        await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } })
      ).currentVersion,
      status: 'RESOLVED',
      ownerId: support.me.user.id,
      note: 'Non-financial confirmation.',
      reason: 'Confirming no financial consequence',
    });
    await post(support, `${root}/order-feedback/${feedbackId}/case-link`, {
      expectedVersion: (
        await db.buyerOrderFeedback.findUniqueOrThrow({ where: { id: feedbackId } })
      ).currentVersion,
      ticketId,
      reason: 'Re-affirm the existing claim link',
    });
    assert.equal(await financialBefore(), before, 'feedback never touches financial state');
    assert.equal(
      (await db.buyerDeliveryConfirmation.findUniqueOrThrow({ where: { id: receiptId } })).received,
      7,
      'receipt quantities remain authoritative',
    );
  });

  await check('E18-06 subject export includes only the reporter assessments', async () => {
    const exported = await buyer.client.request('/api/v1/privacy/export');
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    const payload = exported.body as {
      orderFeedback: {
        id: string;
        revisions: { followUpNote: string | null; comment: string }[];
      }[];
    };
    assert.deepEqual(
      payload.orderFeedback.map((row) => row.id),
      [feedbackId],
    );
    assert.ok(payload.orderFeedback[0]!.revisions.length >= 2);
    assert.ok(
      payload.orderFeedback[0]!.revisions.every((row) => row.followUpNote === null),
      'internal support notes are withheld from the subject export',
    );
    assert.equal(JSON.stringify(exported.body).includes('Internal: opening a formal claim'), false);
    const colleagueExport = await colleague.client.request('/api/v1/privacy/export');
    assert.deepEqual((colleagueExport.body as { orderFeedback: unknown[] }).orderFeedback, []);
    assert.equal(
      JSON.stringify(colleagueExport.body).includes(
        'Three pieces were missing and the rest arrived damaged.',
      ),
      false,
    );
  });
}
