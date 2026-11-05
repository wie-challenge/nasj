import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';
import { ProductionOfferService } from '../procurement/production-offers.js';
import {
  buyerFeedbackAuthority,
  eligibleFollowUpOwners,
  feedbackLimitationNotes,
  feedbackHistoryView,
  feedbackOrder,
  feedbackView,
  supportFeedbackAuthority,
  visibleTicketIds,
} from './order-feedback.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Operational collaboration. A coordinator may add to or act on a report, but never rewrite the
 * artisan's original words. Acceptance of work remains the artisan's own act.
 */
@Injectable()
export class CollaborationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductionOfferService) private readonly offers: ProductionOfferService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async workspace(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      const orderIds = access.orderIds;
      const batchScope =
        access.internal || access.buyer || access.platform
          ? {}
          : {
              batch: {
                artisanProfileId: { in: [access.artisanProfileId ?? '', ...access.coordinatorFor] },
              },
            };
      const [
        exceptions,
        revisions,
        counteroffers,
        pause,
        tickets,
        discussions,
        preferences,
        notifications,
        feedback,
      ] = await Promise.all([
        tx.productionException.findMany({
          where: access.platform
            ? {}
            : { orderId: { in: orderIds.length ? orderIds : [''] }, ...batchScope },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            batch: true,
            order: { include: { rfq: true } },
            assignedCoordinator: { select: { name: true } },
          },
        }),
        tx.scheduleRevision.findMany({
          include: { batch: true, order: { include: { rfq: true } } },
          where: access.platform
            ? {}
            : { orderId: { in: orderIds.length ? orderIds : [''] }, ...batchScope },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.counteroffer.findMany({
          include: {
            offer: { include: { order: { include: { rfq: true } } } },
            revisedOffer: true,
          },
          where: access.artisanProfileId
            ? { offer: { artisanProfileId: access.artisanProfileId } }
            : access.platform
              ? {}
              : { offer: { orderId: { in: orderIds.length ? orderIds : [''] } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        access.artisanProfileId
          ? tx.availabilityPause.findFirst({
              where: { artisanProfileId: access.artisanProfileId, resumedAt: null },
              orderBy: { pausedAt: 'desc' },
            })
          : Promise.resolve(null),
        tx.supportTicket.findMany({
          where: access.platform
            ? {}
            : access.supportOperator
              ? {
                  OR: [
                    { reporterId: actor.id },
                    { organizationId: { in: access.supportOrganizationIds } },
                  ],
                }
              : { reporterId: actor.id },
          include: {
            events: { orderBy: { createdAt: 'desc' } },
            attachments: { select: { id: true, filename: true, mime: true, sha256: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.orderDiscussion.findMany({
          where: access.platform ? {} : { orderId: { in: orderIds.length ? orderIds : [''] } },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        tx.notificationPreference.findMany({ where: { userId: actor.id } }),
        tx.notificationDelivery.findMany({
          where: { userId: actor.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        (async () => {
          const buyerOrders = await this.feedbackBuyerOrders(tx, actor);
          const supportOrders = await this.feedbackSupportOrders(tx, actor);
          const scope = [
            ...(buyerOrders.length ? [{ reporterId: actor.id, orderId: { in: buyerOrders } }] : []),
            ...(supportOrders.length ? [{ orderId: { in: supportOrders } }] : []),
          ] as Prisma.BuyerOrderFeedbackWhereInput[];
          if (!scope.length)
            return {
              items: [],
              followUpOwners: [],
            } satisfies Pick<C.FeedbackListResponse, 'items' | 'followUpOwners'>;
          const owners = supportOrders.length
            ? await this.feedbackWorkspaceOwners(tx, supportOrders)
            : [];
          const collected = await this.feedbackCollection(tx, actor, scope, 1, 20);
          return { items: collected.items, followUpOwners: owners };
        })(),
      ]);

      const batches = await tx.commercialBatch.findMany({
        where: access.platform
          ? {}
          : {
              OR: [
                {
                  artisanProfileId: {
                    in: [access.artisanProfileId ?? '', ...access.coordinatorFor],
                  },
                },
                {
                  order: {
                    rfq: { operatorOrganizationId: { in: access.operatorOrganizationIds } },
                  },
                },
              ],
            },
        include: { offer: true, artisanProfile: true, order: { include: { rfq: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const coordinatorAssignments = await tx.artisanAssignment.findMany({
        where: { artisanProfileId: { in: batches.map((b) => b.artisanProfileId) }, endedAt: null },
        include: { coordinator: { select: { name: true } } },
      });
      const responsible = (profileId: string) =>
        coordinatorAssignments
          .filter((a) => a.artisanProfileId === profileId)
          .map((a) => a.coordinator.name)
          .join(', ') || null;
      const ownOffers = access.artisanProfileId
        ? await tx.commercialOffer.findMany({
            where: {
              artisanProfileId: access.artisanProfileId,
              status: 'OFFERED',
              expiresAt: { gt: new Date() },
            },
            include: { order: { include: { rfq: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : [];
      const target = (batch: (typeof batches)[number]): C.CollaborationTarget => ({
        id: batch.id,
        label: `${batch.artisanProfile.displayName} — ${batch.id.slice(-8)}`,
        coordinator: responsible(batch.artisanProfileId),
        version: batch.offer.version,
        terms: this.terms(batch.offer, batch.order.rfq.deliveryAt),
      });
      const view: C.CollaborationWorkspaceView = {
        creation: {
          exceptionBatches: batches.map(target),
          scheduleBatches: batches
            .filter(
              (b) =>
                access.platform ||
                access.coordinatorFor.includes(b.artisanProfileId) ||
                access.operatorOrganizationIds.includes(b.order.rfq.operatorOrganizationId),
            )
            .map(target),
          counterOffers: ownOffers.map((offer) => ({
            id: offer.id,
            label: `Offer ${offer.id.slice(-8)} — ${offer.quantity} pieces`,
            version: offer.version,
            terms: this.terms(offer, offer.order.rfq.deliveryAt),
          })),
        },
        exceptions: exceptions.map((row) => ({
          canManage:
            access.platform ||
            access.coordinatorFor.includes(row.batch.artisanProfileId) ||
            access.operatorOrganizationIds.includes(row.order.rfq.operatorOrganizationId),
          coordinator: row.assignedCoordinator?.name ?? responsible(row.batch.artisanProfileId),
          id: row.id,
          affectedQuantity: row.affectedQuantity,
          affectedDate: row.affectedDate?.toISOString() ?? null,
          batchId: row.batchId,
          orderId: row.orderId,
          category: row.category as C.ExceptionCategory,
          severity: row.severity,
          description: row.description,
          evidenceReference: row.evidenceReference,
          status: row.status as C.ExceptionState,
          reporterRole: row.reporterRole,
          resolution: row.resolution,
          createdAt: row.createdAt.toISOString(),
          blocksReadiness: C.exceptionBlocksReadiness({
            category: row.category as C.ExceptionCategory,
            severity: row.severity,
            state: row.status as C.ExceptionState,
          }),
        })),
        scheduleRevisions: revisions.map((row) => ({
          decisions:
            (row.impact as { decisions?: C.ScheduleRevisionView['decisions'] }).decisions ?? [],
          canDecide:
            (access.artisanProfileId === row.batch.artisanProfileId && !row.artisanApprovedById) ||
            (access.buyerDecisionOrganizationIds.includes(row.order.rfq.buyerOrganizationId) &&
              !row.buyerApprovedById),
          id: row.id,
          batchId: row.batchId,
          previousDeadline: row.previousDeadline.toISOString(),
          proposedDeadline: row.proposedDeadline.toISOString(),
          reason: row.reason,
          status: row.status as C.ScheduleRevisionState,
          effect: C.scheduleRevisionEffect({
            status: row.status as C.ScheduleRevisionState,
            previousDeadline: row.previousDeadline.toISOString(),
            proposedDeadline: row.proposedDeadline.toISOString(),
          }),
          impact: row.impact,
          buyerApproved: Boolean(row.buyerApprovedById),
          artisanApproved: Boolean(row.artisanApprovedById),
          createdAt: row.createdAt.toISOString(),
        })),
        counteroffers: counteroffers.map((row) => ({
          canReview:
            access.operatorOrganizationIds.includes(row.offer.order.rfq.operatorOrganizationId) &&
            access.assignedBuyerIds.includes(row.offer.order.rfq.buyerOrganizationId),
          canConfirm: access.artisanProfileId === row.offer.artisanProfileId,
          original:
            row.originalTerms &&
            typeof row.originalTerms === 'object' &&
            'effort' in row.originalTerms
              ? (row.originalTerms as unknown as C.CollaborationTerms)
              : this.terms(row.offer, row.offer.order.rfq.deliveryAt),
          proposed: row.revisedOffer
            ? this.terms(row.revisedOffer, row.offer.order.rfq.deliveryAt)
            : this.proposedTerms(
                this.terms(row.offer, row.offer.order.rfq.deliveryAt),
                row.proposedQuantity,
                row.proposedDeadline.toISOString(),
              ),
          reviewNote: row.reviewNote,
          id: row.id,
          offerId: row.offerId,
          revisedOfferId: row.revisedOfferId,
          unitPayTnd: C.formatTnd((row.revisedOffer ?? row.offer).unitPayMillimes),
          totalPayTnd: C.formatTnd(
            C.payableForUnits(
              (row.revisedOffer ?? row.offer).unitPayMillimes,
              row.proposedQuantity,
            ),
          ),
          effort:
            row.revisedOffer?.estimatedHours ??
            'Pending manager review; original effort does not imply revised working time.',
          materials: (row.revisedOffer ?? row.offer).materials,
          proposedQuantity: row.proposedQuantity,
          proposedDeadline: row.proposedDeadline.toISOString(),
          clarification: row.clarification,
          status: row.status as C.CounterofferState,
          createsAgreement: C.counterofferCreatesAgreement(row.status as C.CounterofferState),
          createdAt: row.createdAt.toISOString(),
        })),
        availabilityPause: pause
          ? {
              pausedAt: pause.pausedAt.toISOString(),
              effectiveFrom: pause.effectiveFrom.toISOString(),
              reason: pause.reason,
            }
          : null,
        tickets: tickets.map((row) => ({
          id: row.id,
          category: row.category as C.SupportTicketCategory,
          relatedType: row.relatedType,
          relatedId: row.relatedId,
          description: row.description,
          status: row.status as C.SupportTicketState,
          priority: row.priority,
          resolution: row.resolution,
          createdAt: row.createdAt.toISOString(),
          privacyScope: row.privacyScope,
          ownerId: row.ownerId,
          dueAt: row.dueAt?.toISOString() ?? null,
          attachments: row.attachments,
          events: row.events.map((event) => ({
            id: event.id,
            kind: event.kind,
            detail: event.detail,
            createdAt: event.createdAt.toISOString(),
          })),
        })),
        discussions: discussions.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          body:
            row.messages.find((message) => !message.internalOnly || access.internal)?.body ?? '',
          createdAt: row.createdAt.toISOString(),
          messages: row.messages
            .filter((message) => !message.internalOnly || access.internal)
            .map((message) => ({
              id: message.id,
              body: message.body,
              internalOnly: message.internalOnly,
              deliveryStatus: 'STORED',
              createdAt: message.createdAt.toISOString(),
            })),
        })),
        notificationPreferences: preferences.map((row) => ({
          category: row.category,
          channel: row.channel,
          optedIn: row.optedIn,
        })),
        notifications: notifications.map((row) => ({
          id: row.id,
          category: row.category,
          channel: row.channel,
          subject: row.subject,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
        limitations: [
          'A coordinator can add information to a report but cannot overwrite the artisan statement.',
          'A proposed schedule change does not alter the agreed deadline until it is approved.',
          'A counteroffer is not an acceptance and creates no capacity commitment.',
          'Internal financial detail is never visible to buyers in a discussion.',
          'External notification channels stay undeliverable until a provider is configured.',
          ...feedbackLimitationNotes,
        ],
        orderFeedback: feedback.items,
        followUpOwners: feedback.followUpOwners,
      };
      return view;
    });
  }

  async reportException(actor: Actor, input: C.ExceptionReportInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await tx.commercialBatch.findUnique({
        where: { id: input.batchId },
        include: { order: { include: { rfq: true } } },
      });
      if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
      const access = await this.access(tx, actor);
      const permitted =
        access.platform ||
        access.artisanProfileId === batch.artisanProfileId ||
        access.coordinatorFor.includes(batch.artisanProfileId) ||
        access.operatorOrganizationIds.includes(batch.order.rfq.operatorOrganizationId);
      if (!permitted) fail(404, 'NOT_FOUND', 'Batch not found.');
      return this.command(tx, actor, input.batchId, 'exception.report', key, input, async () => {
        const offer = await tx.commercialOffer.findUniqueOrThrow({ where: { id: batch.offerId } });
        this.expectVersion(input.expectedVersion, offer.version);
        const reported = await tx.productionException.create({
          data: {
            batchId: batch.id,
            orderId: batch.orderId,
            reporterId: actor.id,
            reporterRole:
              access.artisanProfileId === batch.artisanProfileId ? 'ARTISAN' : 'COORDINATOR',
            category: input.category,
            severity: input.severity,
            description: input.description,
            evidenceReference: input.evidenceReference,
            affectedQuantity: input.affectedQuantity ?? null,
            affectedDate: input.affectedDate ? new Date(input.affectedDate) : null,
            status: 'OPEN',
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.exception.reported',
          targetType: 'ProductionException',
          targetId: reported.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          after: {
            category: input.category,
            severity: input.severity,
            status: 'OPEN',
            provenance: 'SYNTHETIC',
          },
        });
        // The responsible coordinator is the operator organization's members for this buyer, plus
        // the reporter so they see their own report was received.
        const coordinators = await tx.operatorAssignment.findMany({
          where: { organizationId: batch.order.rfq.buyerOrganizationId, revokedAt: null },
          select: { operatorId: true },
          take: 10,
        });
        const assigned = await tx.artisanAssignment.findMany({
          where: { artisanProfileId: batch.artisanProfileId, endedAt: null },
          select: { coordinatorId: true },
        });
        const recipients = [
          ...new Set([
            actor.id,
            ...coordinators.map((row) => row.operatorId),
            ...assigned.map((row) => row.coordinatorId),
          ]),
        ];
        for (const recipient of recipients) {
          await this.notify(tx, {
            userId: recipient,
            category: 'PRODUCTION_EXCEPTION',
            subject: 'Production exception recorded',
            body: `An exception was recorded on batch ${batch.id.slice(0, 8)}.`,
          });
        }
        return { id: reported.id, status: reported.status };
      });
    });
  }

  async updateException(
    actor: Actor,
    exceptionId: string,
    input: C.ExceptionUpdateInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const exception = await tx.productionException.findUnique({
        where: { id: exceptionId },
        include: { batch: true },
      });
      if (!exception) fail(404, 'NOT_FOUND', 'Exception not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.coordinatorFor.includes(exception.batch.artisanProfileId) &&
        !access.operatorOrganizationIds.includes(
          (
            await tx.commercialOrder.findUniqueOrThrow({
              where: { id: exception.orderId },
              include: { rfq: true },
            })
          ).rfq.operatorOrganizationId,
        )
      )
        fail(403, 'FORBIDDEN', 'An assigned coordinator may act on this exception.');
      return this.command(tx, actor, exceptionId, 'exception.update', key, input, async () => {
        if (!C.canTransitionException(exception.status as C.ExceptionState, input.status))
          fail(409, 'INVALID_TRANSITION', 'This exception cannot move to that state.');
        if (input.status === 'RESOLVED' && !input.resolution)
          fail(400, 'RESOLUTION_REQUIRED', 'Record what resolved the exception.');
        const updated = await tx.productionException.update({
          where: { id: exceptionId },
          data: {
            status: input.status,
            resolution: input.resolution || exception.resolution,
            assignedCoordinatorId: actor.id,
            resolvedAt: input.status === 'RESOLVED' ? new Date() : exception.resolvedAt,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.exception.updated',
          targetType: 'ProductionException',
          targetId: exceptionId,
          reason: input.resolution || undefined,
          after: {
            status: updated.status,
            originalReportPreserved: true,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async proposeSchedule(actor: Actor, input: C.ScheduleRevisionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await tx.commercialBatch.findUnique({
        where: { id: input.batchId },
        include: { offer: true, order: { include: { rfq: true } } },
      });
      if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.operatorOrganizationIds.includes(batch.order.rfq.operatorOrganizationId) &&
        !access.coordinatorFor.includes(batch.artisanProfileId)
      )
        fail(403, 'FORBIDDEN', 'A coordinator proposes the schedule; the buyer approves it.');
      return this.command(tx, actor, input.batchId, 'schedule.propose', key, input, async () => {
        const previous = batch.offer.deliveryDeadline ?? batch.order.rfq.deliveryAt;
        const effect = C.scheduleRevisionEffect({
          status: 'PENDING_APPROVAL',
          previousDeadline: previous.toISOString(),
          proposedDeadline: input.proposedDeadline,
        });
        this.expectVersion(input.expectedVersion, batch.offer.version);
        const created = await tx.scheduleRevision.create({
          data: {
            batchId: batch.id,
            orderId: batch.orderId,
            proposedDeadline: new Date(input.proposedDeadline),
            previousDeadline: previous,
            reason: input.reason,
            impact: json(await this.scheduleImpact(tx, batch, input.proposedDeadline)),
            status: 'PENDING_APPROVAL',
            authorId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.schedule.proposed',
          targetType: 'ScheduleRevision',
          targetId: created.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          reason: input.reason,
          after: {
            previousDeadline: previous.toISOString(),
            proposedDeadline: input.proposedDeadline,
            pendingApproval: true,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: created.id, status: created.status, effect };
      });
    });
  }

  async decideSchedule(
    actor: Actor,
    revisionId: string,
    input: C.ScheduleDecisionInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const revision = await tx.scheduleRevision.findUnique({
        where: { id: revisionId },
        include: { order: { include: { rfq: true } } },
      });
      if (!revision) fail(404, 'NOT_FOUND', 'Schedule revision not found.');
      // A deadline extension changes a buyer commitment, so the buyer decides it.
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: revision.order.rfq.buyerOrganizationId,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      const buyerAuthority = Boolean(
        member && C.permissionsForMembership(member).includes('buyer.quotation.approve'),
      );
      const batch = await tx.commercialBatch.findUniqueOrThrow({
        where: { id: revision.batchId },
        include: { offer: true },
      });
      const access = await this.access(tx, actor);
      const artisanAuthority = access.artisanProfileId === batch.artisanProfileId;
      // Platform administration is governance, not a party to the contract. It may not approve a
      // change to agreed terms in a buyer's or artisan's place.
      if (!buyerAuthority && !artisanAuthority)
        fail(
          403,
          'FORBIDDEN',
          'Only an affected party (the buying organization or the assigned artisan) can decide this change.',
        );
      return this.command(tx, actor, revisionId, 'schedule.decide', key, input, async () => {
        if (!['PENDING_APPROVAL', 'AWAITING_ARTISAN'].includes(revision.status))
          fail(409, 'INVALID_TRANSITION', 'This schedule change is already decided.');
        const currentDeadline = batch.offer.deliveryDeadline ?? revision.order.rfq.deliveryAt;
        if (
          currentDeadline.getTime() !== revision.previousDeadline.getTime() ||
          (revision.impact as { offerVersion?: number }).offerVersion !== batch.offer.version
        )
          fail(
            409,
            'STALE_PROPOSAL',
            'The effective agreement changed. Propose and review new dates.',
          );
        const now = new Date();
        const impactWithDecision = json({
          ...(revision.impact as Record<string, unknown>),
          decisions: [
            ...((revision.impact as { decisions?: C.ScheduleRevisionView['decisions'] })
              .decisions ?? []),
            {
              party: buyerAuthority ? 'Buyer' : 'Artisan',
              decision: input.decision,
              note: input.note,
              at: now.toISOString(),
            },
          ],
        });
        if (input.decision === 'REJECTED') {
          const rejected = await tx.scheduleRevision.update({
            where: { id: revisionId },
            data: {
              status: 'REJECTED',
              impact: impactWithDecision,
              approvedById: actor.id,
              approvedAt: now,
            },
          });
          await audit(tx, actor, {
            action: 'collaboration.schedule.rejected',
            targetType: 'ScheduleRevision',
            targetId: revisionId,
            organizationId: revision.order.rfq.buyerOrganizationId,
            reason: input.note || undefined,
            after: { status: rejected.status, deadlineApplied: false, provenance: 'SYNTHETIC' },
          });
          await this.notify(tx, {
            userId: revision.authorId,
            category: 'SCHEDULE_CHANGE',
            subject: 'Schedule decision',
            body: 'Review the rejected schedule proposal in your authenticated workspace.',
          });
          return {
            id: rejected.id,
            status: rejected.status,
            effectiveDeadline: revision.previousDeadline.toISOString(),
          };
        }
        // The buyer's approval always applies. The artisan's approval is additionally required
        // because a later delivery date changes their own agreed commitment and compensation basis.
        const buyerApproved = buyerAuthority || Boolean(revision.buyerApprovedById);
        const artisanApproved = artisanAuthority || Boolean(revision.artisanApprovedById);
        const status = buyerApproved && artisanApproved ? 'APPROVED' : 'AWAITING_ARTISAN';
        const updated = await tx.scheduleRevision.update({
          where: { id: revisionId },
          data: {
            status,
            impact: impactWithDecision,
            approvedById: buyerApproved && artisanApproved ? actor.id : revision.approvedById,
            approvedAt: buyerApproved && artisanApproved ? now : revision.approvedAt,
            ...(buyerAuthority && !revision.buyerApprovedById
              ? { buyerApprovedById: actor.id, buyerApprovedAt: now }
              : {}),
            ...(artisanAuthority && !revision.artisanApprovedById
              ? { artisanApprovedById: actor.id, artisanApprovedAt: now }
              : {}),
          },
        });
        if (
          status === 'APPROVED' &&
          (revision.impact as { capacityPeriod?: { requiresReassessment?: boolean } })
            .capacityPeriod?.requiresReassessment
        )
          fail(
            409,
            'CAPACITY_REASSESSMENT_REQUIRED',
            'The proposed date falls outside approved capacity. Reassess the period before changing this commitment.',
          );
        if (status === 'APPROVED')
          await tx.commercialOffer.update({
            where: { id: batch.offerId },
            data: { deliveryDeadline: revision.proposedDeadline, version: { increment: 1 } },
          });
        await audit(tx, actor, {
          action: `collaboration.schedule.${status === 'APPROVED' ? 'approved' : 'buyer_approved'}`,
          targetType: 'ScheduleRevision',
          targetId: revisionId,
          organizationId: revision.order.rfq.buyerOrganizationId,
          reason: input.note || undefined,
          after: {
            status,
            deadlineApplied: status === 'APPROVED',
            buyerApproved: buyerApproved,
            artisanApproved: artisanApproved,
            provenance: 'SYNTHETIC',
          },
        });
        await this.notify(tx, {
          userId: revision.authorId,
          category: 'SCHEDULE_CHANGE',
          subject: 'Schedule decision',
          body: 'Review the recorded party decision in your authenticated workspace.',
        });
        return {
          id: updated.id,
          status: updated.status,
          effectiveDeadline: (status === 'APPROVED'
            ? revision.proposedDeadline
            : revision.previousDeadline
          ).toISOString(),
        };
      });
    });
  }

  async counter(actor: Actor, input: C.CounterofferInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const offer = await tx.commercialOffer.findUnique({
        where: { id: input.offerId },
        include: { order: { include: { rfq: true } } },
      });
      if (!offer) fail(404, 'NOT_FOUND', 'Offer not found.');
      const access = await this.access(tx, actor);
      if (access.artisanProfileId !== offer.artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan receiving an offer can counter it.');
      return this.command(tx, actor, input.offerId, 'counter.propose', key, input, async () => {
        this.expectVersion(input.expectedVersion, offer.version);
        if (!['PLANNED', 'OFFERED'].includes(offer.status))
          fail(409, 'OFFER_NOT_OPEN', 'Only an open offer can be countered.');
        if (offer.expiresAt <= new Date()) fail(409, 'OFFER_EXPIRED', 'This offer has expired.');
        const created = await tx.counteroffer.create({
          data: {
            offerId: input.offerId,
            originalTerms: json({
              ...this.terms(offer, offer.order.rfq.deliveryAt),
              offerVersion: offer.version,
              termsSha256: offer.termsSha256,
            }),
            proposedQuantity: input.proposedQuantity,
            proposedDeadline: new Date(input.proposedDeadline),
            clarification: input.clarification,
            status: 'PROPOSED',
            authorUserId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.proposed',
          targetType: 'Counteroffer',
          targetId: created.id,
          after: {
            offerId: input.offerId,
            proposedQuantity: input.proposedQuantity,
            createsAgreement: false,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: created.id, status: created.status };
      });
    });
  }

  async reviewCounter(
    actor: Actor,
    counterId: string,
    input: C.CounterofferReviewInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const counter = await tx.counteroffer.findUnique({
        where: { id: counterId },
        include: { offer: { include: { order: { include: { rfq: true } } } } },
      });
      if (!counter) fail(404, 'NOT_FOUND', 'Counteroffer not found.');
      const access = await this.access(tx, actor);
      if (
        !access.platform &&
        !access.operatorOrganizationIds.includes(counter.offer.order.rfq.operatorOrganizationId)
      )
        fail(403, 'FORBIDDEN', 'A manager reviews changed terms.');
      return this.command(tx, actor, counterId, 'counter.review', key, input, async () => {
        if (counter.status !== 'PROPOSED')
          fail(409, 'INVALID_TRANSITION', 'This counteroffer is already reviewed.');
        if (input.decision === 'APPROVE_TERMS')
          this.expectVersion(
            (counter.originalTerms as { offerVersion?: number } | null)?.offerVersion,
            counter.offer.version,
          );
        const target = input.decision === 'APPROVE_TERMS' ? 'MANAGER_REVIEW' : 'DECLINED';
        const revised =
          input.decision === 'APPROVE_TERMS'
            ? await this.offers.reissueCounter(
                tx,
                actor,
                counter.offerId,
                counter.proposedQuantity,
                counter.proposedDeadline,
              )
            : null;
        const updated = await tx.counteroffer.update({
          where: { id: counterId },
          data: {
            status: target,
            reviewedById: actor.id,
            reviewNote: input.note,
            revisedOfferId: revised?.id,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.reviewed',
          targetType: 'Counteroffer',
          targetId: counterId,
          after: {
            status: updated.status,
            // A manager approving terms is still not the artisan's acceptance.
            createsAgreement: false,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          id: updated.id,
          status: updated.status,
          createsAgreement: false,
          revisedOfferId: revised?.id ?? null,
        };
      });
    });
  }

  /** The artisan explicitly accepts the final terms. This is the only path to agreement. */
  async acceptCounter(actor: Actor, counterId: string, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const counter = await tx.counteroffer.findUnique({
        where: { id: counterId },
        include: { offer: true },
      });
      if (!counter) fail(404, 'NOT_FOUND', 'Counteroffer not found.');
      const access = await this.access(tx, actor);
      if (access.artisanProfileId !== counter.offer.artisanProfileId)
        fail(403, 'FORBIDDEN', 'The artisan must accept the final terms personally.');
      return this.command(tx, actor, counterId, 'counter.accept', key, {}, async () => {
        if (counter.status !== 'MANAGER_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'Final terms are accepted after manager review.');
        const acceptedOffer = counter.revisedOfferId
          ? await tx.commercialOffer.findUnique({
              where: { id: counter.revisedOfferId },
              include: { batch: true },
            })
          : null;
        if (
          acceptedOffer?.status !== 'ACCEPTED' ||
          !acceptedOffer.batch ||
          acceptedOffer.decidedByUserId !== actor.id ||
          acceptedOffer.quantity !== counter.proposedQuantity ||
          acceptedOffer.deliveryDeadline?.getTime() !== counter.proposedDeadline.getTime()
        )
          fail(
            409,
            'EXPLICIT_OFFER_ACCEPTANCE_REQUIRED',
            'Review and explicitly accept the newly issued version in My offers first. Manager review does not create consent.',
          );
        const updated = await tx.counteroffer.update({
          where: { id: counterId },
          data: {
            status: 'ARTISAN_ACCEPTED',
            acceptedById: actor.id,
            acceptedAt: new Date(),
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.counteroffer.accepted',
          targetType: 'Counteroffer',
          targetId: counterId,
          after: {
            status: updated.status,
            createsAgreement: true,
            quantity: counter.proposedQuantity,
            deadline: counter.proposedDeadline.toISOString(),
            offerVersion: acceptedOffer.version,
            offerStatus: acceptedOffer.status,
            termsSha256: acceptedOffer.termsSha256,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          id: updated.id,
          status: updated.status,
          createsAgreement: true,
          offerId: acceptedOffer.id,
          offerStatus: acceptedOffer.status,
          quantity: counter.proposedQuantity,
          deadline: counter.proposedDeadline.toISOString(),
        };
      });
    });
  }

  async pauseAvailability(actor: Actor, input: C.AvailabilityPauseInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      const artisanProfileId = access.artisanProfileId;
      if (!artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan can pause their own availability.');
      const profileId: string = artisanProfileId;
      return this.command(tx, actor, profileId, 'availability.pause', key, input, async () => {
        const existing = await tx.availabilityPause.findFirst({
          where: { artisanProfileId: profileId, resumedAt: null },
        });
        if (existing) fail(409, 'ALREADY_PAUSED', 'Availability is already paused.');
        const pause = await tx.availabilityPause.create({
          data: {
            artisanProfileId: profileId,
            reason: input.reason,
            effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
            actorId: actor.id,
          },
        });
        if (!input.effectiveFrom || new Date(input.effectiveFrom) <= new Date())
          await tx.artisanProfile.update({
            where: { id: profileId },
            data: { availabilityStatus: 'PAUSED' },
          });
        await audit(tx, actor, {
          action: 'collaboration.availability.paused',
          targetType: 'ArtisanProfile',
          targetId: profileId,
          after: {
            reason: input.reason,
            acceptedCommitmentsPreserved: true,
            fairnessEligibilityUnchanged: true,
            provenance: 'SYNTHETIC',
          },
        });
        return {
          pausedAt: pause.pausedAt.toISOString(),
          effectiveFrom: pause.effectiveFrom.toISOString(),
          reason: pause.reason,
        };
      });
    });
  }

  async resumeAvailability(actor: Actor, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.artisanProfileId)
        fail(403, 'FORBIDDEN', 'Only the artisan can resume their own availability.');
      const profileId: string = access.artisanProfileId;
      return this.command(tx, actor, profileId, 'availability.resume', key, {}, async () => {
        const pause = await tx.availabilityPause.findFirst({
          where: { artisanProfileId: profileId, resumedAt: null },
        });
        if (!pause) fail(409, 'NOT_PAUSED', 'Availability is not paused.');
        await tx.availabilityPause.update({
          where: { id: pause.id },
          data: { resumedAt: new Date(), resumedById: actor.id },
        });
        await tx.artisanProfile.update({
          where: { id: profileId },
          data: { availabilityStatus: 'AVAILABLE' },
        });
        await audit(tx, actor, {
          action: 'collaboration.availability.resumed',
          targetType: 'ArtisanProfile',
          targetId: profileId,
          after: { provenance: 'SYNTHETIC' },
        });
        return { available: true };
      });
    });
  }

  async createTicket(actor: Actor, input: C.TicketCreateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      let supportOrganizationId = access.organizationIds[0] ?? null;
      if (input.relatedType === 'PAYABLE') {
        const payable = await tx.artisanPayable.findUnique({
          where: { id: input.relatedId ?? '' },
          include: { order: { include: { rfq: true } }, sampleRequest: true },
        });
        const organizationId =
          payable?.order?.rfq.operatorOrganizationId ??
          payable?.sampleRequest?.operatorOrganizationId;
        if (
          !payable ||
          !organizationId ||
          !(
            payable.artisanProfileId === access.artisanProfileId ||
            access.supportOrganizationIds.includes(organizationId)
          )
        )
          fail(404, 'NOT_FOUND', 'Related resource not found.');
        supportOrganizationId = organizationId;
      } else if (input.relatedType !== 'NONE') {
        const orderId =
          input.relatedType === 'ORDER'
            ? input.relatedId
            : input.relatedType === 'BATCH'
              ? (await tx.commercialBatch.findUnique({ where: { id: input.relatedId ?? '' } }))
                  ?.orderId
              : input.relatedType === 'OFFER'
                ? (await tx.commercialOffer.findUnique({ where: { id: input.relatedId ?? '' } }))
                    ?.orderId
                : null;
        if (!orderId || (!access.platform && !access.orderIds.includes(orderId)))
          fail(
            404,
            'NOT_FOUND',
            'Related resource not found. Use the independent finance dispute workflow for payable remedies.',
          );
        supportOrganizationId = (
          await tx.commercialOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { rfq: true },
          })
        ).rfq.operatorOrganizationId;
      }
      return this.command(tx, actor, actor.id, 'ticket.create', key, input, async () => {
        const ticket = await tx.supportTicket.create({
          data: {
            category: input.category,
            relatedType: input.relatedType === 'NONE' ? null : input.relatedType,
            relatedId: input.relatedId,
            reporterId: actor.id,
            organizationId: supportOrganizationId,
            description: input.description,
            evidenceReference: input.evidenceReference,
            privacyScope: input.privacyScope,
            dueAt: new Date(Date.now() + (input.priority === 'HIGH' ? 86400000 : 3 * 86400000)),
            priority: input.priority,
            status: 'OPEN',
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId: ticket.id,
            actorId: actor.id,
            kind: 'OPENED',
            detail: input.description,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.ticket.opened',
          targetType: 'SupportTicket',
          targetId: ticket.id,
          organizationId: ticket.organizationId ?? undefined,
          after: { category: input.category, status: 'OPEN', provenance: 'SYNTHETIC' },
        });
        return { id: ticket.id, status: ticket.status };
      });
    });
  }

  async updateTicket(actor: Actor, ticketId: string, input: C.TicketUpdateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) fail(404, 'NOT_FOUND', 'Support case not found.');
      const access = await this.access(tx, actor);
      const permitted =
        access.platform ||
        access.supportOrganizationIds.includes(ticket.organizationId ?? '') ||
        (ticket.reporterId === actor.id && ['WITHDRAWN', 'CLOSED'].includes(input.status));
      if (!permitted) fail(403, 'FORBIDDEN', 'Support case management authority is required.');
      return this.command(tx, actor, ticketId, 'ticket.update', key, input, async () => {
        if (!C.canTransitionTicket(ticket.status as C.SupportTicketState, input.status))
          fail(409, 'INVALID_TRANSITION', 'This support case cannot move to that state.');
        if (input.ownerId) {
          const owner = await tx.organizationMember.findFirst({
            where: {
              userId: input.ownerId,
              organizationId: ticket.organizationId ?? '',
              status: 'ACTIVE',
            },
            include: { roles: true, permissionGrants: true, organization: true },
          });
          if (!owner || !C.permissionsForMembership(owner).includes('support.case.manage'))
            fail(403, 'INVALID_OWNER', 'The owner needs support permission in this organization.');
        }
        if (input.status === 'RESOLVED' && !input.resolution)
          fail(400, 'RESOLUTION_REQUIRED', 'Describe the resolution and any independent remedy.');
        const updated = await tx.supportTicket.update({
          where: { id: ticketId },
          data: {
            status: input.status,
            resolution: input.resolution || ticket.resolution,
            ownerId:
              input.ownerId ?? ticket.ownerId ?? (ticket.reporterId === actor.id ? null : actor.id),
            dueAt: input.dueAt ? new Date(input.dueAt) : ticket.dueAt,
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId,
            actorId: actor.id,
            kind: `STATUS_${input.status}`,
            detail: `${input.resolution || 'Status updated.'}${input.remedyReference ? ` Remedy: ${input.remedyReference}` : ''}`,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.ticket.updated',
          targetType: 'SupportTicket',
          targetId: ticketId,
          organizationId: ticket.organizationId ?? undefined,
          reason: input.resolution || undefined,
          after: { status: updated.status, provenance: 'SYNTHETIC' },
        });
        await this.notify(tx, {
          userId: ticket.reporterId,
          category: 'SUPPORT_CASE_UPDATE',
          subject: 'Support case updated',
          body: `Your support case is now ${input.status.toLowerCase().replace(/_/g, ' ')}.`,
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async postDiscussion(actor: Actor, orderId: string, input: C.DiscussionPostInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.platform && !access.orderIds.includes(orderId))
        fail(404, 'NOT_FOUND', 'Order not found.');
      return this.command(tx, actor, orderId, 'discussion.post', key, input, async () => {
        if (input.internalOnly && !access.internal)
          fail(403, 'FORBIDDEN', 'Internal notes require operator authority.');
        const safeBody = C.sanitizeDiscussionBody(input.body);
        if (safeBody.length < 2)
          fail(400, 'EMPTY_MESSAGE', 'A discussion message needs visible text.');
        const discussion = await tx.orderDiscussion.findFirst({ where: { orderId } });
        const target =
          discussion ??
          (await tx.orderDiscussion.create({
            data: {
              orderId,
              authorId: actor.id,
              authorOrganizationId: access.organizationIds[0] ?? null,
              body: safeBody,
            },
          }));
        const message = await tx.discussionMessage.create({
          data: {
            discussionId: target.id,
            authorId: actor.id,
            body: safeBody,
            internalOnly: input.internalOnly,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.discussion.posted',
          targetType: 'OrderDiscussion',
          targetId: target.id,
          after: {
            orderId,
            internalOnly: input.internalOnly,
            containsFinancialDetail: false,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: message.id };
      });
    });
  }

  async setPreference(actor: Actor, input: C.NotificationPreferenceInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      return this.command(tx, actor, actor.id, 'notification.preference', key, input, async () => {
        if (input.language)
          await tx.user.update({
            where: { id: actor.id },
            data: { preferredLanguage: input.language },
          });
        const row = await tx.notificationPreference.upsert({
          where: {
            userId_channel_category: {
              userId: actor.id,
              channel: input.channel as 'EMAIL',
              category: input.category,
            },
          },
          create: {
            userId: actor.id,
            channel: input.channel as 'EMAIL',
            category: input.category,
            optedIn: input.optedIn,
            language: input.language,
          },
          update: {
            optedIn: input.optedIn,
            ...(input.language ? { language: input.language } : {}),
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.notification.preference',
          targetType: 'NotificationPreference',
          targetId: row.id,
          after: {
            category: input.category,
            channel: input.channel,
            optedIn: input.optedIn,
            consentBasis: 'EXPLICIT_USER_PREFERENCE',
            language: input.language ?? null,
            provenance: 'SYNTHETIC',
          },
        });
        return { category: row.category, channel: row.channel, optedIn: row.optedIn };
      });
    });
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Record a notification honestly. External channels without a provider are stored as
   * UNDELIVERABLE and never as sent.
   */
  private async notify(
    tx: Db,
    input: { userId: string; category: C.NotificationCategory; subject: string; body: string },
  ) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: input.userId, category: input.category },
    });
    const preference =
      preferences.find((row) => row.optedIn && row.channel === 'IN_APP') ??
      preferences.find((row) => row.optedIn) ??
      preferences[0];
    const plan = C.notificationPlan({
      category: input.category,
      preference: preference ?? null,
      providerConfigured: this.config.NOTIFICATION_EMAIL_ENABLED,
    });
    const template = C.localizedNotification(
      input.category,
      preference?.language ?? user.preferredLanguage,
    );
    return tx.notificationDelivery.create({
      data: {
        userId: input.userId,
        category: input.category,
        channel: plan.channel ?? C.inAppChannel,
        subject: template.subject,
        body: `${template.body} ${this.config.PUBLIC_APP_URL}/collaboration`,
        locale: template.locale,
        status: plan.deliver && plan.channel === C.inAppChannel ? 'DELIVERED' : plan.status,
        provider: plan.channel ?? C.inAppChannel,
        failureReason: plan.deliver ? '' : plan.note,
        deliveredAt: plan.deliver && plan.channel === C.inAppChannel ? new Date() : null,
      },
    });
  }

  async retryNotification(actor: Actor, deliveryId: string, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.notificationDelivery.findFirst({
        where: { id: deliveryId, userId: actor.id },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Notification not found.');
      return this.command(tx, actor, deliveryId, 'notification.retry', key, {}, async () => {
        if (['DELIVERED', 'SENT', 'PENDING'].includes(row.status))
          return { id: row.id, status: row.status };
        if (['SENDING', 'UNCERTAIN'].includes(row.status))
          fail(
            409,
            'DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN',
            'Delivery acknowledgement is uncertain. Review provider evidence before creating another notification.',
          );
        const preference = await tx.notificationPreference.findFirst({
          where: { userId: actor.id, category: row.category, channel: row.channel as 'EMAIL' },
        });
        const plan = C.notificationPlan({
          category: row.category as C.NotificationCategory,
          preference: preference ?? null,
          providerConfigured: this.config.NOTIFICATION_EMAIL_ENABLED,
        });
        const template = C.localizedNotification(
          row.category as C.NotificationCategory,
          preference?.language ?? 'en',
        );
        const updated = await tx.notificationDelivery.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            locale: template.locale,
            subject: template.subject,
            body: `${template.body} ${this.config.PUBLIC_APP_URL}/collaboration`,
            status: plan.deliver && plan.channel === C.inAppChannel ? 'DELIVERED' : plan.status,
            failureReason: plan.deliver ? '' : plan.note,
            deliveredAt: plan.deliver && plan.channel === C.inAppChannel ? new Date() : null,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.notification.retried',
          targetType: 'NotificationDelivery',
          targetId: row.id,
          before: { status: row.status, attempts: row.attempts, failureReason: row.failureReason },
          after: { status: updated.status, attempts: updated.attempts },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async correctTicket(actor: Actor, ticketId: string, input: { detail: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticketId, reporterId: actor.id },
      });
      if (!ticket) fail(404, 'NOT_FOUND', 'Support case not found.');
      return this.command(tx, actor, ticketId, 'ticket.correct', key, input, async () => {
        const event = await tx.supportTicketEvent.create({
          data: { ticketId, actorId: actor.id, kind: 'REPORTER_CORRECTION', detail: input.detail },
        });
        return { id: event.id, originalPreserved: true };
      });
    });
  }

  private async ticketAccess(tx: Db, actor: Actor, ticketId: string) {
    const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    const access = await this.access(tx, actor);
    if (
      !ticket ||
      !(
        ticket.reporterId === actor.id ||
        access.platform ||
        access.supportOrganizationIds.includes(ticket.organizationId ?? '')
      )
    )
      fail(404, 'NOT_FOUND', 'Support case not found.');
    return ticket;
  }

  async addAttachment(
    actor: Actor,
    ticketId: string,
    input: { filename: string; mime: string; base64: string },
    key?: string,
  ) {
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 262144 || !bytes.length)
      fail(400, 'INVALID_IMAGE', 'Use an image under 256 KiB.');
    let clean: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' });
      const metadata = await image.metadata();
      const types = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
      if (types[metadata.format as keyof typeof types] !== input.mime || (metadata.pages ?? 1) > 1)
        throw Error();
      clean = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      if (clean.length > 262144) throw Error();
    } catch {
      fail(400, 'INVALID_IMAGE', 'Use a valid PNG, JPEG or WebP image under 256 KiB.');
    }
    return iamTransaction(this.db, actor, async (tx) => {
      await this.ticketAccess(tx, actor, ticketId);
      return this.command(
        tx,
        actor,
        ticketId,
        'ticket.attachment',
        key,
        { filename: input.filename, sha256: createHash('sha256').update(bytes).digest('hex') },
        async () => {
          if ((await tx.supportTicketAttachment.count({ where: { ticketId } })) >= 5)
            fail(409, 'ATTACHMENT_LIMIT', 'At most five images are allowed.');
          const row = await tx.supportTicketAttachment.create({
            data: {
              ticketId,
              authorId: actor.id,
              filename: `${input.filename.replace(/\.[^.]+$/, '')}.webp`,
              mime: 'image/webp',
              bytes: new Uint8Array(clean),
              sha256: createHash('sha256').update(clean).digest('hex'),
            },
          });
          await tx.supportTicketEvent.create({
            data: { ticketId, actorId: actor.id, kind: 'ATTACHMENT_ADDED', detail: row.id },
          });
          return { id: row.id, sha256: row.sha256 };
        },
      );
    });
  }

  async attachment(actor: Actor, ticketId: string, attachmentId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.ticketAccess(tx, actor, ticketId);
      const row = await tx.supportTicketAttachment.findFirst({
        where: { id: attachmentId, ticketId },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Attachment not found.');
      return {
        filename: row.filename,
        mime: row.mime,
        base64: Buffer.from(row.bytes).toString('base64'),
        sha256: row.sha256,
      };
    });
  }

  /* ------------------------------------------------------ buyer order feedback */

  private feedbackRevisionInclude = {
    revisions: {
      orderBy: { version: 'desc' },
      take: 1,
      include: {
        actor: { select: { id: true, name: true } },
        followUpOwner: { select: { id: true, name: true } },
      },
    },
  } as const;

  private async feedbackRow(tx: Db, feedbackId: string) {
    const row = await tx.buyerOrderFeedback.findUnique({
      where: { id: feedbackId },
      include: {
        revisions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            actor: { select: { id: true, name: true } },
            followUpOwner: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) fail(404, 'NOT_FOUND', 'Feedback not found.');
    return row;
  }

  /** Buyer author, or the scoped support operator currently responsible for this buyer. */
  private async feedbackScope(tx: Db, actor: Actor, feedbackId: string) {
    const row = await this.feedbackRow(tx, feedbackId);
    const order = await feedbackOrder(tx, row.orderId);
    const buyer = await buyerFeedbackAuthority(tx, actor, order);
    const support = await supportFeedbackAuthority(tx, actor, order);
    const author = row.reporterId === actor.id && Boolean(buyer?.canRead);
    const supportReviewer = Boolean(support?.canManage && support.assignmentActive);
    if (!author && !supportReviewer) fail(404, 'NOT_FOUND', 'Feedback not found.');
    return { row, order, buyer, support, author, supportReviewer };
  }

  async listOrderFeedback(actor: Actor, query: C.FeedbackListQuery) {
    return iamTransaction(this.db, actor, async (tx) => {
      if (query.orderId) {
        const order = await feedbackOrder(tx, query.orderId);
        const buyer = await buyerFeedbackAuthority(tx, actor, order);
        const support = await supportFeedbackAuthority(tx, actor, order);
        const supportReviewer = Boolean(support?.canManage && support.assignmentActive);
        if (!buyer?.canRead && !supportReviewer) fail(404, 'NOT_FOUND', 'Order not found.');
        const where = supportReviewer
          ? { orderId: order.id }
          : { orderId: order.id, reporterId: actor.id };
        const [rows, total, receipts, owners] = await Promise.all([
          tx.buyerOrderFeedback.findMany({
            where,
            include: this.feedbackRevisionInclude,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.buyerOrderFeedback.count({ where }),
          buyer?.canRead
            ? tx.buyerDeliveryConfirmation.findMany({
                where: { received: { gt: 0 }, shipment: { orderId: order.id } },
                select: {
                  id: true,
                  shipmentId: true,
                  received: true,
                  accepted: true,
                  missing: true,
                  damaged: true,
                  provenance: true,
                  // Immutable facts needed to attribute an unaccounted piece to the operator or the
                  // buyer without reading the stored `missing` value, whose meaning changed in
                  // Batch 1.
                  shipment: {
                    select: {
                      items: { select: { quantity: true } },
                      deliveryReport: { select: { quantity: true } },
                    },
                  },
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 20,
              })
            : Promise.resolve([]),
          supportReviewer ? eligibleFollowUpOwners(tx, order) : Promise.resolve([]),
        ]);
        const visible = await visibleTicketIds(
          tx,
          actor,
          rows.flatMap((row) =>
            row.revisions[0]?.linkedTicketId ? [row.revisions[0].linkedTicketId] : [],
          ),
        );
        const items = rows.map((row) =>
          feedbackView({
            row,
            actorId: actor.id,
            orderProvenance: order.provenance,
            support: supportReviewer,
            visibleTickets: visible,
            canCorrect: Boolean(buyer?.canWrite),
            canManageFollowUp: supportReviewer,
          }),
        );
        return {
          items,
          total,
          page: query.page,
          pageSize: query.pageSize,
          eligibleReceipts: receipts.map((receipt) => {
            const shipped = receipt.shipment.items.reduce((n, item) => n + item.quantity, 0);
            let provenance: ReturnType<typeof C.reconstructReceipt> | null = null;
            try {
              provenance = C.reconstructReceipt({
                shipped,
                operatorReported: receipt.shipment.deliveryReport?.quantity ?? 0,
                buyerReceived: receipt.received,
                storedMissing: receipt.missing,
              });
            } catch {
              // Facts do not conserve: report the limitation instead of guessing an attribution.
              provenance = null;
            }
            return {
              confirmationId: receipt.id,
              shipmentId: receipt.shipmentId,
              received: receipt.received,
              accepted: receipt.accepted,
              missing: receipt.missing,
              damaged: receipt.damaged,
              buyerDeclaredMissing: provenance?.buyerDeclaredMissing ?? 0,
              notReportedByOperator: provenance?.operatorNotReported ?? 0,
              provenanceComplete: Boolean(provenance),
              provenance: receipt.provenance,
            };
          }),
          followUpOwners: owners,
          limitations: feedbackLimitationNotes,
        } satisfies C.FeedbackListResponse;
      }
      const buyerOrders = await this.feedbackBuyerOrders(tx, actor);
      const supportOrders = await this.feedbackSupportOrders(tx, actor);
      const scope = [
        ...(buyerOrders.length ? [{ reporterId: actor.id, orderId: { in: buyerOrders } }] : []),
        ...(supportOrders.length ? [{ orderId: { in: supportOrders } }] : []),
      ];
      if (!scope.length) {
        return {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          eligibleReceipts: [],
          followUpOwners: [],
          limitations: feedbackLimitationNotes,
        } satisfies C.FeedbackListResponse;
      }
      return this.feedbackCollection(tx, actor, scope, query.page, query.pageSize);
    });
  }

  private async feedbackCollection(
    tx: Db,
    actor: Actor,
    scope: Prisma.BuyerOrderFeedbackWhereInput[],
    page: number,
    pageSize: number,
  ) {
    const where = { OR: scope };
    const [rows, total] = await Promise.all([
      tx.buyerOrderFeedback.findMany({
        where,
        include: this.feedbackRevisionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.buyerOrderFeedback.count({ where }),
    ]);
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const orders = await tx.commercialOrder.findMany({
      where: { id: { in: orderIds } },
      include: { rfq: true },
    });
    const orderIndex = new Map(orders.map((order) => [order.id, order]));
    const visible = await visibleTicketIds(
      tx,
      actor,
      rows.flatMap((row) =>
        row.revisions[0]?.linkedTicketId ? [row.revisions[0].linkedTicketId] : [],
      ),
    );
    const management = new Map<string, boolean>();
    for (const order of orders) {
      const support = await supportFeedbackAuthority(tx, actor, order);
      management.set(order.id, Boolean(support?.canManage && support.assignmentActive));
    }
    return {
      items: rows.map((row) =>
        feedbackView({
          row,
          actorId: actor.id,
          orderProvenance: orderIndex.get(row.orderId)?.provenance ?? 'SYNTHETIC',
          support: management.get(row.orderId) ?? false,
          visibleTickets: visible,
          canCorrect: row.reporterId === actor.id,
          canManageFollowUp: management.get(row.orderId) ?? false,
        }),
      ),
      total,
      page,
      pageSize,
      eligibleReceipts: [],
      followUpOwners: [],
      limitations: feedbackLimitationNotes,
    } satisfies C.FeedbackListResponse;
  }

  private async feedbackWorkspaceOwners(tx: Db, orderIds: string[]) {
    const first = orderIds[0]
      ? await tx.commercialOrder.findUnique({
          where: { id: orderIds[0] },
          include: { rfq: true },
        })
      : null;
    if (!first) return [];
    return eligibleFollowUpOwners(tx, first);
  }

  private async feedbackBuyerOrders(tx: Db, actor: Actor) {
    const organizationIds = await this.feedbackBuyerOrganizations(tx, actor);
    if (!organizationIds.length) return [];
    const orders = await tx.commercialOrder.findMany({
      where: { rfq: { buyerOrganizationId: { in: organizationIds } } },
      select: { id: true },
      take: 500,
    });
    return orders.map((order) => order.id);
  }

  private async feedbackBuyerOrganizations(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    return members
      .filter((member) => member.organization.type === 'BUYER_BUSINESS')
      .filter((member) => {
        const permissions = C.permissionsForMembership(member);
        return (
          permissions.includes('buyer.rfq.read') || permissions.includes('buyer.delivery.confirm')
        );
      })
      .map((member) => member.organizationId);
  }

  private async feedbackSupportOrders(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const organizationIds = members
      .filter((member) => member.organization.type === 'INTERNAL')
      .filter((member) => C.permissionsForMembership(member).includes('support.case.manage'))
      .map((member) => member.organizationId);
    if (!organizationIds.length) return [];
    const assignments = await tx.operatorAssignment.findMany({
      where: { operatorId: actor.id, revokedAt: null },
      select: { organizationId: true },
    });
    if (!assignments.length) return [];
    const orders = await tx.commercialOrder.findMany({
      where: {
        rfq: {
          operatorOrganizationId: { in: organizationIds },
          buyerOrganizationId: { in: assignments.map((row) => row.organizationId) },
        },
      },
      select: { id: true },
      take: 500,
    });
    return orders.map((order) => order.id);
  }

  async feedbackHistory(actor: Actor, feedbackId: string, query: C.FeedbackHistoryQuery) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.feedbackScope(tx, actor, feedbackId);
      const [rows, total] = await Promise.all([
        tx.buyerOrderFeedbackRevision.findMany({
          where: { feedbackId },
          include: {
            actor: { select: { id: true, name: true } },
            followUpOwner: { select: { id: true, name: true } },
          },
          orderBy: { version: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.buyerOrderFeedbackRevision.count({ where: { feedbackId } }),
      ]);
      const visible = await visibleTicketIds(
        tx,
        actor,
        rows.flatMap((row) => (row.linkedTicketId ? [row.linkedTicketId] : [])),
      );
      return feedbackHistoryView({
        feedbackId,
        rows,
        total,
        page: query.page,
        pageSize: query.pageSize,
        viewerIsReporter: scope.author,
        reporterId: scope.row.reporterId,
        visibleTickets: visible,
      });
    });
  }

  async createOrderFeedback(
    actor: Actor,
    orderId: string,
    input: C.FeedbackCreateInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await feedbackOrder(tx, orderId);
      const buyer = await buyerFeedbackAuthority(tx, actor, order);
      const support = await supportFeedbackAuthority(tx, actor, order);
      if (!buyer && !support) fail(404, 'NOT_FOUND', 'Order not found.');
      if (!buyer?.canWrite)
        fail(403, 'FORBIDDEN', 'Buyer delivery confirmation authority is required.');
      const receipt = await tx.buyerDeliveryConfirmation.findUnique({
        where: { id: input.receiptConfirmationId },
        include: { shipment: { select: { orderId: true } } },
      });
      const eligibility = C.feedbackEligibility({
        receiptExists: Boolean(receipt),
        received: receipt?.received ?? 0,
        accepted: receipt?.accepted ?? 0,
        missing: receipt?.missing ?? 0,
        damaged: receipt?.damaged ?? 0,
        sameOrder: receipt?.shipment.orderId === orderId,
      });
      if (!eligibility.eligible)
        fail(
          409,
          eligibility.reason === 'RECEIPT_ORDER_MISMATCH'
            ? 'RECEIPT_ORDER_MISMATCH'
            : 'NO_CONFIRMED_RECEIPT',
          eligibility.reason === 'RECEIPT_ORDER_MISMATCH'
            ? 'This receipt belongs to another order.'
            : 'Feedback follows your own confirmed receipt of this order. Use the claim workflow when nothing was received.',
        );
      const identity = await tx.demoIdentity.findUnique({ where: { userId: actor.id } });
      const scenario = identity
        ? await tx.demoScenario.findUnique({ where: { id: identity.scenarioId } })
        : null;
      const source = C.deriveFeedbackSource({
        demoScenarioId:
          scenario && scenario.status === 'ACTIVE' && scenario.rfqId === order.rfqId
            ? scenario.id
            : null,
        orderProvenance: order.provenance,
      });
      return this.command(tx, actor, orderId, 'feedback.create', key, input, async () => {
        const existing = await tx.buyerOrderFeedback.findUnique({
          where: { orderId_reporterId: { orderId, reporterId: actor.id } },
          select: { id: true },
        });
        if (existing)
          fail(
            409,
            'DUPLICATE_FEEDBACK',
            'You already assessed this order. Correct the existing assessment instead of creating a second one.',
          );
        const header = await tx.buyerOrderFeedback.create({
          data: {
            orderId,
            reporterId: actor.id,
            receiptConfirmationId: input.receiptConfirmationId,
            sourceClass: source.sourceClass,
            scenarioId: source.scenarioId,
          },
        });
        const revision = await tx.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId: header.id,
            version: 1,
            kind: 'SUBMITTED',
            actorId: actor.id,
            category: input.category,
            rating: input.rating ?? null,
            comment: input.comment,
            followUpStatus: 'OPEN',
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.feedback.submitted',
          targetType: 'BuyerOrderFeedback',
          targetId: header.id,
          organizationId: order.rfq.buyerOrganizationId,
          after: {
            orderId,
            version: 1,
            category: input.category,
            rating: input.rating ?? null,
            hasComment: input.comment.length > 0,
            sourceClass: source.sourceClass,
            provenance: order.provenance,
          },
        });
        return {
          id: header.id,
          version: revision.version,
          category: revision.category,
          followUpStatus: revision.followUpStatus,
          sourceClass: header.sourceClass,
          createdAt: header.createdAt.toISOString(),
        };
      });
    });
  }

  /**
   * Buyer correction: the original statement stays in the history and the new version replaces
   * only buyer-owned fields. Support follow-up state is carried forward unchanged.
   */
  async correctOrderFeedback(
    actor: Actor,
    feedbackId: string,
    input: C.FeedbackCorrectionInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.feedbackScope(tx, actor, feedbackId);
      if (!scope.author) fail(404, 'NOT_FOUND', 'Feedback not found.');
      if (!scope.buyer?.canWrite)
        fail(403, 'FORBIDDEN', 'Buyer delivery confirmation authority is required.');
      return this.command(tx, actor, feedbackId, 'feedback.correct', key, input, async () => {
        const current = await this.feedbackRow(tx, feedbackId);
        if (input.expectedVersion !== current.currentVersion)
          fail(409, 'STALE_VERSION', 'Reload the assessment and retry from the current version.');
        const latest = current.revisions[0];
        if (!latest) fail(409, 'INVALID_STATE', 'This assessment has no recorded statement.');
        const next = current.currentVersion + 1;
        const saved = await tx.buyerOrderFeedback.update({
          where: { id: feedbackId },
          data: { currentVersion: next },
        });
        const revision = await tx.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId,
            version: next,
            kind: 'BUYER_CORRECTION',
            actorId: actor.id,
            category: input.category,
            rating: input.rating === undefined ? latest.rating : input.rating,
            comment: input.comment === undefined ? latest.comment : input.comment,
            followUpStatus: latest.followUpStatus,
            followUpOwnerId: latest.followUpOwnerId,
            followUpNote: latest.followUpNote,
            linkedTicketId: latest.linkedTicketId,
            reason: input.reason,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.feedback.corrected',
          targetType: 'BuyerOrderFeedbackRevision',
          targetId: revision.id,
          organizationId: scope.order.rfq.buyerOrganizationId,
          reason: 'BUYER_CORRECTION',
          before: { version: latest.version, category: latest.category, rating: latest.rating },
          after: {
            version: revision.version,
            category: revision.category,
            rating: revision.rating,
          },
        });
        return {
          id: feedbackId,
          version: saved.currentVersion,
          category: revision.category,
          rating: revision.rating,
          followUpStatus: revision.followUpStatus,
        };
      });
    });
  }

  async followUpOrderFeedback(
    actor: Actor,
    feedbackId: string,
    input: C.FeedbackFollowUpInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.feedbackScope(tx, actor, feedbackId);
      if (!scope.supportReviewer)
        fail(403, 'FORBIDDEN', 'Scoped support follow-up authority is required.');
      return this.command(tx, actor, feedbackId, 'feedback.follow-up', key, input, async () => {
        const current = await this.feedbackRow(tx, feedbackId);
        if (input.expectedVersion !== current.currentVersion)
          fail(409, 'STALE_VERSION', 'Reload the assessment and retry from the current version.');
        const latest = current.revisions[0];
        if (!latest) fail(409, 'INVALID_STATE', 'This assessment has no recorded statement.');
        if (
          !C.canTransitionFeedbackFollowUp(
            latest.followUpStatus as C.FeedbackFollowUpStatus,
            input.status,
          )
        )
          fail(409, 'INVALID_TRANSITION', 'This follow-up state cannot move to that status.');
        if (input.status === 'FOLLOW_UP' && !input.ownerId && !latest.followUpOwnerId)
          fail(400, 'OWNER_REQUIRED', 'Choose the support owner responsible for follow-up.');
        if (input.status === 'RESOLVED' && input.reason.trim().length < 3)
          fail(400, 'REASON_REQUIRED', 'State why this follow-up is resolved.');
        const owners = await eligibleFollowUpOwners(tx, scope.order);
        const ownerId = input.ownerId ?? latest.followUpOwnerId;
        if (input.status === 'FOLLOW_UP' && !owners.some((owner) => owner.id === ownerId))
          fail(403, 'INVALID_OWNER', 'Choose an assigned support manager for this buyer.');
        const next = current.currentVersion + 1;
        const saved = await tx.buyerOrderFeedback.update({
          where: { id: feedbackId },
          data: { currentVersion: next },
        });
        const revision = await tx.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId,
            version: next,
            kind: 'FOLLOW_UP',
            actorId: actor.id,
            category: latest.category,
            rating: latest.rating,
            comment: latest.comment,
            followUpStatus: input.status,
            followUpOwnerId: ownerId ?? null,
            followUpNote: input.note,
            linkedTicketId: latest.linkedTicketId,
            reason: input.reason,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.feedback.follow_up',
          targetType: 'BuyerOrderFeedbackRevision',
          targetId: revision.id,
          organizationId: scope.order.rfq.operatorOrganizationId,
          reason: 'SUPPORT_FOLLOW_UP',
          before: { version: latest.version, followUpStatus: latest.followUpStatus },
          after: {
            version: revision.version,
            followUpStatus: revision.followUpStatus,
            followUpOwnerId: revision.followUpOwnerId,
          },
        });
        return {
          id: feedbackId,
          version: saved.currentVersion,
          followUpStatus: revision.followUpStatus,
          followUpOwnerId: revision.followUpOwnerId,
        };
      });
    });
  }

  /**
   * Linking an existing order claim never creates one, never impersonates the buyer and never
   * changes the ticket's own status. The ticket keeps its lifecycle and its authorization.
   */
  async linkOrderFeedbackCase(
    actor: Actor,
    feedbackId: string,
    input: C.FeedbackCaseLinkInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const scope = await this.feedbackScope(tx, actor, feedbackId);
      if (!scope.supportReviewer)
        fail(403, 'FORBIDDEN', 'Scoped support follow-up authority is required.');
      const ticket = await tx.supportTicket.findUnique({ where: { id: input.ticketId } });
      const visible = ticket ? await this.visibleTicketIdsFor(tx, actor, ticket) : false;
      if (!ticket || !visible) fail(404, 'NOT_FOUND', 'Support case not found.');
      const match = C.feedbackCaseLinkMatches({
        ticketRelatedType: ticket.relatedType,
        ticketRelatedId: ticket.relatedId,
        ticketOrganizationId: ticket.organizationId,
        orderId: scope.row.orderId,
        operatorOrganizationId: scope.order.rfq.operatorOrganizationId,
      });
      if (!match.matches)
        fail(
          409,
          match.reason === 'NOT_ORDER_RELATED'
            ? 'CASE_NOT_ORDER_RELATED'
            : match.reason === 'DIFFERENT_ORDER'
              ? 'CASE_ORDER_MISMATCH'
              : 'CASE_OPERATOR_MISMATCH',
          'Link a support case that belongs to this exact order and operating organization.',
        );
      return this.command(tx, actor, feedbackId, 'feedback.case-link', key, input, async () => {
        const current = await this.feedbackRow(tx, feedbackId);
        if (input.expectedVersion !== current.currentVersion)
          fail(409, 'STALE_VERSION', 'Reload the assessment and retry from the current version.');
        const latest = current.revisions[0];
        if (!latest) fail(409, 'INVALID_STATE', 'This assessment has no recorded statement.');
        const next = current.currentVersion + 1;
        const saved = await tx.buyerOrderFeedback.update({
          where: { id: feedbackId },
          data: { currentVersion: next },
        });
        const revision = await tx.buyerOrderFeedbackRevision.create({
          data: {
            feedbackId,
            version: next,
            kind: 'CASE_LINK',
            actorId: actor.id,
            category: latest.category,
            rating: latest.rating,
            comment: latest.comment,
            followUpStatus: latest.followUpStatus,
            followUpOwnerId: latest.followUpOwnerId,
            followUpNote: latest.followUpNote,
            linkedTicketId: ticket.id,
            reason: input.reason,
          },
        });
        await tx.supportTicketEvent.create({
          data: {
            ticketId: ticket.id,
            actorId: actor.id,
            kind: 'FEEDBACK_LINKED',
            detail: `Linked to private buyer feedback ${feedbackId} version ${revision.version}.`,
          },
        });
        await audit(tx, actor, {
          action: 'collaboration.feedback.case_linked',
          targetType: 'BuyerOrderFeedbackRevision',
          targetId: revision.id,
          organizationId: scope.order.rfq.operatorOrganizationId,
          reason: 'FORMAL_CASE_LINK',
          after: {
            version: revision.version,
            ticketId: ticket.id,
            ticketStatus: ticket.status,
            orderId: scope.row.orderId,
          },
        });
        return {
          id: feedbackId,
          version: saved.currentVersion,
          linkedTicketId: ticket.id,
          linkedTicketStatus: ticket.status,
        };
      });
    });
  }

  private async visibleTicketIdsFor(
    tx: Db,
    actor: Actor,
    ticket: { reporterId: string; organizationId: string | null },
  ) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const platform = members.some((member) =>
      C.permissionsForMembership(member).includes('platform.roles.manage'),
    );
    const support = members.some(
      (member) =>
        member.organizationId === ticket.organizationId &&
        C.permissionsForMembership(member).includes('support.case.manage'),
    );
    return platform || support || ticket.reporterId === actor.id;
  }

  private expectVersion(expected: number | undefined, current: number) {
    if (expected !== undefined && expected !== current)
      fail(
        409,
        'STALE_PROPOSAL',
        'The agreement changed. Refresh the choices and preview the current terms.',
      );
  }

  private terms(
    offer: {
      quantity: number;
      deliveryDeadline: Date | null;
      unitPayMillimes: bigint;
      estimatedHours: string;
      materials: string;
    },
    fallback: Date,
  ): C.CollaborationTerms {
    return {
      quantity: offer.quantity,
      deadline: (offer.deliveryDeadline ?? fallback).toISOString(),
      unitPayTnd: C.formatTnd(offer.unitPayMillimes),
      totalPayTnd: C.formatTnd(C.payableForUnits(offer.unitPayMillimes, offer.quantity)),
      effort: offer.estimatedHours,
      materials: offer.materials,
    };
  }
  private proposedTerms(
    original: C.CollaborationTerms,
    quantity: number,
    deadline: string,
  ): C.CollaborationTerms {
    return {
      ...original,
      quantity,
      deadline,
      totalPayTnd: C.formatTnd(C.payableForUnits(C.parseTnd(original.unitPayTnd), quantity)),
      effort:
        'Unknown until manager review and newly issued terms. Pay shown uses the original unit rate pending review.',
    };
  }

  private async scheduleImpact(
    tx: Db,
    batch: Prisma.CommercialBatchGetPayload<{
      include: { offer: true; order: { include: { rfq: true } } };
    }>,
    proposedDeadline: string,
  ) {
    const effect = C.scheduleRevisionEffect({
      status: 'PENDING_APPROVAL',
      previousDeadline: (batch.offer.deliveryDeadline ?? batch.order.rfq.deliveryAt).toISOString(),
      proposedDeadline,
    });
    const declaration = await tx.capacityDeclaration.findUniqueOrThrow({
      where: { id: batch.offer.capacityDeclarationId },
    });
    const exceptions = await tx.productionException.findMany({
      where: { batchId: batch.id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: {
        id: true,
        category: true,
        severity: true,
        affectedQuantity: true,
        affectedDate: true,
      },
    });
    return {
      offerVersion: batch.offer.version,
      buyerDeadline: batch.order.rfq.deliveryAt.toISOString(),
      capacityPeriod: {
        from: declaration.effectiveFrom.toISOString(),
        to: declaration.effectiveTo.toISOString(),
        requiresReassessment:
          new Date(proposedDeadline) >= declaration.effectiveTo ||
          new Date(proposedDeadline) < declaration.effectiveFrom,
      },
      materialImpact: {
        unresolvedExceptions: exceptions
          .filter((row) => row.category === 'MATERIAL_SHORTAGE')
          .map((row) => row.id),
        confirmation: 'REQUIRES_COORDINATOR_REVIEW',
      },
      transportImpact: {
        confirmation: 'UNKNOWN_REQUIRES_COORDINATOR_REVIEW',
        buyerDeliveryAt: batch.order.rfq.deliveryAt.toISOString(),
      },
      deltaDays: effect.deltaDays,
      requiresBuyerApproval: effect.requiresBuyerApproval,
      acceptedQuantityUnchanged: true,
      agreedCompensationUnchanged: true,
    };
  }

  async previewCounter(actor: Actor, input: C.CounterofferInput): Promise<C.CollaborationPreview> {
    return iamTransaction(this.db, actor, async (tx) => {
      const offer = await tx.commercialOffer.findUnique({
        where: { id: input.offerId },
        include: { order: { include: { rfq: true } } },
      });
      const access = await this.access(tx, actor);
      if (!offer || access.artisanProfileId !== offer.artisanProfileId)
        fail(404, 'NOT_FOUND', 'Offer not found.');
      this.expectVersion(input.expectedVersion, offer.version);
      if (offer.status !== 'OFFERED' || offer.expiresAt <= new Date())
        fail(409, 'OFFER_NOT_OPEN', 'Only a current issued offer can be countered.');
      const original = this.terms(offer, offer.order.rfq.deliveryAt);
      return {
        original,
        proposed: this.proposedTerms(original, input.proposedQuantity, input.proposedDeadline),
        impact: [
          'No agreement or additional capacity commitment is created by this proposal.',
          'Materials responsibility is carried forward for review; quantities and availability still need manager confirmation.',
          'Manager approval must issue new terms. The artisan must review and explicitly accept that offer.',
        ],
      };
    });
  }

  async previewSchedule(
    actor: Actor,
    input: C.ScheduleRevisionInput,
  ): Promise<C.CollaborationPreview> {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await tx.commercialBatch.findUnique({
        where: { id: input.batchId },
        include: { offer: true, order: { include: { rfq: true } } },
      });
      const access = await this.access(tx, actor);
      if (
        !batch ||
        !(
          access.platform ||
          access.coordinatorFor.includes(batch.artisanProfileId) ||
          access.operatorOrganizationIds.includes(batch.order.rfq.operatorOrganizationId)
        )
      )
        fail(404, 'NOT_FOUND', 'Batch not found.');
      this.expectVersion(input.expectedVersion, batch.offer.version);
      const original = this.terms(batch.offer, batch.order.rfq.deliveryAt);
      const impact = await this.scheduleImpact(tx, batch, input.proposedDeadline);
      return {
        original,
        proposed: { ...original, deadline: input.proposedDeadline },
        impact: [
          `Buyer delivery deadline: ${impact.buyerDeadline}. Proposed change: ${impact.deltaDays} days.`,
          `Capacity period: ${impact.capacityPeriod.from} to ${impact.capacityPeriod.to}. ${impact.capacityPeriod.requiresReassessment ? 'Reassessment required; final approval is blocked.' : 'Within recorded period; readiness still requires review.'}`,
          `Materials: ${impact.materialImpact.unresolvedExceptions.length} unresolved shortage report(s); coordinator confirmation required.`,
          'Transport: unknown; coordinator review required.',
          'Accepted quantity and agreed compensation remain unchanged. Both buyer and affected artisan must approve.',
        ],
      };
    });
  }

  private async access(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const permissions = new Set(
      members.flatMap((member) => C.permissionsForMembership(member) as string[]),
    );
    const organizationIds = members.map((member) => member.organizationId);
    const profile = await tx.artisanProfile.findUnique({ where: { userId: actor.id } });
    const assignments = await tx.artisanAssignment.findMany({
      where: { coordinatorId: actor.id, endedAt: null, organizationId: { in: organizationIds } },
      select: { artisanProfileId: true },
    });
    const orderIds = new Set<string>();
    if (members.some((member) => member.organization.type === 'BUYER_BUSINESS'))
      for (const row of await tx.commercialOrder.findMany({
        where: { rfq: { buyerOrganizationId: { in: organizationIds } } },
        select: { id: true },
      }))
        orderIds.add(row.id);
    if (members.some((member) => member.organization.type === 'INTERNAL'))
      for (const row of await tx.commercialOrder.findMany({
        where: { rfq: { operatorOrganizationId: { in: organizationIds } } },
        select: { id: true },
      }))
        orderIds.add(row.id);
    if (profile)
      for (const row of await tx.commercialOffer.findMany({
        where: { artisanProfileId: profile.id },
        select: { orderId: true },
      }))
        orderIds.add(row.orderId);
    if (assignments.length)
      for (const row of await tx.commercialOffer.findMany({
        where: { artisanProfileId: { in: assignments.map((a) => a.artisanProfileId) } },
        select: { orderId: true },
      }))
        orderIds.add(row.orderId);
    return {
      buyerDecisionOrganizationIds: members
        .filter(
          (m) =>
            m.organization.type === 'BUYER_BUSINESS' &&
            C.permissionsForMembership(m).includes('buyer.quotation.approve'),
        )
        .map((m) => m.organizationId),
      assignedBuyerIds: (
        await tx.operatorAssignment.findMany({
          where: { operatorId: actor.id, revokedAt: null },
          select: { organizationId: true },
        })
      ).map((a) => a.organizationId),
      platform: permissions.has('platform.roles.manage'),
      internal: members.some((member) => member.organization.type === 'INTERNAL'),
      buyer: members.some((member) => member.organization.type === 'BUYER_BUSINESS'),
      supportOperator: permissions.has('support.case.manage'),
      supportOrganizationIds: members
        .filter((member) => C.permissionsForMembership(member).includes('support.case.manage'))
        .map((member) => member.organizationId),
      organizationIds,
      operatorOrganizationIds: members
        .filter(
          (member) =>
            member.organization.type === 'INTERNAL' &&
            C.permissionsForMembership(member).includes('operator.production.manage'),
        )
        .map((member) => member.organizationId),
      artisanProfileId: profile?.id ?? null,
      coordinatorFor: assignments.map((row) => row.artisanProfileId),
      orderIds: [...orderIds],
    };
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
      { actorId: actor.id, resourceId: id, operation: `collaboration.${operation}`, key },
      json(input),
      fn,
    );
  }
}
