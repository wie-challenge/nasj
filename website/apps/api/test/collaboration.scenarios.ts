import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
type Fixture = {
  db: PrismaService;
  buyer: Identity;
  operator: Identity;
  artisan: Identity;
  outsider: Identity;
  admin: Identity;
  orderId: string;
  profileId: string;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
export async function runCollaborationScenarios({
  db,
  buyer,
  operator,
  artisan,
  outsider,
  admin,
  orderId,
  profileId,
  check,
}: Fixture) {
  const post = async (who: Identity, path: string, body: unknown, key = randomUUID()) => {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  };
  const expectCreated = <T>(r: Result) => {
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body as T;
  };
  const root = '/api/v1/collaboration';
  let counterId = '',
    revisedId = '',
    batchId = '';
  await check(
    'counteroffer reissues exact versioned terms; manager review creates no commitment',
    async () => {
      const assessment = await db.eligibilityAssessment.findFirstOrThrow({
        where: { orderId, artisanProfileId: profileId },
        orderBy: { version: 'desc' },
      });
      const order = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      const prepared = expectCreated<{ id: string; version: number }>(
        await post(operator, `/api/v1/procurement/orders/${orderId}/offers`, {
          version: order.version,
          eligibilityId: assessment.id,
          quantity: 10,
          expiresAt: '2027-09-20T00:00:00Z',
          materials: 'Synthetic materials',
          reworkTerms: 'Synthetic rework',
          paymentConditions: 'Synthetic payment',
          collectionArrangement: 'Synthetic collection',
          instructions: 'Synthetic instructions',
        }),
      );
      expectCreated(
        await post(operator, `/api/v1/procurement/offers/${prepared.id}/issue`, {
          version: prepared.version,
        }),
      );
      const counterPreviewBody = {
        offerId: prepared.id,
        expectedVersion: (
          await db.commercialOffer.findUniqueOrThrow({ where: { id: prepared.id } })
        ).version,
        proposedQuantity: 5,
        proposedDeadline: '2027-09-12T00:00:00Z',
      };
      const previewCount = await db.counteroffer.count({ where: { offerId: prepared.id } });
      const preview = await post(artisan, `${root}/counteroffers/preview`, counterPreviewBody);
      assert.equal(preview.status, 201);
      assert.equal(
        (preview.body as { original: { quantity: number }; proposed: { quantity: number } })
          .original.quantity,
        10,
      );
      assert.equal((preview.body as { proposed: { quantity: number } }).proposed.quantity, 5);
      assert.equal(
        await db.counteroffer.count({ where: { offerId: prepared.id } }),
        previewCount,
        'preview never persists a counteroffer',
      );
      assert.equal(
        (await post(outsider, `${root}/counteroffers/preview`, counterPreviewBody)).status,
        404,
      );
      assert.equal(
        (
          await post(artisan, `${root}/counteroffers`, {
            ...counterPreviewBody,
            expectedVersion: counterPreviewBody.expectedVersion + 1,
          })
        ).status,
        409,
      );
      assert.equal(await db.counteroffer.count({ where: { offerId: prepared.id } }), previewCount);
      const initialBatches = await db.commercialBatch.count({ where: { orderId } });
      const expiry = (await db.commercialOffer.findUniqueOrThrow({ where: { id: prepared.id } }))
        .expiresAt;
      await db.commercialOffer.update({
        where: { id: prepared.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (
          await post(artisan, `${root}/counteroffers`, {
            offerId: prepared.id,
            proposedQuantity: 5,
            proposedDeadline: '2027-09-12T00:00:00Z',
          })
        ).status,
        409,
      );
      await db.commercialOffer.update({ where: { id: prepared.id }, data: { expiresAt: expiry } });
      const tooLarge = expectCreated<{ id: string }>(
        await post(artisan, `${root}/counteroffers`, {
          offerId: prepared.id,
          proposedQuantity: 11,
          proposedDeadline: '2027-09-12T00:00:00Z',
        }),
      );
      assert.equal(
        (
          await post(operator, `${root}/counteroffers/${tooLarge.id}/review`, {
            decision: 'APPROVE_TERMS',
          })
        ).status,
        409,
      );
      assert.equal(
        (await db.commercialOffer.findUniqueOrThrow({ where: { id: prepared.id } })).status,
        'OFFERED',
        'failed revised capacity check rolls back replacement',
      );
      const refused = expectCreated<{ id: string }>(
        await post(artisan, `${root}/counteroffers`, {
          offerId: prepared.id,
          proposedQuantity: 4,
          proposedDeadline: '2027-09-12T00:00:00Z',
        }),
      );
      expectCreated(
        await post(operator, `${root}/counteroffers/${refused.id}/review`, { decision: 'DECLINE' }),
      );
      assert.equal(await db.commercialBatch.count({ where: { orderId } }), initialBatches);
      const counter = expectCreated<{ id: string }>(
        await post(artisan, `${root}/counteroffers`, {
          offerId: prepared.id,
          proposedQuantity: 5,
          proposedDeadline: '2027-09-12T00:00:00Z',
          clarification: 'Synthetic lower quantity',
        }),
      );
      counterId = counter.id;
      const savedTerms = (await db.counteroffer.findUniqueOrThrow({ where: { id: counterId } }))
        .originalTerms as { quantity: number; totalPayTnd: string; effort: string };
      assert.equal(savedTerms.quantity, 10, 'original terms snapshotted before manager review');
      assert.ok(savedTerms.totalPayTnd);
      assert.ok(savedTerms.effort);
      const buyerOrganizationId = (
        await db.commercialOrder.findUniqueOrThrow({
          where: { id: orderId },
          include: { rfq: true },
        })
      ).rfq.buyerOrganizationId;
      const assignment = await db.operatorAssignment.findFirstOrThrow({
        where: {
          operatorId: operator.me.user.id,
          organizationId: buyerOrganizationId,
          revokedAt: null,
        },
      });
      await db.operatorAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: new Date() },
      });
      try {
        const noReview = (await operator.client.request(root)).body as {
          counteroffers: { id: string; canReview: boolean }[];
        };
        assert.equal(noReview.counteroffers.find((c) => c.id === counterId)?.canReview, false);
        assert.equal(
          (
            await post(operator, `${root}/counteroffers/${counterId}/review`, {
              decision: 'APPROVE_TERMS',
            })
          ).status,
          403,
          'revoked buyer assignment cannot review changed terms',
        );
      } finally {
        await db.operatorAssignment.update({
          where: { id: assignment.id },
          data: { revokedAt: null },
        });
      }

      const before = await db.commercialBatch.count({ where: { orderId } });
      assert.equal(
        (
          await post(outsider, `${root}/counteroffers/${counterId}/review`, {
            decision: 'APPROVE_TERMS',
            note: '',
          })
        ).status,
        403,
      );
      const reviewed = expectCreated<{ revisedOfferId: string; createsAgreement: boolean }>(
        await post(operator, `${root}/counteroffers/${counterId}/review`, {
          decision: 'APPROVE_TERMS',
          note: 'Synthetic manager review',
        }),
      );
      revisedId = reviewed.revisedOfferId;
      assert.equal(reviewed.createsAgreement, false);
      assert.equal(await db.commercialBatch.count({ where: { orderId } }), before);
      const old = await db.commercialOffer.findUniqueOrThrow({ where: { id: prepared.id } });
      assert.equal(old.status, 'REPLACED');
      assert.equal(old.quantity, 10);
      const revised = await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } });
      assert.equal(revised.quantity, 5);
      assert.equal(revised.deliveryDeadline?.toISOString(), '2027-09-12T00:00:00.000Z');
      const displayed = (await artisan.client.request('/api/v1/commerce/workspace')).body as {
        offers: Array<{ id: string; deliveryAt: string; specification: string }>;
      };
      assert.equal(
        displayed.offers.find((offer) => offer.id === revisedId)?.deliveryAt,
        revised.deliveryDeadline?.toISOString(),
      );

      assert.equal(
        (await post(artisan, `${root}/counteroffers/${counterId}/accept`, {})).status,
        409,
      );
      assert.equal(
        (
          await post(outsider, `/api/v1/commerce/offers/${revisedId}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: revised.version,
            termsSha256: revised.termsSha256,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await post(artisan, `/api/v1/commerce/offers/${revisedId}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: revised.version,
            termsSha256: 'a'.repeat(64),
          })
        ).status,
        409,
      );
      const requests = await Promise.all(
        [1, 2].map(() =>
          post(artisan, `/api/v1/commerce/offers/${revisedId}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: revised.version,
            termsSha256: revised.termsSha256,
          }),
        ),
      );
      assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await db.commercialBatch.count({ where: { offerId: revisedId } }), 1);
      assert.equal(
        (await post(outsider, `${root}/counteroffers/${counterId}/accept`, {})).status,
        403,
      );
      assert.equal(
        (await db.counteroffer.findUniqueOrThrow({ where: { id: counterId } })).status,
        'MANAGER_REVIEW',
      );
      const key = randomUUID();
      const confirmed = expectCreated<{ createsAgreement: boolean }>(
        await post(artisan, `${root}/counteroffers/${counterId}/accept`, {}, key),
      );
      assert.equal(confirmed.createsAgreement, true);
      assert.deepEqual(
        (await post(artisan, `${root}/counteroffers/${counterId}/accept`, {}, key)).body,
        confirmed,
      );
      batchId = (await db.commercialBatch.findUniqueOrThrow({ where: { offerId: revisedId } })).id;
    },
  );
  await check(
    'schedule consent denies platform substitution and preserves old deadline until both approvals',
    async () => {
      const proposal = expectCreated<{ id: string }>(
        await post(operator, `${root}/schedule-revisions`, {
          batchId,
          proposedDeadline: '2027-09-11T12:00:00Z',
          reason: 'Synthetic disruption review',
        }),
      );
      const stale = expectCreated<{ id: string }>(
        await post(operator, `${root}/schedule-revisions`, {
          batchId,
          proposedDeadline: '2027-09-10T12:00:00Z',
          reason: 'Synthetic alternative proposal',
        }),
      );
      assert.equal(
        (
          await post(admin, `${root}/schedule-revisions/${proposal.id}/decision`, {
            decision: 'APPROVED',
            note: '',
          })
        ).status,
        403,
      );
      expectCreated(
        await post(buyer, `${root}/schedule-revisions/${proposal.id}/decision`, {
          decision: 'APPROVED',
          note: 'Synthetic buyer consent',
        }),
      );
      assert.equal(
        (
          await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } })
        ).deliveryDeadline?.toISOString(),
        '2027-09-12T00:00:00.000Z',
      );
      expectCreated(
        await post(artisan, `${root}/schedule-revisions/${proposal.id}/decision`, {
          decision: 'APPROVED',
          note: 'Synthetic artisan consent',
        }),
      );
      assert.equal(
        (
          await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } })
        ).deliveryDeadline?.toISOString(),
        '2027-09-11T12:00:00.000Z',
      );
      assert.equal(
        (
          await post(buyer, `${root}/schedule-revisions/${stale.id}/decision`, {
            decision: 'APPROVED',
            note: '',
          })
        ).status,
        409,
      );
    },
  );
  await check(
    'schedule preview is read-only and concurrent final decisions apply once',
    async () => {
      const offer = await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } });
      const input = {
        batchId,
        expectedVersion: offer.version,
        proposedDeadline: '2027-09-10T12:00:00Z',
        reason: 'Synthetic concurrent party decisions',
      };
      const count = await db.scheduleRevision.count({ where: { batchId } });
      assert.equal((await post(operator, `${root}/schedule-revisions/preview`, input)).status, 201);
      assert.equal((await post(artisan, `${root}/schedule-revisions/preview`, input)).status, 404);
      assert.equal(await db.scheduleRevision.count({ where: { batchId } }), count);
      assert.equal(
        (
          await post(operator, `${root}/schedule-revisions`, {
            ...input,
            expectedVersion: offer.version + 1,
          })
        ).status,
        409,
      );
      const created = expectCreated<{ id: string }>(
        await post(operator, `${root}/schedule-revisions`, input),
      );
      expectCreated(
        await post(buyer, `${root}/schedule-revisions/${created.id}/decision`, {
          decision: 'APPROVED',
          note: 'Synthetic buyer consent before race',
        }),
      );
      const raced = await Promise.all([
        post(artisan, `${root}/schedule-revisions/${created.id}/decision`, {
          decision: 'APPROVED',
          note: 'Synthetic final approval',
        }),
        post(artisan, `${root}/schedule-revisions/${created.id}/decision`, {
          decision: 'REJECTED',
          note: 'Synthetic competing rejection',
        }),
      ]);
      assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
      const saved = await db.scheduleRevision.findUniqueOrThrow({ where: { id: created.id } });
      const after = await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } });
      assert.equal(after.quantity, offer.quantity);
      assert.equal(after.unitPayMillimes, offer.unitPayMillimes);
      assert.equal(
        after.deliveryDeadline?.toISOString(),
        saved.status === 'APPROVED'
          ? input.proposedDeadline.replace('Z', '.000Z')
          : offer.deliveryDeadline?.toISOString(),
      );
      assert.equal((saved.impact as { decisions: unknown[] }).decisions.length, 2);
    },
  );
  await check(
    'scoped exceptions retain original facts and leave quantities and compensation unchanged',
    async () => {
      const before = await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } });
      const exception = expectCreated<{ id: string }>(
        await post(artisan, `${root}/exceptions`, {
          batchId,
          category: 'MATERIAL_SHORTAGE',
          severity: 'HIGH',
          description: 'Synthetic missing material; assistance requested',
          affectedQuantity: 3,
          affectedDate: '2027-09-10T00:00:00Z',
        }),
      );
      assert.equal(
        (await post(outsider, `${root}/exceptions/${exception.id}`, { status: 'ACKNOWLEDGED' }))
          .status,
        403,
      );
      expectCreated(
        await post(operator, `${root}/exceptions/${exception.id}`, { status: 'ACKNOWLEDGED' }),
      );
      expectCreated(
        await post(operator, `${root}/exceptions/${exception.id}`, {
          status: 'RESOLVED',
          resolution: 'Synthetic material sourced',
        }),
      );
      const after = await db.commercialOffer.findUniqueOrThrow({ where: { id: revisedId } });
      assert.equal(after.quantity, before.quantity);
      assert.equal(after.unitPayMillimes, before.unitPayMillimes);
      const hidden = await outsider.client.request(root);
      assert.equal(JSON.stringify(hidden.body).includes(exception.id), false);
      assert.equal(
        (await db.productionException.findUniqueOrThrow({ where: { id: exception.id } }))
          .description,
        'Synthetic missing material; assistance requested',
      );
    },
  );
  await check(
    'private support correction, attachment access and withdrawal retain original facts',
    async () => {
      const voluntary = expectCreated<{ id: string }>(
        await post(artisan, `${root}/tickets`, {
          category: 'SUPPORT_REQUEST',
          relatedType: 'NONE',
        }),
      );
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: voluntary.id } })).description,
        '',
      );
      expectCreated(
        await post(artisan, `${root}/tickets/${voluntary.id}`, { status: 'WITHDRAWN' }),
      );
      const rankingBefore = await operator.client.request(
        `/api/v1/procurement/orders/${orderId}/planning`,
      );
      const ticket = expectCreated<{ id: string }>(
        await post(artisan, `${root}/tickets`, {
          category: 'SUPPORT_REQUEST',
          relatedType: 'BATCH',
          relatedId: batchId,
          description: 'Synthetic digital support requested',
        }),
      );
      assert.equal(
        JSON.stringify((await outsider.client.request(root)).body).includes(ticket.id),
        false,
      );
      expectCreated(
        await post(artisan, `${root}/tickets/${ticket.id}/corrections`, {
          detail: 'Synthetic correction: craft support requested',
        }),
      );
      const base64 = (
        await sharp({ create: { width: 2, height: 2, channels: 3, background: '#112233' } })
          .png()
          .toBuffer()
      ).toString('base64');
      const attachment = expectCreated<{ id: string }>(
        await post(artisan, `${root}/tickets/${ticket.id}/attachments`, {
          filename: 'synthetic.png',
          mime: 'image/png',
          base64,
        }),
      );
      assert.equal(
        (await outsider.client.request(`${root}/tickets/${ticket.id}/attachments/${attachment.id}`))
          .status,
        404,
      );
      assert.equal(
        (await artisan.client.request(`${root}/tickets/${ticket.id}/attachments/${attachment.id}`))
          .status,
        200,
      );
      expectCreated(await post(artisan, `${root}/tickets/${ticket.id}`, { status: 'WITHDRAWN' }));
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).description,
        'Synthetic digital support requested',
      );
      assert.equal(await db.supportTicketEvent.count({ where: { ticketId: ticket.id } }), 4);
      const rankingAfter = await operator.client.request(
        `/api/v1/procurement/orders/${orderId}/planning`,
      );
      assert.equal(rankingBefore.status, 200);
      assert.equal(rankingAfter.status, 200);
      assert.deepEqual(
        (rankingAfter.body as { candidates: unknown }).candidates,
        (rankingBefore.body as { candidates: unknown }).candidates,
        'support requests do not change ranking inputs or results',
      );
    },
  );
  await check(
    'discussion internal notes and sanitized delivery history cannot leak to buyer or outsider',
    async () => {
      const originalMessages = await db.discussionMessage.count({
        where: { discussion: { orderId } },
      });
      assert.equal(
        (
          await post(buyer, `${root}/orders/${orderId}/discussions`, {
            body: 'Synthetic financial detail injection.',
            internalOnly: false,
            compensationTnd: '999.000',
          })
        ).status,
        400,
      );
      assert.equal(
        await db.discussionMessage.count({ where: { discussion: { orderId } } }),
        originalMessages,
      );
      expectCreated(
        await post(operator, `${root}/orders/${orderId}/discussions`, {
          body: 'Synthetic private finance note',
          internalOnly: true,
        }),
      );
      expectCreated(
        await post(buyer, `${root}/orders/${orderId}/discussions`, {
          body: '<b>Synthetic buyer question</b>',
          internalOnly: false,
        }),
      );
      const view = await buyer.client.request(root);
      assert.equal(JSON.stringify(view.body).includes('Synthetic private finance note'), false);
      assert.equal(JSON.stringify(view.body).includes('<b>'), false);
      assert.equal(
        (
          await post(outsider, `${root}/orders/${orderId}/discussions`, {
            body: 'Unauthorized post',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await post(buyer, `${root}/orders/${orderId}/discussions`, {
            body: 'Buyer private note',
            internalOnly: true,
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'localized external notifications fail honestly and retry honors opt-out without duplication',
    async () => {
      expectCreated(
        await post(artisan, `${root}/notifications/preferences`, {
          category: 'SUPPORT_CASE_UPDATE',
          channel: 'EMAIL',
          optedIn: true,
          language: 'fr',
        }),
      );
      const ticket = expectCreated<{ id: string }>(
        await post(artisan, `${root}/tickets`, {
          category: 'PRODUCTION',
          relatedType: 'BATCH',
          relatedId: batchId,
          description: 'Synthetic scoped support',
        }),
      );
      // Give this fixture an explicit support role in the operating organization.
      const operatorOrg = (
        await db.commercialOrder.findUniqueOrThrow({
          where: { id: orderId },
          include: { rfq: true },
        })
      ).rfq.operatorOrganizationId;
      const membership = await db.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: operatorOrg, userId: operator.me.user.id },
        },
      });
      await db.membershipRole.upsert({
        where: { membershipId_role: { membershipId: membership.id, role: 'SUPPORT' } },
        create: {
          membershipId: membership.id,
          role: 'SUPPORT',
          assignedByUserId: operator.me.user.id,
        },
        update: {},
      });
      expectCreated(
        await post(operator, `${root}/tickets/${ticket.id}`, { status: 'IN_PROGRESS' }),
      );
      const delivery = await db.notificationDelivery.findFirstOrThrow({
        where: { userId: artisan.me.user.id, category: 'SUPPORT_CASE_UPDATE', channel: 'EMAIL' },
        orderBy: { createdAt: 'desc' },
      });
      assert.equal(delivery.status, 'UNDELIVERABLE_NO_PROVIDER');
      assert.equal(delivery.locale, 'fr');
      assert.equal(delivery.body.includes('Synthetic scoped support'), false);
      expectCreated(
        await post(artisan, `${root}/notifications/preferences`, {
          category: 'SUPPORT_CASE_UPDATE',
          channel: 'EMAIL',
          optedIn: false,
        }),
      );
      const key = randomUUID();
      const beforeAttempts = delivery.attempts;
      assert.equal(
        (await post(outsider, `${root}/notifications/${delivery.id}/retry`, {})).status,
        404,
      );
      assert.equal(
        (await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).attempts,
        beforeAttempts,
      );
      assert.equal(
        JSON.stringify((await outsider.client.request(root)).body).includes(delivery.id),
        false,
      );
      const first = await post(artisan, `${root}/notifications/${delivery.id}/retry`, {}, key);
      expectCreated(first);
      const again = await post(artisan, `${root}/notifications/${delivery.id}/retry`, {}, key);
      assert.deepEqual(first.body, again.body);
      const saved = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert.equal(saved.status, 'SKIPPED_NO_OPT_IN');
      assert.equal(saved.attempts, 2);
      assert.equal(saved.deliveredAt, null);
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED' },
      });
      assert.equal(
        JSON.stringify((await operator.client.request(root)).body).includes(ticket.id),
        false,
      );
      assert.equal(
        (
          await post(operator, `${root}/tickets/${ticket.id}`, {
            status: 'RESOLVED',
            resolution: 'Unauthorized after revocation',
          })
        ).status,
        403,
      );
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status,
        'IN_PROGRESS',
      );
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
    },
  );
  await check(
    'effective availability pause preserves accepted batches, statements and support access',
    async () => {
      const before = await db.commercialBatch.count({ where: { artisanProfileId: profileId } });
      expectCreated(
        await post(artisan, `${root}/availability/pause`, {
          reason: '',
          effectiveFrom: '2026-01-01T00:00:00Z',
        }),
      );
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: profileId } }))
          .availabilityStatus,
        'PAUSED',
      );
      assert.equal(
        await db.commercialBatch.count({ where: { artisanProfileId: profileId } }),
        before,
      );
      assert.equal((await artisan.client.request(root)).status, 200);
      expectCreated(await post(artisan, `${root}/availability/resume`, {}));
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: profileId } }))
          .availabilityStatus,
        'AVAILABLE',
      );
    },
  );
}
