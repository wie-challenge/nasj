import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type OrderAccess = {
  order: {
    id: string;
    status: string;
    provenance: string;
    rfq: {
      buyerOrganizationId: string;
      operatorOrganizationId: string;
      title: string;
      deliveryLocation: string;
      craftSkill: { name: string };
      quantity: number;
    };
  };
  logistics: boolean;
  publish: boolean;
  finance: boolean;
  payout: boolean;
  reconcile: boolean;
  simulate: boolean;
  buyer: boolean;
  confirm: boolean;
};
@Injectable()
export class LogisticsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async shipments(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.logistics && !access.buyer) fail(404, 'NOT_FOUND', 'Order not found.');
      const rows = await this.loadShipments(tx, orderId);
      return {
        items: rows.map((row) => this.presentShipment(row, access.buyer && !access.logistics)),
      };
    });
  }
  async shipment(actor: Actor, shipmentId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await this.visibleShipment(tx, actor, shipmentId);
      return this.presentShipment(row.shipment, row.buyer && !row.logistics);
    });
  }
  async createShipment(actor: Actor, orderId: string, input: C.ShipmentCreateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.logistics(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'shipment.create', key, input, async () => {
        this.window(input.windowStart, input.windowEnd);
        const ids = input.items.map((item) => item.preparationItemId);
        const preparations = await tx.shipmentPreparationItem.findMany({
          where: { id: { in: ids } },
          include: {
            preparation: true,
            batch: { include: { offer: true } },
            shipmentItems: { include: { shipment: { select: { status: true } } } },
          },
        });
        if (preparations.length !== ids.length) fail(404, 'NOT_FOUND', 'Preparation not found.');
        const associations = new Set(
          preparations.map((item) => item.batch.offer.associationOrganizationId),
        );
        if (associations.size !== 1 || [...associations][0] == null)
          fail(
            409,
            associations.size > 1 ? 'MIXED_ASSOCIATION' : 'ASSOCIATION_UNKNOWN',
            'A pickup must use one known association.',
          );
        const associationId = [...associations][0] as string;
        for (const item of preparations) {
          if (item.preparation.orderId !== orderId || item.batch.orderId !== orderId)
            fail(404, 'NOT_FOUND', 'Preparation not found.');
        }
        await this.coordinatorMember(tx, input.coordinatorId, associationId);
        const wanted = new Map(input.items.map((item) => [item.preparationItemId, item.quantity]));
        for (const item of preparations) {
          const used = item.shipmentItems
            .filter((row) => row.shipment.status !== 'CANCELLED')
            .reduce((total, row) => total + row.quantity, 0);
          const next = wanted.get(item.id) ?? 0;
          if (used + next > item.quantity)
            fail(409, 'EXCESS_SHIPMENT', 'Shipment pieces cannot exceed the prepared pieces.');
        }
        const quantity = input.items.reduce((total, item) => total + item.quantity, 0);
        const shipment = await tx.shipment.create({
          data: {
            orderId,
            hub: input.hub,
            destination: access.order.rfq.deliveryLocation,
            actorId: actor.id,
            items: {
              create: input.items.map((item) => ({
                preparationItemId: item.preparationItemId,
                quantity: item.quantity,
              })),
            },
            pickups: {
              create: {
                associationOrganizationId: associationId,
                hub: input.hub,
                windowStart: new Date(input.windowStart),
                windowEnd: new Date(input.windowEnd),
                coordinatorId: input.coordinatorId,
                operatorId: actor.id,
                quantity,
                actorId: actor.id,
              },
            },
          },
        });
        await audit(tx, actor, {
          action: 'logistics.shipment_scheduled',
          targetType: 'Shipment',
          targetId: shipment.id,
          after: { quantity, provenance: 'SYNTHETIC' },
        });
        return { id: shipment.id, status: shipment.status, quantity };
      });
    });
  }
  async schedule(actor: Actor, shipmentId: string, input: C.PickupInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.operatorShipment(tx, actor, shipmentId);
      return this.command(tx, actor, shipmentId, 'pickup.schedule', key, input, async () => {
        this.window(input.windowStart, input.windowEnd);
        this.version(loaded.shipment.version, input.version);
        if (loaded.shipment.status !== 'PICKUP_SCHEDULED')
          fail(409, 'INVALID_TRANSITION', 'The pickup window can change only before collection.');
        const associationId = loaded.shipment.pickups[0]?.associationOrganizationId;
        if (!associationId) fail(409, 'ASSOCIATION_UNKNOWN', 'This shipment has no association.');
        await this.coordinatorMember(tx, input.coordinatorId, associationId);
        const quantity = loaded.shipment.items.reduce((total, item) => total + item.quantity, 0);
        await tx.pickupSchedule.create({
          data: {
            shipmentId,
            associationOrganizationId: associationId,
            hub: input.hub,
            windowStart: new Date(input.windowStart),
            windowEnd: new Date(input.windowEnd),
            coordinatorId: input.coordinatorId,
            operatorId: actor.id,
            quantity,
            actorId: actor.id,
          },
        });
        const saved = await tx.shipment.update({
          where: { id: shipmentId },
          data: { hub: input.hub, version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'logistics.pickup_rescheduled',
          targetType: 'Shipment',
          targetId: shipmentId,
          after: { provenance: 'SYNTHETIC' },
        });
        return { id: shipmentId, status: saved.status, version: saved.version };
      });
    });
  }
  async cancel(actor: Actor, shipmentId: string, input: C.ShipmentCancelInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.operatorShipment(tx, actor, shipmentId);
      return this.command(tx, actor, shipmentId, 'shipment.cancel', key, input, async () => {
        this.version(loaded.shipment.version, input.version);
        if (loaded.shipment.status !== 'PICKUP_SCHEDULED')
          fail(409, 'INVALID_TRANSITION', 'A pickup can be cancelled only before collection.');
        if (loaded.shipment.handovers.length)
          fail(409, 'CUSTODY_STARTED', 'A pickup with a recorded handover cannot be cancelled.');
        C.assertShipmentEdge(loaded.shipment.status as C.ShipmentStatus, 'CANCELLED');
        const saved = await tx.shipment.update({
          where: { id: shipmentId },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'logistics.shipment_cancelled',
          targetType: 'Shipment',
          targetId: shipmentId,
          after: { provenance: 'SYNTHETIC' },
        });
        return { id: shipmentId, status: saved.status, version: saved.version };
      });
    });
  }
  async handover(actor: Actor, shipmentId: string, input: C.HandoverInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.custodyShipment(tx, actor, shipmentId, input.eventType);
      return this.command(tx, actor, shipmentId, 'custody.record', key, input, async () => {
        const shipment = loaded.shipment;
        this.version(shipment.version, input.version);
        const total = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
        // The same pieces move through successive legs. Only earlier movements on this leg
        // consume its balance; a hub confirmation restates the incoming collection.
        const recorded = shipment.handovers
          .filter((row) => row.eventType === input.eventType && !row.priorHandoverId)
          .reduce((sum, row) => sum + row.quantity, 0);
        if (input.eventType !== 'RECEIVED_AT_HUB')
          C.custodyConservation({
            shipped: total,
            previousHandovers: recorded,
            quantity: input.quantity,
          });
        else if (input.quantity > total)
          fail(409, 'EXCESS_HANDOVER', 'A handover cannot increase the shipment quantity.');
        const occurredAt = this.past(input.occurredAt);
        let status = shipment.status as C.ShipmentStatus;
        if (input.eventType === 'COLLECTED_FROM_ASSOCIATION') {
          if (!loaded.coordinator)
            fail(
              403,
              'FORBIDDEN',
              'The association records collection. The operator confirms receipt separately.',
            );
          if (status !== 'PICKUP_SCHEDULED')
            fail(409, 'INVALID_TRANSITION', 'Collection is recorded before hub receipt.');
          await tx.custodyHandover.create({
            data: {
              shipmentId,
              eventType: input.eventType,
              sourceHolder: 'ASSOCIATION',
              destinationHolder: 'OPERATOR_HUB',
              actorId: actor.id,
              quantity: input.quantity,
              occurredAt,
              confirmationStatus: 'PENDING',
              correlationId: randomUUID(),
              note: input.note,
            },
          });
        } else if (input.eventType === 'RECEIVED_AT_HUB') {
          if (!loaded.logistics)
            fail(403, 'FORBIDDEN', 'Hub receipt is confirmed by the assigned operator.');
          const prior = shipment.handovers.find((row) => row.id === input.priorHandoverId);
          if (prior?.eventType !== 'COLLECTED_FROM_ASSOCIATION' || prior.confirmation)
            fail(409, 'CONFIRMATION_REQUIRED', 'Confirm a pending association collection.');
          const collected = shipment.handovers
            .filter((row) => row.eventType === 'COLLECTED_FROM_ASSOCIATION')
            .reduce((sum, row) => sum + row.quantity, 0);
          if (collected !== total || input.quantity !== total)
            fail(
              409,
              'HANDOVER_SHORT',
              'The recorded collection is short. The shortage stays on the handover record.',
            );
          C.assertShipmentEdge(status, 'COLLECTED');
          await tx.custodyHandover.create({
            data: {
              shipmentId,
              eventType: input.eventType,
              sourceHolder: 'ASSOCIATION',
              destinationHolder: 'OPERATOR_HUB',
              actorId: actor.id,
              quantity: input.quantity,
              occurredAt,
              confirmationStatus: 'CONFIRMED',
              priorHandoverId: prior.id,
              correlationId: randomUUID(),
              note: input.note,
            },
          });
          status = 'COLLECTED';
        } else {
          if (!loaded.logistics)
            fail(403, 'FORBIDDEN', 'Dispatch is recorded by the assigned operator.');
          if (input.quantity !== total)
            fail(
              409,
              'EXCESS_HANDOVER',
              'Dispatch uses the full shipment quantity. It is not a carrier confirmation.',
            );
          C.assertShipmentEdge(status, 'IN_TRANSIT');
          await tx.custodyHandover.create({
            data: {
              shipmentId,
              eventType: input.eventType,
              sourceHolder: 'OPERATOR_HUB',
              destinationHolder: 'SYNTHETIC_TRANSPORT',
              actorId: actor.id,
              quantity: input.quantity,
              occurredAt,
              confirmationStatus: 'PENDING',
              correlationId: randomUUID(),
              note: input.note || 'Synthetic transport. This is not a carrier confirmation.',
            },
          });
          status = 'IN_TRANSIT';
        }
        const saved = await tx.shipment.update({
          where: { id: shipmentId },
          data: { status, version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'logistics.custody_recorded',
          targetType: 'Shipment',
          targetId: shipmentId,
          after: { eventType: input.eventType, quantity: input.quantity, provenance: 'SYNTHETIC' },
        });
        return { id: shipmentId, status: saved.status, version: saved.version };
      });
    });
  }
  async reportDelivery(
    actor: Actor,
    shipmentId: string,
    input: C.DeliveryReportInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.operatorShipment(tx, actor, shipmentId);
      return this.command(tx, actor, shipmentId, 'delivery.report', key, input, async () => {
        const shipment = loaded.shipment;
        this.version(shipment.version, input.version);
        C.assertShipmentEdge(shipment.status as C.ShipmentStatus, 'DELIVERY_REPORTED');
        const total = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
        if (input.quantity > total)
          fail(409, 'EXCESS_RECEIPT', 'Reported delivery cannot exceed the shipped quantity.');
        await tx.deliveryReport.create({
          data: {
            shipmentId,
            quantity: input.quantity,
            actorId: actor.id,
            occurredAt: this.past(input.occurredAt),
            note: input.note,
          },
        });
        const saved = await tx.shipment.update({
          where: { id: shipmentId },
          data: { status: 'DELIVERY_REPORTED', version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'logistics.delivery_reported',
          targetType: 'Shipment',
          targetId: shipmentId,
          after: { quantity: input.quantity, provenance: 'SYNTHETIC' },
        });
        return { id: shipmentId, status: saved.status, version: saved.version };
      });
    });
  }
  async confirmDelivery(
    actor: Actor,
    shipmentId: string,
    input: C.BuyerConfirmationInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.buyerShipment(tx, actor, shipmentId);
      return this.command(tx, actor, shipmentId, 'delivery.confirm', key, input, async () => {
        const shipment = loaded.shipment;
        this.version(shipment.version, input.version);
        if (shipment.buyerConfirmation)
          fail(409, 'DUPLICATE_CONFIRMATION', 'This shipment already has a buyer confirmation.');
        if (!shipment.deliveryReport)
          fail(
            409,
            'INVALID_TRANSITION',
            'Buyer confirmation follows an operator delivery report.',
          );
        // Reconcile against what was actually shipped, not against the operator's report. A short
        // report previously became the baseline, so the pieces it omitted were never counted as a
        // shortage. See C.buyerReceipt.
        const shipped = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
        const receipt = C.buyerReceipt({
          shipped,
          reported: shipment.deliveryReport.quantity,
          received: input.received,
          accepted: input.accepted,
          missing: input.missing,
          damaged: input.damaged,
        });
        // The recorded missing figure is the total unaccounted for, including pieces the operator
        // never reported arriving. Otherwise a short report would look like a complete delivery.
        const recordedMissing = receipt.shortage;
        const status = receipt.discrepancy ? 'DISCREPANCY' : 'BUYER_CONFIRMED';
        C.assertShipmentEdge(shipment.status as C.ShipmentStatus, status);
        const confirmation = await tx.buyerDeliveryConfirmation.create({
          data: {
            shipmentId,
            received: input.received,
            accepted: input.accepted,
            missing: recordedMissing,
            damaged: receipt.damaged,
            actorId: actor.id,
            occurredAt: this.past(input.occurredAt),
            note: input.note,
            ...(receipt.discrepancy
              ? {
                  discrepancy: {
                    create: { quantity: recordedMissing + receipt.damaged, note: input.note },
                  },
                }
              : {}),
          },
        });
        // Denormalized buyer-accepted pieces; IAM locks serialize confirmations across shipments.
        const acceptedTotal = await tx.buyerDeliveryConfirmation.aggregate({
          where: { shipment: { orderId: shipment.orderId } },
          _sum: { accepted: true },
        });
        await tx.commercialOrder.update({
          where: { id: shipment.orderId },
          data: { delivered: acceptedTotal._sum.accepted ?? 0 },
        });
        const saved = await tx.shipment.update({
          where: { id: shipmentId },
          data: { status, version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'logistics.buyer_confirmed',
          targetType: 'Shipment',
          targetId: shipmentId,
          after: {
            accepted: input.accepted,
            missing: input.missing,
            damaged: receipt.damaged,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          id: confirmation.id,
          status: saved.status,
          version: saved.version,
          accepted: input.accepted,
          missing: recordedMissing,
          damaged: receipt.damaged,
          orderStatus: shipment.order.status,
        };
      });
    });
  }
  async pickups(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const orgs = await this.coordinatorOrgs(tx, actor);
      if (!orgs.length) return { items: [] };
      const rows = await tx.pickupSchedule.findMany({
        where: { associationOrganizationId: { in: orgs } },
        include: { shipment: { include: { items: true, handovers: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const seen = new Set<string>();
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (seen.has(row.shipmentId)) continue;
        seen.add(row.shipmentId);
        if (row.shipment.status !== 'CANCELLED') latest.set(row.shipmentId, row);
      }
      return {
        items: [...latest.values()].map((row) => ({
          shipmentId: row.shipmentId,
          status: row.shipment.status,
          hub: row.hub,
          windowStart: row.windowStart.toISOString(),
          windowEnd: row.windowEnd.toISOString(),
          quantity: row.quantity,
          unit: row.unit,
          version: row.shipment.version,
          provenance: 'SYNTHETIC' as const,
        })),
      };
    });
  }
  async traceability(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.logistics && !access.buyer) fail(404, 'NOT_FOUND', 'Order not found.');
      const row = await tx.traceabilityPublication.findFirst({
        where: { orderId },
        include: { revisions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!row) return { publication: null };
      return {
        publication: {
          id: row.id,
          status: row.status,
          version: row.version,
          publicPath: row.status === 'PUBLISHED' ? `/trace/${row.publicToken}` : null,
          provenance: 'SYNTHETIC' as const,
        },
      };
    });
  }
  async draftTraceability(
    actor: Actor,
    orderId: string,
    input: C.TraceabilityDraftInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.logistics(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'traceability.draft', key, input, async () => {
        this.story(input.story);
        const existing = await tx.traceabilityPublication.findFirst({ where: { orderId } });
        if (existing)
          fail(409, 'TRACEABILITY_EXISTS', 'Use a correction on the existing publication.');
        const region = await this.coarseRegion(tx, orderId);
        const row = await tx.traceabilityPublication.create({
          data: {
            orderId,
            publicToken: randomUUID(),
            productTitle: access.order.rfq.title,
            craftName: access.order.rfq.craftSkill.name,
            story: input.story,
            coarseRegion: region,
            actorId: actor.id,
            revisions: {
              create: {
                version: 1,
                status: 'DRAFT',
                snapshot: json({ story: input.story, coarseRegion: region }),
                actorId: actor.id,
                reason: 'Draft',
              },
            },
          },
        });
        await audit(tx, actor, {
          action: 'logistics.traceability_drafted',
          targetType: 'TraceabilityPublication',
          targetId: row.id,
          after: { provenance: 'SYNTHETIC' },
        });
        return { id: row.id, status: row.status };
      });
    });
  }
  async submitReview(actor: Actor, publicationId: string, input: { reason: string }, key?: string) {
    return this.movePublication(
      actor,
      publicationId,
      input,
      key,
      'traceability.submit',
      ['DRAFT'],
      'PENDING_REVIEW',
    );
  }
  async publish(actor: Actor, publicationId: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.publication(tx, actor, publicationId, true);
      return this.command(
        tx,
        actor,
        publicationId,
        'traceability.publish',
        key,
        input,
        async () => {
          if (loaded.row.status !== 'PENDING_REVIEW')
            fail(409, 'PUBLICATION_UNAPPROVED', 'Publication follows review.');
          const share = await this.share(tx, loaded.row.orderId);
          const evidence = C.syntheticEvidence(
            'trace.public-story',
            'Reviewed public craft record',
            '/evidence#scenario',
            [
              'Synthetic craft content is not independent physical-provenance evidence or a delivery certificate.',
            ],
          );
          const snapshot = {
            evidence,
            productTitle: loaded.row.productTitle,
            craftName: loaded.row.craftName,
            story: loaded.row.story,
            coarseRegion: loaded.row.coarseRegion,
            provenance: 'SYNTHETIC',
            share: {
              availability: share.availability,
              basis: share.basis,
              percent: C.formatShare(share.basisPoints),
              numerator: 'Agreed direct artisan compensation',
              denominator: 'Accepted quotation total for the same order',
              paid: false,
              tax: 'Excluded. Tax treatment is pending legal review.',
              refunds: 'No refund is recorded.',
              label:
                'Synthetic agreed ratio. This is not paid income and not a fairness guarantee.',
              evidence: C.syntheticEvidence(
                'trace.producer-share',
                'Agreed producer-share metric',
                '/evidence#producer-share',
                [
                  'Agreed direct compensation divided by accepted quotation is not verified paid income or a fairness guarantee.',
                ],
              ),
            },
          };
          const version = loaded.row.version + 1;
          const revision = await tx.traceabilityRevision.create({
            data: {
              publicationId,
              version,
              status: 'PUBLISHED',
              snapshot: json(snapshot),
              actorId: actor.id,
              reason: input.reason,
            },
          });
          await tx.producerShareSnapshot.create({
            data: {
              revisionId: revision.id,
              policyVersion: 1,
              basis: 'AGREED_NOT_PAID',
              numeratorMillimes: share.numeratorMillimes,
              denominatorMillimes: share.denominatorMillimes,
              basisPoints: share.basisPoints,
              availability: share.availability,
              artisanCount: share.artisanCount,
            },
          });
          await tx.traceabilityPublication.update({
            where: { id: publicationId },
            data: { status: 'PUBLISHED', version },
          });
          await audit(tx, actor, {
            action: 'logistics.traceability_published',
            targetType: 'TraceabilityPublication',
            targetId: publicationId,
            reason: input.reason,
            after: { provenance: 'SYNTHETIC' },
          });
          return {
            id: publicationId,
            status: 'PUBLISHED',
            publicPath: `/trace/${loaded.row.publicToken}`,
          };
        },
      );
    });
  }
  async revoke(actor: Actor, publicationId: string, input: { reason: string }, key?: string) {
    return this.movePublication(
      actor,
      publicationId,
      input,
      key,
      'traceability.revoke',
      ['PUBLISHED'],
      'REVOKED',
      true,
    );
  }
  async correct(
    actor: Actor,
    publicationId: string,
    input: C.TraceabilityDraftInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.publication(tx, actor, publicationId, false);
      return this.command(
        tx,
        actor,
        publicationId,
        'traceability.correct',
        key,
        input,
        async () => {
          this.story(input.story);
          if (loaded.row.status !== 'PUBLISHED')
            fail(
              409,
              'INVALID_TRANSITION',
              'Correct a published record. The public page hides it until it is reviewed again.',
            );
          const version = loaded.row.version + 1;
          await tx.traceabilityRevision.create({
            data: {
              publicationId,
              version,
              status: 'PENDING_REVIEW',
              snapshot: json({ story: input.story }),
              actorId: actor.id,
              reason: 'Correction',
            },
          });
          await tx.traceabilityPublication.update({
            where: { id: publicationId },
            data: { status: 'PENDING_REVIEW', version, story: input.story },
          });
          await audit(tx, actor, {
            action: 'logistics.traceability_corrected',
            targetType: 'TraceabilityPublication',
            targetId: publicationId,
            after: { provenance: 'SYNTHETIC' },
          });
          return { id: publicationId, status: 'PENDING_REVIEW' };
        },
      );
    });
  }
  async publicTrace(token: string) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) fail(404, 'NOT_FOUND', 'Traceability record not found.');
    const row = await this.db.traceabilityPublication.findUnique({ where: { publicToken: token } });
    if (!row || (row.status !== 'PUBLISHED' && row.status !== 'REVOKED'))
      fail(404, 'NOT_FOUND', 'Traceability record not found.');
    if (row.status === 'REVOKED')
      return {
        status: 'REVOKED' as const,
        provenance: 'SYNTHETIC' as const,
        publishedAt: null,
        version: row.version,
        content: null,
      };
    const revision = await this.db.traceabilityRevision.findFirst({
      where: { publicationId: row.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (!revision) fail(404, 'NOT_FOUND', 'Traceability record not found.');
    return {
      status: 'PUBLISHED' as const,
      evidence: C.syntheticEvidence(
        'trace.public-story',
        'Public craft record',
        '/evidence#scenario',
        [
          'This published demonstration record is synthetic and does not establish physical stock, delivery or payment verification.',
        ],
        { recordedAt: revision.createdAt.toISOString() },
      ),
      provenance: 'SYNTHETIC' as const,
      publishedAt: revision.createdAt.toISOString(),
      version: revision.version,
      content: revision.snapshot,
    };
  }
  async financialSummary(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.finance && !access.buyer) fail(404, 'NOT_FOUND', 'Order not found.');
      const summary = await this.summary(tx, orderId);
      if (!access.finance)
        return {
          buyerView: true,
          canReconcile: false,
          canSimulate: false,
          agreedRevenueTnd: summary.agreedRevenueTnd,
          collectedTnd: '0.000',
          collectionStatus: 'UNVERIFIED',
          taxStatus: 'PENDING_LEGAL_REVIEW',
          provenance: 'SYNTHETIC',
        };
      return {
        buyerView: false,
        canReconcile: access.reconcile,
        canSimulate: access.simulate,
        ...summary,
      };
    });
  }
  async myCompensation(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await tx.artisanProfile.findUnique({ where: { userId: actor.id } });
      if (!profile) return { items: [] };
      return { items: [await this.statement(tx, profile.id, false)] };
    });
  }
  async compensation(actor: Actor, artisanId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await tx.artisanProfile.findUnique({ where: { id: artisanId } });
      if (!profile) fail(404, 'NOT_FOUND', 'Artisan not found.');
      if (profile.userId === actor.id) return this.statement(tx, profile.id, false);
      const memberships = await tx.organizationMember.findMany({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
        },
        include: { organization: true, roles: true, permissionGrants: true },
      });
      const organizations = memberships
        .filter((m) => C.permissionsForMembership(m).includes('finance.payout.read'))
        .map((m) => m.organizationId);
      const assignments = await tx.operatorAssignment.findMany({
        where: { operatorId: actor.id, revokedAt: null },
      });
      const orders = await tx.commercialOrder.findMany({
        where: {
          rfq: {
            operatorOrganizationId: { in: organizations },
            buyerOrganizationId: { in: assignments.map((a) => a.organizationId) },
          },
          offers: { some: { artisanProfileId: artisanId } },
        },
        select: { id: true },
      });
      if (!orders.length) fail(404, 'NOT_FOUND', 'Artisan not found.');
      return this.statement(
        tx,
        profile.id,
        profile.userId == null,
        orders.map((o) => o.id),
      );
    });
  }
  async reconcile(actor: Actor, orderId: string, input: C.PayableReconcileInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.reconcile)
        fail(403, 'FORBIDDEN', 'Scoped payable reconciliation permission is required.');
      return this.command(tx, actor, orderId, 'payable.reconcile', key, input, async () => {
        if (input.milestone !== 'BUYER_ACCEPTED_PIECE')
          fail(
            409,
            'MILESTONE_UNSUPPORTED',
            'Quality approval is not the earning milestone. Buyer-accepted pieces are.',
          );
        const created = await this.recognize(tx, orderId);
        return created;
      });
    });
  }
  async payables(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.payout && !access.simulate) fail(404, 'NOT_FOUND', 'Order not found.');
      const rows = await tx.artisanPayable.findMany({ where: { orderId } });
      return { items: rows.map((row) => this.payableView(row)) };
    });
  }
  async simulations(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.orderAccess(tx, actor, orderId);
      if (!access.simulate && !access.finance) fail(404, 'NOT_FOUND', 'Order not found.');
      const rows = await tx.simulatedSettlement.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      return { items: rows.map((row) => this.simulationView(row)) };
    });
  }
  async simulate(actor: Actor, orderId: string, input: C.SimulationInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.simulator(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'payment.simulate', key, input, async () => {
        const quote = await this.quote(tx, orderId);
        let amount = quote.totalMillimes;
        let subjectKey = `buyer:${orderId}`;
        let payableId: string | null = null;
        if (input.side === 'ARTISAN') {
          if (!input.payableId)
            fail(
              409,
              'MILESTONE_NOT_REACHED',
              'An artisan simulation follows a recognized payable.',
            );
          const payable = await tx.artisanPayable.findFirst({
            where: { id: input.payableId, orderId },
          });
          if (!payable) fail(404, 'NOT_FOUND', 'Payable not found.');
          amount = payable.amountMillimes;
          subjectKey = payable.id;
          payableId = payable.id;
        }
        const prior = input.retryOf
          ? await tx.simulatedSettlement.findFirst({
              where: { id: input.retryOf, orderId, subjectKey, side: input.side },
            })
          : null;
        if (input.retryOf && prior?.status !== 'SIMULATED_FAILED')
          fail(
            409,
            'SIMULATION_NOT_RETRYABLE',
            'Only a failed synthetic simulation can be retried.',
          );
        const settled = await tx.simulatedSettlement.findFirst({
          where: { subjectKey, side: input.side, status: 'SIMULATED_SETTLED' },
        });
        if (settled)
          fail(409, 'SIMULATION_NOT_RETRYABLE', 'A settled synthetic simulation is not repeated.');
        const attempt = prior ? prior.attempt + 1 : 1;
        const existing = await tx.simulatedSettlement.findFirst({
          where: { subjectKey, side: input.side, attempt },
        });
        if (existing) return this.simulationView(existing);
        const row = await tx.simulatedSettlement.create({
          data: {
            orderId,
            payableId,
            subjectKey,
            side: input.side,
            attempt,
            status: 'SCHEDULED',
            amountMillimes: amount,
            dueAt: new Date(input.dueAt),
            events: {
              create: {
                status: 'SCHEDULED',
                actorId: actor.id,
                note: 'Synthetic simulation. This is not a bank transfer.',
              },
            },
          },
        });
        await audit(tx, actor, {
          action: 'logistics.payment_simulated',
          targetType: 'SimulatedSettlement',
          targetId: row.id,
          after: { status: 'SCHEDULED', provenance: 'SYNTHETIC', bankVerified: false },
        });
        return this.simulationView(row);
      });
    });
  }
  async advance(actor: Actor, settlementId: string, input: C.SimulationAdvanceInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.simulatedSettlement.findUnique({
        where: { id: settlementId },
        include: { order: { include: { rfq: true } } },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Simulation not found.');
      await this.simulator(tx, actor, row.orderId);
      return this.command(tx, actor, settlementId, 'payment.advance', key, input, async () => {
        const allowed: Record<string, string[]> = {
          SCHEDULED: ['SIMULATED_INITIATED', 'SIMULATED_FAILED'],
          SIMULATED_INITIATED: ['SIMULATED_SETTLED', 'SIMULATED_FAILED'],
        };
        if (!allowed[row.status]?.includes(input.next))
          fail(409, 'INVALID_TRANSITION', 'That synthetic payment change is not allowed.');
        const saved = await tx.simulatedSettlement.update({
          where: { id: settlementId },
          data: { status: input.next, bankVerified: false },
        });
        await tx.simulatedSettlementEvent.create({
          data: {
            settlementId,
            status: input.next,
            actorId: actor.id,
            note: 'Synthetic simulation. This is not a bank transfer.',
          },
        });
        await audit(tx, actor, {
          action: 'logistics.payment_simulated',
          targetType: 'SimulatedSettlement',
          targetId: settlementId,
          after: { status: input.next, provenance: 'SYNTHETIC', bankVerified: false },
        });
        return this.simulationView(saved);
      });
    });
  }
  private async movePublication(
    actor: Actor,
    publicationId: string,
    input: { reason: string },
    key: string | undefined,
    operation: string,
    from: string[],
    to: string,
    publisher = false,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.publication(tx, actor, publicationId, publisher);
      return this.command(tx, actor, publicationId, operation, key, input, async () => {
        if (!from.includes(loaded.row.status))
          fail(409, 'INVALID_TRANSITION', 'That publication change is not allowed.');
        const version = loaded.row.version + 1;
        await tx.traceabilityRevision.create({
          data: {
            publicationId,
            version,
            status: to,
            snapshot: json({ status: to }),
            actorId: actor.id,
            reason: input.reason,
          },
        });
        await tx.traceabilityPublication.update({
          where: { id: publicationId },
          data: { status: to, version },
        });
        await audit(tx, actor, {
          action: `logistics.${operation}`,
          targetType: 'TraceabilityPublication',
          targetId: publicationId,
          reason: input.reason,
          after: { status: to, provenance: 'SYNTHETIC' },
        });
        return { id: publicationId, status: to };
      });
    });
  }
  private async recognize(tx: Db, orderId: string) {
    const shipments = await tx.shipment.findMany({
      where: { orderId, buyerConfirmation: { isNot: null } },
      include: { items: { include: { preparationItem: true } }, buyerConfirmation: true },
    });
    if (!shipments.length)
      return { status: 'HELD_PENDING_REVIEW' as const, reason: 'MILESTONE_NOT_REACHED', items: [] };
    const created = [];
    for (const shipment of shipments) {
      const confirmation = shipment.buyerConfirmation;
      if (!confirmation || confirmation.accepted <= 0) continue;
      const parts = shipment.items.map((item) => ({
        id: item.preparationItem.batchId,
        quantity: item.quantity,
      }));
      const merged = new Map<string, number>();
      for (const part of parts) merged.set(part.id, (merged.get(part.id) ?? 0) + part.quantity);
      const allocated = C.allocatePieces(
        [...merged].map(([batchId, quantity]) => ({ id: batchId, quantity })),
        confirmation.accepted,
      );
      for (const share of allocated) {
        if (share.pieces <= 0) continue;
        const existing = await tx.artisanPayable.findFirst({
          where: {
            batchId: share.id,
            milestone: 'BUYER_ACCEPTED_PIECE',
            sourceEventId: confirmation.id,
          },
        });
        if (existing) {
          created.push(this.payableView(existing));
          continue;
        }
        const batch = await tx.commercialBatch.findUniqueOrThrow({
          where: { id: share.id },
          include: { offer: true },
        });
        const amount = batch.offer.unitPayMillimes * BigInt(share.pieces);
        const row = await tx.artisanPayable.create({
          data: {
            offerId: batch.offerId,
            orderId,
            batchId: batch.id,
            artisanProfileId: batch.artisanProfileId,
            milestone: 'BUYER_ACCEPTED_PIECE',
            policyVersion: 1,
            quantity: share.pieces,
            unitPayMillimes: batch.offer.unitPayMillimes,
            amountMillimes: amount,
            sourceEventId: confirmation.id,
            termsSnapshot: batch.offer.paymentConditions,
          },
        });
        created.push(this.payableView(row));
      }
    }
    if (!created.length)
      return { status: 'HELD_PENDING_REVIEW' as const, reason: 'MILESTONE_NOT_REACHED', items: [] };
    return { status: 'RECOGNIZED' as const, items: created };
  }
  private async summary(tx: Db, orderId: string) {
    const quote = await this.quote(tx, orderId);
    const offers = await tx.commercialOffer.findMany({ where: { orderId, status: 'ACCEPTED' } });
    const payables = await tx.artisanPayable.findMany({ where: { orderId } });
    const agreed = offers.reduce(
      (total, offer) => total + offer.unitPayMillimes * BigInt(offer.quantity),
      0n,
    );
    const recognized = payables.reduce((total, row) => total + row.amountMillimes, 0n);
    const plannedCost = quote.costEstimate?.subtotalMillimes ?? null;
    const contribution =
      plannedCost == null
        ? { status: 'UNAVAILABLE' as const, millimes: null }
        : C.plannedContribution(quote.totalMillimes, plannedCost);
    const share = C.agreedProducerShare({
      compensationMillimes: agreed,
      quotationMillimes: quote.totalMillimes,
      refundMillimes: 0n,
      artisanCount: new Set(offers.map((offer) => offer.artisanProfileId)).size,
    });
    return {
      agreedRevenueTnd: C.formatMillimes(quote.totalMillimes),
      collectedTnd: '0.000',
      collectionStatus: 'UNVERIFIED',
      plannedCostTnd: plannedCost == null ? null : C.formatMillimes(plannedCost),
      plannedContributionTnd:
        contribution.millimes == null ? null : C.formatMillimes(contribution.millimes),
      contributionStatus: contribution.status,
      agreedCompensationTnd: C.formatMillimes(agreed),
      recognizedPayableTnd: C.formatMillimes(recognized),
      paidVerifiedTnd: '0.000',
      agreedShare: {
        availability: share.availability,
        percent: C.formatShare(share.basisPoints),
        basis: share.basis,
      },
      taxStatus: quote.costEstimate?.taxStatus ?? 'PENDING_LEGAL_REVIEW',
      provenance: 'SYNTHETIC' as const,
      warnings: [
        'Planned contribution is not realized profit.',
        'Quotation acceptance is not cash received.',
        'A simulated settlement is not a verified bank transfer.',
        'Tax treatment is pending legal review.',
      ],
    };
  }
  private async statement(tx: Db, artisanId: string, accountless: boolean, orderIds?: string[]) {
    const offers = await tx.commercialOffer.findMany({
      where: {
        artisanProfileId: artisanId,
        status: 'ACCEPTED',
        ...(orderIds ? { orderId: { in: orderIds } } : {}),
      },
      include: { batch: true },
    });
    const payables = await tx.artisanPayable.findMany({
      where: { artisanProfileId: artisanId, ...(orderIds ? { orderId: { in: orderIds } } : {}) },
    });
    const simulations = await tx.simulatedSettlement.findMany({
      where: { payableId: { in: payables.map((row) => row.id) } },
    });
    return {
      artisanProfileId: artisanId,
      accountAccess: accountless ? 'ACCOUNTLESS_STATEMENT_UNDELIVERED' : 'OWN_ACCOUNT',
      provenance: 'SYNTHETIC' as const,
      lines: offers.map((offer) => {
        const earned = payables.filter((row) => row.offerId === offer.id);
        const earnedMillimes = earned.reduce((total, row) => total + row.amountMillimes, 0n);
        const simulation = simulations.find((row) =>
          earned.some((item) => item.id === row.payableId),
        );
        return {
          offerId: offer.id,
          agreedQuantity: offer.quantity,
          agreedTnd: C.formatMillimes(offer.unitPayMillimes * BigInt(offer.quantity)),
          earnedTnd: C.formatMillimes(earnedMillimes),
          payableTnd: C.formatMillimes(earnedMillimes),
          paidVerifiedTnd: '0.000',
          simulationStatus: simulation?.status ?? 'NOT_SIMULATED',
          bankVerified: false,
          milestone: earned[0]?.milestone ?? 'NOT_REACHED',
        };
      }),
    };
  }
  private async share(tx: Db, orderId: string) {
    const quote = await this.quote(tx, orderId);
    const offers = await tx.commercialOffer.findMany({ where: { orderId, status: 'ACCEPTED' } });
    const agreed = offers.reduce(
      (total, offer) => total + offer.unitPayMillimes * BigInt(offer.quantity),
      0n,
    );
    const share = C.agreedProducerShare({
      compensationMillimes: agreed,
      quotationMillimes: quote.totalMillimes,
      refundMillimes: 0n,
      artisanCount: new Set(offers.map((offer) => offer.artisanProfileId)).size,
    });
    return { ...share, artisanCount: new Set(offers.map((offer) => offer.artisanProfileId)).size };
  }
  private async quote(tx: Db, orderId: string) {
    const acceptance = await tx.procurementAcceptance.findUnique({
      where: { orderId },
      include: { quote: { include: { costEstimate: true } } },
    });
    if (!acceptance) fail(409, 'ORDER_NOT_READY', 'This order has no accepted quotation.');
    return acceptance.quote;
  }
  private async coarseRegion(tx: Db, orderId: string) {
    const offers = await tx.commercialOffer.findMany({
      where: { orderId, status: 'ACCEPTED' },
      include: { association: true },
    });
    const regions = [
      ...new Set(
        offers
          .map((offer) => offer.association?.region)
          .filter((region): region is string => Boolean(region)),
      ),
    ];
    return regions.length === 1 ? regions[0] : 'Several regions';
  }
  private presentShipment(
    row: Awaited<ReturnType<LogisticsService['loadShipments']>>[number],
    buyer: boolean,
  ) {
    const quantity = row.items.reduce((total, item) => total + item.quantity, 0);
    const pickup = row.pickups.at(-1);
    // Reconstructed from immutable facts - shipped items, the operator's delivery report and the
    // buyer's received count. The stored `missing` column is deliberately NOT read: its meaning
    // changed in Batch 1, and deriving from facts is exact under either rule. If the recorded facts
    // do not conserve, the provenance is reported as absent rather than guessed.
    const confirmationProvenance = row.buyerConfirmation
      ? (() => {
          try {
            return C.reconstructReceipt({
              shipped: quantity,
              operatorReported: row.deliveryReport?.quantity ?? 0,
              buyerReceived: row.buyerConfirmation.received,
              storedMissing: row.buyerConfirmation.missing,
            });
          } catch {
            return null;
          }
        })()
      : null;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      quantity,
      destination: row.destination,
      hub: buyer ? null : row.hub,
      coordinatorId: buyer ? null : (pickup?.coordinatorId ?? null),
      windowStart: pickup?.windowStart.toISOString() ?? null,
      windowEnd: pickup?.windowEnd.toISOString() ?? null,
      provenance: 'SYNTHETIC' as const,
      carrierConfirmed: false,
      // Separated quantities. `delivered` is the operator's report and is not the shipped figure;
      // the buyer's own declaration is distinct from the operator's reporting gap. `missing` is
      // retained for existing consumers and carries the same total it always has.
      delivered: row.deliveryReport?.quantity ?? 0,
      buyerReceived: row.buyerConfirmation?.received ?? 0,
      buyerAccepted: row.buyerConfirmation?.accepted ?? 0,
      buyerDeclaredMissing: confirmationProvenance?.buyerDeclaredMissing ?? 0,
      notReportedByOperator: confirmationProvenance?.operatorNotReported ?? 0,
      totalUnaccounted: confirmationProvenance?.totalUnaccounted ?? 0,
      provenanceComplete: Boolean(confirmationProvenance),
      missing: row.buyerConfirmation?.missing ?? 0,
      damaged: row.buyerConfirmation?.damaged ?? 0,
      discrepancy: row.buyerConfirmation?.discrepancy?.status ?? null,
      handovers: buyer
        ? []
        : row.handovers.map((item) => ({
            id: item.id,
            eventType: item.eventType,
            quantity: item.quantity,
            confirmationStatus: item.confirmation ? 'CONFIRMED' : item.confirmationStatus,
            occurredAt: item.occurredAt.toISOString(),
          })),
    };
  }
  private payableView(row: {
    id: string;
    quantity: number;
    amountMillimes: bigint;
    milestone: string;
    status: string;
  }) {
    return {
      id: row.id,
      quantity: row.quantity,
      amountTnd: C.formatMillimes(row.amountMillimes),
      milestone: row.milestone,
      status: row.status,
      provenance: 'SYNTHETIC' as const,
      bankVerified: false,
    };
  }
  private simulationView(row: {
    id: string;
    payableId: string | null;
    side: string;
    attempt: number;
    status: string;
    amountMillimes: bigint;
    provenance: string;
    bankVerified: boolean;
  }) {
    return {
      id: row.id,
      payableId: row.payableId,
      side: row.side,
      attempt: row.attempt,
      status: row.status,
      amountTnd: C.formatMillimes(row.amountMillimes),
      provenance: row.provenance,
      bankVerified: row.bankVerified,
      label: 'Simulated. This is not a bank transfer.',
      evidence: C.syntheticEvidence(
        'payment.simulation',
        'Simulated settlement',
        '/evidence#payments',
        [
          'A simulated outcome is not a bank transfer, independently verified receipt or reduction of an artisan obligation.',
        ],
      ),
    };
  }
  private async loadShipments(tx: Db, orderId: string) {
    return tx.shipment.findMany({
      where: { orderId },
      include: {
        items: true,
        pickups: { orderBy: { createdAt: 'asc' } },
        handovers: { include: { confirmation: true }, orderBy: { recordedAt: 'asc' } },
        deliveryReport: true,
        buyerConfirmation: { include: { discrepancy: true } },
        order: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  private async visibleShipment(tx: Db, actor: Actor, shipmentId: string) {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        items: true,
        pickups: { orderBy: { createdAt: 'asc' } },
        handovers: { include: { confirmation: true }, orderBy: { recordedAt: 'asc' } },
        deliveryReport: true,
        buyerConfirmation: { include: { discrepancy: true } },
        order: { include: { rfq: { include: { craftSkill: true } } } },
      },
    });
    if (!shipment) fail(404, 'NOT_FOUND', 'Shipment not found.');
    const access = await this.orderAccess(tx, actor, shipment.orderId);
    if (!access.logistics && !access.buyer) fail(404, 'NOT_FOUND', 'Shipment not found.');
    return { shipment, ...access };
  }
  private async operatorShipment(tx: Db, actor: Actor, shipmentId: string) {
    const loaded = await this.visibleShipment(tx, actor, shipmentId);
    if (!loaded.logistics) fail(403, 'FORBIDDEN', 'Logistics permission is required.');
    return loaded;
  }
  private async buyerShipment(tx: Db, actor: Actor, shipmentId: string) {
    const loaded = await this.visibleShipment(tx, actor, shipmentId);
    if (!loaded.confirm)
      fail(
        loaded.buyer ? 403 : 404,
        loaded.buyer ? 'FORBIDDEN' : 'NOT_FOUND',
        loaded.buyer ? 'Delivery confirmation permission is required.' : 'Shipment not found.',
      );
    return loaded;
  }
  private async custodyShipment(tx: Db, actor: Actor, shipmentId: string, eventType: string) {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        items: true,
        pickups: true,
        handovers: { include: { confirmation: true } },
        order: { include: { rfq: { include: { craftSkill: true } } } },
      },
    });
    if (!shipment) fail(404, 'NOT_FOUND', 'Shipment not found.');
    const orgs = await this.coordinatorOrgs(tx, actor);
    const associationId = shipment.pickups[0]?.associationOrganizationId;
    const coordinator = Boolean(
      associationId && orgs.includes(associationId) && eventType === 'COLLECTED_FROM_ASSOCIATION',
    );
    if (coordinator) return { shipment, logistics: false, coordinator: true };
    const access = await this.orderAccess(tx, actor, shipment.orderId);
    if (!access.logistics) fail(404, 'NOT_FOUND', 'Shipment not found.');
    return { shipment, logistics: true, coordinator: false };
  }
  private async logistics(tx: Db, actor: Actor, orderId: string) {
    const access = await this.orderAccess(tx, actor, orderId);
    if (!access.logistics)
      fail(
        access.buyer || access.finance ? 403 : 404,
        access.buyer || access.finance ? 'FORBIDDEN' : 'NOT_FOUND',
        access.buyer || access.finance ? 'Logistics permission is required.' : 'Order not found.',
      );
    return access;
  }
  private async payout(tx: Db, actor: Actor, orderId: string) {
    const access = await this.orderAccess(tx, actor, orderId);
    if (!access.payout) fail(404, 'NOT_FOUND', 'Order not found.');
    return access;
  }
  private async simulator(tx: Db, actor: Actor, orderId: string) {
    const access = await this.orderAccess(tx, actor, orderId);
    if (!access.simulate)
      fail(
        access.finance ? 403 : 404,
        access.finance ? 'FORBIDDEN' : 'NOT_FOUND',
        access.finance ? 'Payment simulation permission is required.' : 'Order not found.',
      );
    return access;
  }
  private async publication(tx: Db, actor: Actor, publicationId: string, publisher: boolean) {
    const row = await tx.traceabilityPublication.findUnique({ where: { id: publicationId } });
    if (!row) fail(404, 'NOT_FOUND', 'Traceability record not found.');
    const access = await this.orderAccess(tx, actor, row.orderId);
    if (publisher ? !access.publish : !access.logistics)
      fail(404, 'NOT_FOUND', 'Traceability record not found.');
    return { row, access };
  }
  private async orderAccess(tx: Db, actor: Actor, orderId: string): Promise<OrderAccess> {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      include: { rfq: { include: { craftSkill: true } } },
    });
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { approvalStatus: 'APPROVED' },
        organizationId: { in: [order.rfq.buyerOrganizationId, order.rfq.operatorOrganizationId] },
      },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    if (!members.length) fail(404, 'NOT_FOUND', 'Order not found.');
    const internal = members.find(
      (member) =>
        member.organizationId === order.rfq.operatorOrganizationId &&
        member.organization.type === 'INTERNAL',
    );
    const permissions = internal ? C.permissionsForMembership(internal) : [];
    const assigned = internal
      ? await tx.operatorAssignment.findFirst({
          where: {
            operatorId: actor.id,
            organizationId: order.rfq.buyerOrganizationId,
            revokedAt: null,
          },
        })
      : null;
    const buyerMember = members.find(
      (member) =>
        member.organizationId === order.rfq.buyerOrganizationId &&
        member.organization.type === 'BUYER_BUSINESS',
    );
    const buyerPermissions = buyerMember ? C.permissionsForMembership(buyerMember) : [];
    return {
      order,
      logistics: Boolean(assigned && permissions.includes('operator.logistics.manage')),
      publish: Boolean(assigned && permissions.includes('operator.traceability.publish')),
      finance: Boolean(
        assigned &&
          (permissions.includes('finance.quotation.read') ||
            permissions.includes('operator.accounts.read')),
      ),
      payout: Boolean(assigned && permissions.includes('finance.payout.read')),
      reconcile: Boolean(assigned && permissions.includes('finance.payable.reconcile')),
      simulate: Boolean(assigned && permissions.includes('operator.payment.record')),
      buyer: Boolean(buyerMember),
      confirm: buyerPermissions.includes('buyer.delivery.confirm'),
    };
  }
  private async coordinatorOrgs(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
      },
      include: { roles: true, permissionGrants: true },
    });
    return members
      .filter((member) =>
        C.permissionsForMembership(member).includes('association.handover.record'),
      )
      .map((member) => member.organizationId);
  }
  private async coordinatorMember(tx: Db, userId: string, organizationId: string) {
    const member = await tx.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
      },
    });
    if (!member)
      fail(409, 'COORDINATOR_UNASSIGNED', 'Choose an active coordinator of this association.');
  }
  private window(start: string, end: string) {
    const from = new Date(start);
    const to = new Date(end);
    C.requireRule(
      !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from,
      'INVALID_DATE',
      'The pickup window must end after it starts.',
    );
  }
  private past(value: string) {
    const date = new Date(value);
    C.requireRule(
      !Number.isNaN(date.getTime()) && date.getTime() <= Date.now() + 60_000,
      'INVALID_DATE',
      'The occurrence time cannot be in the future.',
    );
    return date;
  }
  private version(actual: number, expected: number) {
    C.requireRule(
      actual === expected,
      'VERSION_CONFLICT',
      'This record changed. Reload before trying again.',
    );
  }
  private story(value: string) {
    C.requireRule(
      !value.includes('@') && !/\d{6,}/.test(value),
      'INVALID_STORY',
      'The public story cannot include a contact address or number.',
    );
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    id: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    fn: () => Promise<T>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId: id, operation: `logistics.${operation}`, key },
      json(input),
      fn,
    );
  }
}
