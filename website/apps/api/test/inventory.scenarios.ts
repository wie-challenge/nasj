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
export async function runInventoryScenarios({ db, register, check }: Harness) {
  await check(
    'inventory custody, concurrency, discrepancies, quarantine and current authorization',
    async () => {
      const [operator, artisan, coordinator, stranger] = await Promise.all(
        ['operator', 'artisan', 'coordinator', 'stranger'].map((r) =>
          register(`inventory-${r}@example.com`, `Synthetic inventory ${r}`),
        ),
      );
      const org = async (
        name: string,
        type: 'INTERNAL' | 'BUYER_BUSINESS' | 'ASSOCIATION',
        user: Identity,
        role: 'NASJ_OPERATOR' | 'BUYER' | 'ASSOCIATION_COORDINATOR',
      ) =>
        db.organization.create({
          data: {
            name,
            slug: name,
            type,
            approvalStatus: 'APPROVED',
            region: 'Sfax',
            description: 'Synthetic controlled inventory',
            contactEmail: 'inventory@example.com',
            representativeName: 'Synthetic',
            createdByUserId: user.me.user.id,
            members: {
              create: {
                userId: user.me.user.id,
                roles: { create: { role, assignedByUserId: user.me.user.id } },
              },
            },
          },
        });
      const internal = await org('inventory-internal', 'INTERNAL', operator, 'NASJ_OPERATOR');
      const buyer = await org('inventory-buyer', 'BUYER_BUSINESS', stranger, 'BUYER');
      const association = await org(
        'inventory-association',
        'ASSOCIATION',
        coordinator,
        'ASSOCIATION_COORDINATOR',
      );
      const member = await db.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: internal.id, userId: operator.me.user.id },
        },
      });
      await db.operatorAssignment.create({
        data: {
          operatorId: operator.me.user.id,
          organizationId: buyer.id,
          assignedById: operator.me.user.id,
        },
      });
      const profile = await db.artisanProfile.create({
        data: {
          displayName: 'Inventory artisan',
          region: 'Sfax',
          userId: artisan.me.user.id,
          equipment: [],
        },
      });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: association.id,
          recordedById: coordinator.me.user.id,
          reason: 'Synthetic management',
        },
      });
      const assignment = await db.artisanAssignment.create({
        data: {
          artisanProfileId: profile.id,
          coordinatorId: coordinator.me.user.id,
          organizationId: association.id,
          assignedById: coordinator.me.user.id,
          reason: 'Synthetic assignment',
        },
      });
      const capacity = await db.capacityDeclaration.create({
        data: {
          artisanProfileId: profile.id,
          craftSkillId: 'weaving',
          unitType: 'PIECES',
          quantity: 100,
          effectiveFrom: new Date('2027-11-01'),
          effectiveTo: new Date('2027-11-08'),
          declaredByUserId: artisan.me.user.id,
        },
      });
      const rfq = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: buyer.id,
          operatorOrganizationId: internal.id,
          craftSkillId: 'weaving',
          title: 'Synthetic inventory batch',
          specification: 'Synthetic',
          designRequirements: 'Synthetic',
          quantity: 100,
          deliveryAt: new Date('2027-12-01'),
          deliveryLocation: 'Sfax',
          status: 'ACCEPTED',
          procurementManaged: true,
          order: { create: { status: 'APPROVED' } },
        },
        include: { order: true },
      });
      const orderId = rfq.order!.id;
      const revision = await db.procurementRevision.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          authorId: operator.me.user.id,
          reason: 'Synthetic',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const sample = await db.procurementSample.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          revisionId: revision.id,
          authorId: operator.me.user.id,
          evidenceReference: 'Synthetic',
          criteria: 'Synthetic',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const offer = await db.commercialOffer.create({
        data: {
          orderId,
          capacityDeclarationId: capacity.id,
          artisanProfileId: profile.id,
          quantity: 100,
          unitPayMillimes: 1000n,
          estimatedHours: '100',
          expiresAt: new Date('2027-11-01'),
          materials: 'Synthetic',
          reworkTerms: 'New agreement',
          paymentConditions: 'Approved work',
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          decidedByUserId: artisan.me.user.id,
        },
      });
      const batch = await db.commercialBatch.create({
        data: {
          orderId,
          offerId: offer.id,
          artisanProfileId: profile.id,
          status: 'MATERIAL_READY',
        },
      });
      const release = await db.batchRelease.create({
        data: {
          batchId: batch.id,
          actorId: operator.me.user.id,
          revisionId: revision.id,
          sampleId: sample.id,
          materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
          fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
        },
      });
      await db.batchMaterialRequirement.create({
        data: {
          batchId: batch.id,
          releaseId: release.id,
          materialCode: 'cotton',
          name: 'Cotton',
          unit: 'METERS',
          perItemMilli: 1000,
          wastageBps: 0,
          batchQuantity: 100,
          requiredMilli: 100000,
          readiness: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
        },
      });
      const send = async (who: Identity, path: string, body: unknown, key = randomUUID()) => {
        const me = await who.client.request('/api/v1/me');
        return who.client.request(`/api/v1/inventory/${path}`, 'POST', body, {
          'idempotency-key': key,
          'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
        });
      };
      const lotBody = {
        materialCode: 'cotton',
        name: 'Cotton',
        unit: 'METERS',
        lotReference: 'inventory-demo-lot',
        supplierReference: 'Synthetic source',
        evidenceReference: 'Synthetic receiving note',
        provenance: 'SYNTHETIC',
        quantityMilli: '100000',
      };
      assert.equal(
        (await send(operator, `organizations/${internal.id}/lots`, lotBody)).status,
        403,
      );
      for (const permission of [
        'inventory.stock.read',
        'inventory.stock.register',
        'inventory.stock.reserve',
        'inventory.stock.handover',
        'inventory.stock.adjust',
      ])
        await db.membershipPermission.create({
          data: {
            membershipId: member.id,
            permission,
            grantedById: operator.me.user.id,
            reason: 'Synthetic inventory authorization',
          },
        });
      const current = await operator.client.request('/api/v1/me');
      assert.equal(
        (
          await operator.client.request(
            `/api/v1/inventory/organizations/${internal.id}/lots`,
            'POST',
            lotBody,
            {
              'X-CSRF-Token': (current.body as { csrfToken: string }).csrfToken,
            },
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await send(operator, `organizations/${internal.id}/lots`, {
            ...lotBody,
            provenance: 'VERIFIED',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await send(operator, `organizations/${internal.id}/lots`, {
            ...lotBody,
            quantityMilli: '-1',
          })
        ).status,
        400,
      );
      const key = randomUUID();
      const lotResult = await send(operator, `organizations/${internal.id}/lots`, lotBody, key);
      assert.equal(lotResult.status, 201, JSON.stringify(lotResult.body));
      assert.deepEqual(
        (await send(operator, `organizations/${internal.id}/lots`, lotBody, key)).body,
        lotResult.body,
      );
      const lotId = (lotResult.body as { id: string }).id;
      assert.equal(
        (await stranger.client.request(`/api/v1/inventory/organizations/${internal.id}`)).status,
        403,
      );
      assert.equal(
        (
          await send(operator, `lots/${lotId}/reservations`, {
            batchId: batch.id,
            quantityMilli: '1000',
            unit: 'UNITS',
            reason: 'Mismatch',
          })
        ).status,
        409,
      );
      const reservations = await Promise.all(
        [1, 2].map(() =>
          send(operator, `lots/${lotId}/reservations`, {
            batchId: batch.id,
            quantityMilli: '70000',
            unit: 'METERS',
            reason: 'Synthetic production',
          }),
        ),
      );
      assert.deepEqual(reservations.map((r) => r.status).sort(), [201, 409]);
      const reservationId = (reservations.find((r) => r.status === 201)!.body as { id: string }).id;
      const h = await send(operator, `reservations/${reservationId}/handovers`, {
        receiverOrganizationId: association.id,
        quantityMilli: '70000',
        evidenceReference: 'Synthetic handover',
        occurredAt: '2026-10-01T10:00:00.000Z',
      });
      assert.equal(h.status, 201, JSON.stringify(h.body));
      const handoverId = (h.body as { id: string }).id;
      assert.equal(
        (
          await send(stranger, `handovers/${handoverId}/receipts`, {
            receivedMilli: '70000',
            damagedMilli: '0',
            method: 'DIRECT',
            evidenceReference: 'Synthetic',
            note: 'Synthetic',
          })
        ).status,
        403,
      );
      const receipt = await send(artisan, `handovers/${handoverId}/receipts`, {
        receivedMilli: '60000',
        damagedMilli: '10000',
        method: 'DIRECT',
        evidenceReference: 'Synthetic acknowledgement',
        note: 'Ten missing and ten damaged',
      });
      assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
      assert.equal(
        (await db.materialHandover.findUniqueOrThrow({ where: { id: handoverId } })).status,
        'DISCREPANCY_REPORTED',
      );
      assert.equal(
        (
          await db.materialReadiness.findUniqueOrThrow({
            where: { batchId_materialCode: { batchId: batch.id, materialCode: 'cotton' } },
          })
        ).readiness,
        'DISCREPANCY_BLOCKED',
      );
      assert.equal(
        (
          await send(operator, `handovers/${handoverId}/reconcile`, {
            reason: 'Synthetic missing stock segregated; replacement still required',
          })
        ).status,
        201,
      );
      const returned = await send(operator, `handovers/${handoverId}/returns`, {
        quantityMilli: '10000',
        condition: 'DAMAGED',
        reason: 'Synthetic damaged stock',
        evidenceReference: 'Synthetic return',
      });
      assert.equal(returned.status, 201, JSON.stringify(returned.body));
      const returnId = (returned.body as { id: string }).id;
      assert.equal(
        (
          await send(operator, `returns/${returnId}/disposition`, {
            disposition: 'RESTOCK',
            reason: 'Invalid damaged restock',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await send(operator, `returns/${returnId}/disposition`, {
            disposition: 'DAMAGED',
            reason: 'Segregated damaged materials',
          })
        ).status,
        201,
      );
      const balance = await db.materialLot.findUniqueOrThrow({ where: { id: lotId } });
      assert.equal(balance.availableMilli, 30000n);
      assert.equal(balance.damagedMilli, 20000n);
      assert.equal(balance.quarantineMilli, 0n);
      const replacementLot = await send(operator, `organizations/${internal.id}/lots`, {
        ...lotBody,
        lotReference: 'inventory-replacement-lot',
        quantityMilli: '50000',
      });
      assert.equal(replacementLot.status, 201, JSON.stringify(replacementLot.body));
      const replacementId = (replacementLot.body as { id: string }).id;
      const replacementReservation = await send(operator, `lots/${replacementId}/reservations`, {
        batchId: batch.id,
        quantityMilli: '50000',
        unit: 'METERS',
        reason: 'Replace missing and damaged material with separately recorded stock',
      });
      assert.equal(replacementReservation.status, 201, JSON.stringify(replacementReservation.body));
      const replacementHandover = await send(
        operator,
        `reservations/${(replacementReservation.body as { id: string }).id}/handovers`,
        {
          receiverOrganizationId: association.id,
          quantityMilli: '50000',
          evidenceReference: 'Synthetic replacement handover',
          occurredAt: '2026-10-01T11:00:00.000Z',
        },
      );
      assert.equal(replacementHandover.status, 201, JSON.stringify(replacementHandover.body));
      assert.equal(
        (
          await send(
            artisan,
            `handovers/${(replacementHandover.body as { id: string }).id}/receipts`,
            {
              receivedMilli: '50000',
              damagedMilli: '0',
              method: 'DIRECT',
              evidenceReference: 'Synthetic acknowledgement',
              note: 'Replacement fully received',
            },
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await db.materialReadiness.findUniqueOrThrow({
            where: { batchId_materialCode: { batchId: batch.id, materialCode: 'cotton' } },
          })
        ).readiness,
        'SYNTHETIC_RECEIPT_ACKNOWLEDGED',
      );
      assert.equal(
        (
          await send(operator, `handovers/${handoverId}/consumption`, {
            quantityMilli: '50000',
            reason: 'Synthetic actual usage of undamaged received portion',
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await send(operator, `handovers/${handoverId}/returns`, {
            quantityMilli: '1000',
            condition: 'UNUSED',
            reason: 'Cannot return consumed stock',
            evidenceReference: 'Synthetic invalid return',
          })
        ).status,
        409,
      );
      const unusedReturn = await send(
        operator,
        `handovers/${(replacementHandover.body as { id: string }).id}/returns`,
        {
          quantityMilli: '1000',
          condition: 'UNUSED',
          reason: 'Synthetic unused return',
          evidenceReference: 'Synthetic return note',
        },
      );
      assert.equal(unusedReturn.status, 201, JSON.stringify(unusedReturn.body));
      const pendingLot = await send(operator, `organizations/${internal.id}/lots`, {
        ...lotBody,
        lotReference: 'inventory-pending-lot',
        quantityMilli: '1000',
        provenance: 'PENDING_VERIFICATION',
      });
      assert.equal(pendingLot.status, 201);
      const pendingReservation = await send(
        operator,
        `lots/${(pendingLot.body as { id: string }).id}/reservations`,
        {
          batchId: batch.id,
          quantityMilli: '1000',
          unit: 'METERS',
          reason: 'Pending stock replacement',
        },
      );
      assert.equal(pendingReservation.status, 201, JSON.stringify(pendingReservation.body));
      const pendingHandover = await send(
        operator,
        `reservations/${(pendingReservation.body as { id: string }).id}/handovers`,
        {
          receiverOrganizationId: association.id,
          quantityMilli: '1000',
          evidenceReference: 'Pending physical note',
          occurredAt: '2026-10-01T12:00:00.000Z',
        },
      );
      assert.equal(pendingHandover.status, 201);
      assert.equal(
        (
          await send(artisan, `handovers/${(pendingHandover.body as { id: string }).id}/receipts`, {
            receivedMilli: '1000',
            damagedMilli: '0',
            method: 'DIRECT',
            evidenceReference: 'Authenticated claim',
            note: 'Physical source still unverified',
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await db.materialReadiness.findUniqueOrThrow({
            where: { batchId_materialCode: { batchId: batch.id, materialCode: 'cotton' } },
          })
        ).readiness,
        'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION',
      );
      const artisanContext = await artisan.client.request('/api/v1/me');
      const blockedStart = await artisan.client.request(
        `/api/v1/procurement/batches/${batch.id}/start`,
        'POST',
        { version: batch.version },
        {
          'X-CSRF-Token': (artisanContext.body as { csrfToken: string }).csrfToken,
          'Idempotency-Key': randomUUID(),
        },
      );
      assert.equal(blockedStart.status, 409);
      assert.equal((blockedStart.body as { code: string }).code, 'MATERIAL_RECEIPT_BLOCKED');
      assert.equal(
        (await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } })).status,
        'MATERIAL_READY',
      );
      await db.artisanAssignment.update({
        where: { id: assignment.id },
        data: { endedAt: new Date() },
      });
      const mine = await coordinator.client.request('/api/v1/inventory/my-handovers');
      assert.equal(mine.status, 200);
      assert.equal((mine.body as { items: unknown[] }).items.length, 0);
      await db.membershipPermission.update({
        where: {
          membershipId_permission: {
            membershipId: member.id,
            permission: 'inventory.stock.reserve',
          },
        },
        data: { enabled: false },
      });
      assert.equal(
        (
          await send(operator, `lots/${lotId}/reservations`, {
            batchId: batch.id,
            quantityMilli: '1000',
            unit: 'METERS',
            reason: 'Revoked',
          })
        ).status,
        403,
      );
      await assert.rejects(
        db.inventoryMovement.updateMany({ where: { lotId }, data: { reason: 'Tamper' } }),
      );
    },
  );
}
