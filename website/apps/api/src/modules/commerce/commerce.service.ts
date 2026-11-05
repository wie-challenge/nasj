import { FinanceService } from '../finance/finance.service.js';
import { fail } from '../../common/errors.js';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, CommercialRfq, CommercialOffer, SyntheticPayment } from '@prisma/client';
import {
  permissionsForMembership,
  syntheticEvidence,
  evidenceExportFields,
  type CommerceMetrics,
  type CommerceRole,
  type CommerceWorkspaceView,
  type RfqCreate,
  type RfqEdit,
  type RfqAction,
  type OfferCreate,
  type OfferAction,
  type BatchAction,
  type ProgressInput,
  type InspectionInput,
  type OrderAction,
  type PaymentCreate,
  type PaymentAction,
  type RfqState,
  type OfferState,
  type BatchState,
  type OrderState,
  type PaymentState,
  parseTnd,
  formatTnd,
  capacityHundredths,
  requireRule,
  transitionRfq,
  transitionOffer,
  transitionBatch,
  transitionOrder,
  transitionPayment,
  validateProgress,
  reconcileInspection,
  reconcileFulfillment,
  reconcileSettlement,
  payableForUnits,
  rfqEdges,
  offerEdges,
  batchEdges,
  orderEdges,
  paymentEdges,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { audit } from '../foundation/audit.js';
import { findCatalogExample, projectBuyerCatalog } from './catalog.js';
import { projectCapacity } from '../artisans/capacity.js';
import { requireCurrentEligibility } from '../procurement/eligibility-guard.js';
import { activity, revision } from '../procurement/records.js';

type Order = Prisma.CommercialOrderGetPayload<{
  include: { rfq: true; offers: true; batches: true; payments: true };
}>;
const orderInclude = { rfq: true, offers: true, batches: true, payments: true } as const;
const operatorRoles: CommerceRole[] = [
  'PRODUCTION_MANAGER',
  'FINANCE_MANAGER',
  'QUALITY_INSPECTOR',
  'INVENTORY_LOGISTICS_COORDINATOR',
];
const saved = (row: { id: string; version: number }) => ({ id: row.id, version: row.version });
const sums = <T>(rows: T[], value: (row: T) => bigint) =>
  rows.reduce((total, row) => total + value(row), 0n);
function version(actual: number, expected: number) {
  requireRule(
    actual === expected,
    'VERSION_CONFLICT',
    'This record changed. Reload the workspace before trying again.',
  );
}
function permit(roles: CommerceRole[], allowed: readonly CommerceRole[]) {
  requireRule(
    allowed.some((role) => roles.includes(role)),
    'FORBIDDEN',
    'You do not have permission for this resource action.',
  );
}
function roleForNext<S extends string>(
  roles: CommerceRole[],
  next: S,
  edges: readonly (readonly [S, S, readonly CommerceRole[]])[],
) {
  permit(
    roles,
    edges.filter((edge) => edge[1] === next).flatMap((edge) => [...edge[2]]),
  );
}
function held(offer: CommercialOffer, now = new Date()) {
  return (
    offer.status === 'ACCEPTED' ||
    (['PLANNED', 'OFFERED'].includes(offer.status) && offer.expiresAt > now)
  );
}
function livePayment(payment: SyntheticPayment) {
  return !['FAILED', 'CANCELLED'].includes(payment.status);
}
function orderQuantities(order: Order) {
  const add = (name: 'produced' | 'submitted' | 'approved' | 'rejected' | 'pending') =>
    order.batches.reduce((n, b) => n + b[name], 0);
  return {
    requested: order.rfq.quantity,
    reserved: order.offers
      .filter((o) => o.status !== 'ACCEPTED' && held(o))
      .reduce((n, o) => n + o.quantity, 0),
    allocated: order.offers
      .filter((o) => o.status === 'ACCEPTED')
      .reduce((n, o) => n + o.quantity, 0),
    produced: add('produced'),
    submitted: add('submitted'),
    approved: add('approved'),
    rejected: add('rejected'),
    pending: add('pending'),
    delivered: order.delivered,
  };
}
@Injectable()
export class CommerceService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}
  async catalog(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) =>
      projectBuyerCatalog(
        await tx.craftSkill.findMany({
          where: { isActive: true },
          select: { id: true, name: true, description: true },
          orderBy: { name: 'asc' },
          take: 100,
        }),
      ),
    );
  }
  private async membership(actor: Actor, id: string, tx: Db) {
    return tx.organizationMember.findFirst({
      where: {
        organizationId: id,
        userId: actor.id,
        status: 'ACTIVE',
        organization: { approvalStatus: 'APPROVED' },
      },
      include: { roles: true, organization: true, permissionGrants: true },
    });
  }
  private async roles(actor: Actor, rfq: CommercialRfq, tx: Db): Promise<CommerceRole[]> {
    const buyer = await this.membership(actor, rfq.buyerOrganizationId, tx);
    const operator = await this.membership(actor, rfq.operatorOrganizationId, tx);
    return [
      ...(buyer?.organization.type === 'BUYER_BUSINESS' &&
      buyer.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role))
        ? ['BUYER' as const]
        : []),
      ...(operator?.organization.type === 'INTERNAL'
        ? operator.roles
            .map((r) => r.role)
            .filter((r): r is CommerceRole => operatorRoles.includes(r as CommerceRole))
        : []),
    ];
  }
  private async owner(actor: Actor, profileId: string, tx: Db, consent = false) {
    const profile = await tx.artisanProfile.findFirst({
      where: { id: profileId, userId: actor.id },
    });
    requireRule(profile, 'FORBIDDEN', 'Only the artisan can decide or report their own work.');
    if (consent)
      requireRule(
        await tx.consentRecord.findFirst({
          where: {
            userId: actor.id,
            purpose: 'artisan.profile',
            decision: true,
            withdrawnAt: null,
          },
        }),
        'CONSENT_REQUIRED',
        'Active artisan profile processing consent is required.',
      );
  }
  private async order(tx: Db, id: string) {
    const row = await tx.commercialOrder.findUnique({ where: { id }, include: orderInclude });
    requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
    return row;
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    key: string | undefined,
    resourceId: string,
    operation: string,
    input: Prisma.InputJsonValue,
    fn: () => Promise<T>,
  ) {
    requireRule(key, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required for this command.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId, operation: `commerce.${operation}`, key },
      input,
      fn,
    );
  }
  private async event(
    tx: Db,
    actor: Actor,
    rfq: CommercialRfq,
    action: string,
    targetType: string,
    targetId: string,
    details: Prisma.InputJsonObject = {},
  ) {
    if (targetType === 'CommercialRfq' || targetType === 'CommercialOrder') {
      const current = await tx.commercialRfq.findUniqueOrThrow({ where: { id: rfq.id } });
      if (action === 'rfq.create' || action === 'rfq.edit')
        await revision(
          tx,
          actor,
          current,
          action === 'rfq.create' ? 'Initial buyer draft.' : 'Buyer edited the draft.',
        );
      await activity(tx, actor, current, action);
    }
    await audit(tx, actor, {
      action: `commerce.${action}`,
      targetType,
      targetId,
      organizationId: rfq.buyerOrganizationId,
      after: { provenance: 'SYNTHETIC', ...details },
    });
  }
  async report(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await this.order(tx, id);
      const roles = await this.roles(actor, order.rfq, tx);
      permit(roles, ['BUYER', ...operatorRoles]);
      const projection = await tx.commerceProjection.findUnique({ where: { orderId: id } });
      const pending = await tx.outboxEvent.count({
        where: {
          organizationId: order.rfq.buyerOrganizationId,
          eventType: { startsWith: 'commerce.' },
          status: { not: 'DELIVERED' },
        },
      });
      if (!projection)
        return {
          orderId: id,
          status: 'PENDING',
          pendingEvents: pending,
          metrics: null,
          evidence: syntheticEvidence('commerce.report', 'Commercial report', '/evidence#software'),
        };
      const metrics = projection.metrics as unknown as CommerceMetrics;
      // Buyer and quality/logistics projections never include individual artisan earnings.
      const finance = roles.includes('FINANCE_MANAGER')
        ? metrics.finance
        : roles.includes('BUYER')
          ? {
              currency: 'TND',
              unit: 'MILLIME',
              buyerReceived: metrics.finance.buyerReceived,
              verifiedSettlement: null,
              coverage: { verifiedSettlement: 'UNAVAILABLE' },
            }
          : null;
      return {
        orderId: id,
        status: pending ? 'STALE' : 'CURRENT',
        pendingEvents: pending,
        asOf: projection.asOf.toISOString(),
        definitionVersion: projection.definitionVersion,
        evidence: syntheticEvidence('commerce.report', 'Commercial report', '/evidence#software'),
        metrics: { ...metrics, finance },
      };
    });
  }
  async reportCsv(actor: Actor, id: string) {
    const report = await this.report(actor, id);
    const evidence = syntheticEvidence(
      'commerce.report-export',
      'Commercial report export',
      '/evidence#software',
      ['Synthetic records are not field measurements or verified payments.'],
    );
    const metadata = evidenceExportFields(evidence);
    const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const suffix = [metadata.evidenceLabel, metadata.sourceReference, metadata.evidenceLimitations]
      .map(csvCell)
      .join(',');
    const lines = [
      'metric,numerator,denominator,unit,provenance,evidence_label,source_reference,evidence_limitations',
      `evidence_notice,0,0,NOTICE,SYNTHETIC,${suffix}`,
    ];
    if (report.metrics) {
      for (const [name, value] of Object.entries(report.metrics.fulfillment))
        lines.push(`${name},${value.numerator},${value.denominator},PIECES,SYNTHETIC,${suffix}`);
      for (const [name, value] of Object.entries(report.metrics.finance ?? {}))
        if (typeof value === 'string' && /^\d+$/.test(value))
          lines.push(`${name},${value},,MILLIME,SYNTHETIC,${suffix}`);
    }
    // Every cell comes from the fixed registry or integers, never user-entered CSV formulas.
    return `${lines.join('\r\n')}\r\n`;
  }
  async inbox(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const memberships = await tx.organizationMember.findMany({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED' },
        },
        include: { roles: true, organization: true, permissionGrants: true },
      });
      const buyers = memberships
        .filter(
          (m) =>
            m.organization.type === 'BUYER_BUSINESS' &&
            m.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role)),
        )
        .map((m) => m.organizationId);
      // Operator inbox event codes can reveal financial activity: limit them to finance/production.
      const operators = memberships
        .filter(
          (m) =>
            m.organization.type === 'INTERNAL' &&
            m.roles.some((r) => ['FINANCE_MANAGER', 'PRODUCTION_MANAGER'].includes(r.role)),
        )
        .map((m) => m.organizationId);
      return tx.commerceNotice.findMany({
        where: {
          OR: [
            { audience: 'BUYER', scopeId: { in: buyers } },
            { audience: 'OPERATOR', scopeId: { in: operators } },
            { audience: 'ARTISAN', scopeId: actor.id },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: { id: true, code: true, createdAt: true },
      });
    });
  }
  async createRfq(actor: Actor, input: RfqCreate, key?: string, managed = false) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.membership(actor, input.buyerOrganizationId, tx);
      requireRule(
        member?.organization.type === 'BUYER_BUSINESS' &&
          member.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role)) &&
          permissionsForMembership(member).includes('buyer.rfq.create'),
        'FORBIDDEN',
        'An approved buyer membership is required.',
      );
      requireRule(
        await tx.organization.findFirst({
          where: { id: input.operatorOrganizationId, type: 'INTERNAL', approvalStatus: 'APPROVED' },
        }),
        'INVALID_OPERATOR',
        'Choose an approved internal operator organization.',
      );
      requireRule(
        await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } }),
        'INVALID_CRAFT',
        'Choose an active craft.',
      );
      if (input.catalogExampleId !== undefined) {
        const example = findCatalogExample(input.catalogExampleId);
        requireRule(
          example?.availability === 'ILLUSTRATIVE' && example.craftSkillId === input.craftSkillId,
          'INVALID_CATALOG_SELECTION',
          'Choose an available example for this craft or start a request without a catalog example.',
        );
      }
      return this.command(
        tx,
        actor,
        key,
        input.buyerOrganizationId,
        'rfq.create',
        { ...input, managed },
        async () => {
          requireRule(
            new Date(input.deliveryAt) > new Date(),
            'INVALID_DEADLINE',
            'Choose a future delivery deadline.',
          );
          const { catalogExampleId: _example, ...fields } = input;
          const row = await tx.commercialRfq.create({
            data: {
              ...fields,
              deliveryAt: new Date(input.deliveryAt),
              procurementManaged: managed,
            },
          });
          await this.event(tx, actor, row, 'rfq.create', 'CommercialRfq', row.id);
          return saved(row);
        },
      );
    });
  }
  async editRfq(actor: Actor, id: string, input: RfqEdit, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialRfq.findUnique({ where: { id } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      permit(await this.roles(actor, row, tx), ['BUYER']);
      const purchaser = await this.membership(actor, row.buyerOrganizationId, tx);
      requireRule(
        purchaser && permissionsForMembership(purchaser).includes('buyer.rfq.create'),
        'FORBIDDEN',
        'Purchasing authority is required to edit an RFQ.',
      );
      return this.command(tx, actor, key, id, 'rfq.edit', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'DRAFT',
          'INVALID_TRANSITION',
          'Submitted content is immutable; only drafts can be edited.',
        );
        requireRule(
          new Date(input.deliveryAt) > new Date(),
          'INVALID_DEADLINE',
          'Choose a future delivery deadline.',
        );
        requireRule(
          await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } }),
          'INVALID_CRAFT',
          'Choose an active craft.',
        );
        const { version: _version, ...data } = input;
        const result = await tx.commercialRfq.update({
          where: { id },
          data: { ...data, deliveryAt: new Date(data.deliveryAt), version: { increment: 1 } },
        });
        await this.event(tx, actor, row, 'rfq.edit', 'CommercialRfq', id);
        return saved(result);
      });
    });
  }
  async rfqAction(actor: Actor, id: string, input: RfqAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialRfq.findUnique({ where: { id } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      const roles = await this.roles(actor, row, tx);
      if (row.procurementManaged && ['QUOTED', 'ACCEPTED'].includes(input.next))
        requireRule(
          false,
          'INVALID_TRANSITION',
          'Use the versioned procurement quotation and acceptance workflow.',
        );
      roleForNext(roles, input.next, rfqEdges);
      if (input.next === 'SUBMITTED') {
        const purchaser = await this.membership(actor, row.buyerOrganizationId, tx);
        requireRule(
          purchaser && permissionsForMembership(purchaser).includes('buyer.rfq.create'),
          'FORBIDDEN',
          'Purchasing authority is required to submit an RFQ.',
        );
      }
      if (input.next === 'ACCEPTED') {
        const member = await this.membership(actor, row.buyerOrganizationId, tx);
        requireRule(
          member &&
            (await tx.membershipPermission.findFirst({
              where: {
                membershipId: member.id,
                permission: 'buyer.quotation.approve',
                enabled: true,
              },
            })),
          'FORBIDDEN',
          'Explicit buyer quotation approval authority is required.',
        );
      }
      return this.command(tx, actor, key, id, 'rfq.action', input, async () => {
        version(row.version, input.version);
        transitionRfq(row.status as RfqState, input.next, roles, {
          quoteValid:
            row.quoteMillimes !== null &&
            Boolean(row.quoteExpiresAt && row.quoteExpiresAt > new Date()),
          quoteExpired: Boolean(row.quoteExpiresAt && row.quoteExpiresAt <= new Date()),
        });
        if (input.next === 'SUBMITTED')
          requireRule(
            row.deliveryAt > new Date(),
            'INVALID_DEADLINE',
            'Delivery deadline has passed. Edit the draft before submitting.',
          );
        const quote =
          input.next === 'QUOTED'
            ? {
                quoteMillimes: parseTnd(input.quoteTnd),
                quoteExpiresAt: new Date(input.quoteExpiresAt),
              }
            : {};
        if (input.next === 'QUOTED')
          requireRule(
            quote.quoteMillimes! > 0n &&
              quote.quoteExpiresAt! > new Date() &&
              quote.quoteExpiresAt! < row.deliveryAt,
            'INVALID_QUOTE',
            'Use a positive price and future expiry before delivery.',
          );
        const result = await tx.commercialRfq.update({
          where: { id },
          data: { status: input.next, version: { increment: 1 }, ...quote },
        });
        if (input.next === 'ACCEPTED') await tx.commercialOrder.create({ data: { rfqId: id } });
        await this.event(tx, actor, row, `rfq.${input.next.toLowerCase()}`, 'CommercialRfq', id);
        return saved(result);
      });
    });
  }
  async createOffer(actor: Actor, input: OfferCreate, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await this.order(tx, input.orderId);
      permit(await this.roles(actor, order.rfq, tx), ['PRODUCTION_MANAGER']);
      const capacity = await tx.capacityDeclaration.findUnique({
        where: { id: input.capacityDeclarationId },
        include: { artisanProfile: { include: { user: true } } },
      });
      requireRule(
        capacity &&
          !capacity.supersededAt &&
          capacity.unitType === 'PIECES' &&
          capacity.craftSkillId === order.rfq.craftSkillId &&
          capacity.effectiveFrom <= order.rfq.deliveryAt &&
          capacity.effectiveTo > order.rfq.deliveryAt &&
          capacity.artisanProfile.availabilityStatus === 'AVAILABLE' &&
          capacity.artisanProfile.user?.status === 'ACTIVE' &&
          capacity.artisanProfile.user.emailVerified,
        'CAPACITY_UNAVAILABLE',
        'Choose a piece-capacity declaration covering this craft and delivery date.',
      );
      requireRule(
        await tx.consentRecord.findFirst({
          where: {
            userId: capacity.artisanProfile.userId ?? 'unlinked-participant-no-legacy-consent',
            purpose: 'artisan.profile',
            decision: true,
            withdrawnAt: null,
          },
        }),
        'CONSENT_REQUIRED',
        'Active artisan processing consent is required.',
      );
      requireRule(
        await tx.artisanSkill.findFirst({
          where: {
            artisanProfileId: capacity.artisanProfileId,
            craftSkillId: order.rfq.craftSkillId,
            craftSkill: { isActive: true },
          },
        }),
        'INVALID_CRAFT',
        'The artisan must have this active craft skill.',
      );
      requireRule(
        !order.rfq.procurementManaged,
        'ELIGIBILITY_REQUIRED',
        'Procurement orders require an eligibility assessment before an offer.',
      );
      return this.command(tx, actor, key, order.id, 'offer.create', input, async () => {
        requireRule(
          order.status === 'PLANNING',
          'INVALID_TRANSITION',
          'Plan offers only for a funded order in planning.',
        );
        const expiresAt = new Date(input.expiresAt);
        requireRule(
          expiresAt > new Date() && expiresAt < order.rfq.deliveryAt,
          'INVALID_EXPIRY',
          'Offer expiry must be in the future before delivery.',
        );
        const pay = parseTnd(input.unitPayTnd);
        requireRule(pay > 0n, 'INVALID_AMOUNT', 'Unit pay must be positive.');
        payableForUnits(pay, input.quantity);
        const available = await projectCapacity(tx, capacity);
        requireRule(
          available.availabilityKnown &&
            available.constraints.length === 0 &&
            capacityHundredths(available.remaining) >= BigInt(input.quantity) * 100n,
          'CAPACITY_EXCEEDED',
          'This offer exceeds known remaining capacity for this production period.',
        );
        const quantities = orderQuantities(order);
        reconcileFulfillment({ ...quantities, reserved: quantities.reserved + input.quantity });
        transitionOffer('PLANNED', 'OFFERED', ['PRODUCTION_MANAGER'], {
          now: Date.now(),
          expiresAt: expiresAt.getTime(),
        });
        const row = await tx.commercialOffer.create({
          data: {
            orderId: order.id,
            capacityDeclarationId: capacity.id,
            artisanProfileId: capacity.artisanProfileId,
            quantity: input.quantity,
            unitPayMillimes: pay,
            estimatedHours: input.estimatedHours,
            expiresAt,
            materials: input.materials,
            reworkTerms: input.reworkTerms,
            paymentConditions: input.paymentConditions,
            status: 'OFFERED',
          },
        });
        await this.event(tx, actor, order.rfq, 'offer.create', 'CommercialOffer', row.id);
        return saved(row);
      });
    });
  }
  async offerAction(actor: Actor, id: string, input: OfferAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialOffer.findUnique({ where: { id } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      const order = await this.order(tx, row.orderId);
      const roles = await this.roles(actor, order.rfq, tx);
      if (['ACCEPTED', 'DECLINED'].includes(input.next)) {
        await this.owner(actor, row.artisanProfileId, tx, input.next === 'ACCEPTED');
        roles.push('ARTISAN');
      }
      roleForNext(roles, input.next, offerEdges);
      return this.command(tx, actor, key, id, 'offer.action', input, async () => {
        version(row.version, input.version);
        if (row.termsSha256 && ['ACCEPTED', 'DECLINED'].includes(input.next))
          requireRule(
            input.termsSha256 === row.termsSha256,
            'STALE_TERMS',
            'Accept or decline the exact offer version shown to you.',
          );
        transitionOffer(row.status as OfferState, input.next, roles, {
          expiresAt: row.expiresAt.getTime(),
          now: Date.now(),
        });
        requireRule(
          order.rfq.procurementManaged
            ? ['APPROVED', 'PLANNING'].includes(order.status)
            : order.status === 'PLANNING',
          'INVALID_TRANSITION',
          'Offer decisions require an open production order.',
        );
        if (input.next === 'ACCEPTED') {
          const profile = await tx.artisanProfile.findFirst({
            where: {
              id: row.artisanProfileId,
              userId: actor.id,
              participantStatus: 'ACTIVE',
              availabilityStatus: 'AVAILABLE',
            },
          });
          requireRule(
            profile,
            'PARTICIPATION_INACTIVE',
            'Active, available participation is required to accept this offer.',
          );
          // No reviewed commercial translations exist. This records personal source-language
          // review, never qualified translation approval or consent on another artisan's behalf.
          requireRule(
            (!input.reviewLanguage || input.reviewLanguage === 'en') &&
              (profile.preferredLanguage === 'en' ||
                (input.reviewLanguage === 'en' &&
                  input.sourceTermsLanguage === 'en' &&
                  input.acknowledgeOriginalTerms === true)),
            'SOURCE_TERMS_REVIEW_REQUIRED',
            'Reviewed translations are unavailable. Review and explicitly acknowledge the original English terms, or request clarification.',
          );
        }
        if (input.next === 'ACCEPTED') {
          const capacity = await tx.capacityDeclaration.findUniqueOrThrow({
            where: { id: row.capacityDeclarationId },
          });
          const available = await projectCapacity(tx, capacity);
          requireRule(
            available.availabilityKnown &&
              available.constraints.length === 0 &&
              available.reservationShortfall === '0.00',
            'CAPACITY_UNAVAILABLE',
            'Capacity changed; request a revised offer.',
          );
          // Acceptance is the commitment boundary. The check above reads the declaration this offer
          // was prepared from; the guard re-reads authoritative current state - consent, delegation,
          // availability, participation and equipment period - so a snapshot taken at ranking or
          // preparation cannot create an obligation that is no longer supportable.
          await requireCurrentEligibility(tx, {
            artisanProfileId: row.artisanProfileId,
            userId:
              (
                await tx.artisanProfile.findUnique({
                  where: { id: row.artisanProfileId },
                  select: { userId: true },
                })
              )?.userId ?? null,
            orderId: order.id,
            craftSkillId: order.rfq.craftSkillId,
            capacityDeclarationId: row.capacityDeclarationId,
            acceptingOfferId: row.id,
            quantity: row.quantity,
            periodFrom: capacity.effectiveFrom ?? null,
            periodTo: capacity.effectiveTo ?? null,
          });
          await tx.commercialBatch.create({
            data: { orderId: order.id, offerId: id, artisanProfileId: row.artisanProfileId },
          });
        }
        const result = await tx.commercialOffer.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'ACCEPTED'
              ? { acceptedAt: new Date(), decidedByUserId: actor.id }
              : { decidedByUserId: actor.id }),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `offer.${input.next.toLowerCase()}`,
          'CommercialOffer',
          id,
          input.next === 'ACCEPTED'
            ? {
                offerVersion: row.version,
                termsSha256: row.termsSha256,
                reviewLanguage: input.reviewLanguage ?? 'en',
                sourceTermsLanguage: 'en',
                acknowledgeOriginalTerms: input.acknowledgeOriginalTerms ?? false,
                reviewedTranslationAvailable: false,
              }
            : {},
        );
        return saved(result);
      });
    });
  }
  async batchAction(actor: Actor, id: string, input: BatchAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialBatch.findUnique({ where: { id }, include: { offer: true } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      const order = await this.order(tx, row.orderId);
      const roles = await this.roles(actor, order.rfq, tx);
      if (
        ['IN_PROGRESS', 'SUBMITTED', 'DISPUTED'].includes(input.next) &&
        (await tx.artisanProfile.findFirst({
          where: { id: row.artisanProfileId, userId: actor.id },
        }))
      )
        roles.push('ARTISAN');
      roleForNext(roles, input.next, batchEdges);
      return this.command(tx, actor, key, id, 'batch.action', input, async () => {
        version(row.version, input.version);
        requireRule(
          ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Release and production actions require an order in production/quality review.',
        );
        transitionBatch(row.status as BatchState, input.next, roles, {
          assigned: row.offer.quantity,
          produced: row.produced,
          approved: row.approved,
          pending: row.pending,
          reworkAccepted: input.reworkAccepted,
        });
        if (input.next === 'APPROVED')
          requireRule(row.rejected === 0, 'QUALITY_REQUIRED', 'Resolve rejected units first.');
        const result = await tx.commercialBatch.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'SUBMITTED'
              ? { submitted: row.produced, pending: row.produced - row.approved - row.rejected }
              : {}),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `batch.${input.next.toLowerCase()}`,
          'CommercialBatch',
          id,
        );
        return saved(result);
      });
    });
  }
  async progress(actor: Actor, id: string, input: ProgressInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialBatch.findUnique({ where: { id }, include: { offer: true } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      await this.owner(actor, row.artisanProfileId, tx);
      const order = await this.order(tx, row.orderId);
      return this.command(tx, actor, key, id, 'batch.progress', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'IN_PROGRESS' &&
            ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Only active production accepts cumulative progress.',
        );
        validateProgress(row.offer.quantity, row.produced, input.produced);
        const result = await tx.commercialBatch.update({
          where: { id },
          data: { produced: input.produced, version: { increment: 1 } },
        });
        await this.event(tx, actor, order.rfq, 'batch.progress', 'CommercialBatch', id);
        return saved(result);
      });
    });
  }
  async inspect(actor: Actor, id: string, input: InspectionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.commercialBatch.findUnique({ where: { id } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      const order = await this.order(tx, row.orderId);
      permit(await this.roles(actor, order.rfq, tx), ['QUALITY_INSPECTOR']);
      return this.command(tx, actor, key, id, 'batch.inspect', input, async () => {
        version(row.version, input.version);
        requireRule(
          row.status === 'INSPECTION' && ['IN_PRODUCTION', 'QUALITY_REVIEW'].includes(order.status),
          'INVALID_TRANSITION',
          'Start inspection before recording quality outcomes.',
        );
        reconcileInspection(
          row.submitted,
          input.approved,
          input.rejected,
          input.pending,
          row.approved,
        );
        await tx.commercialInspection.create({
          data: {
            batchId: id,
            batchVersion: row.version,
            inspectorId: actor.id,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            submitted: row.submitted,
            defectReason: input.defectReason,
          },
        });
        const result = await tx.commercialBatch.update({
          where: { id },
          data: {
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            version: { increment: 1 },
          },
        });
        await this.event(tx, actor, order.rfq, 'batch.inspect', 'CommercialBatch', id);
        return saved(result);
      });
    });
  }
  async orderAction(actor: Actor, id: string, input: OrderAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await this.order(tx, id);
      const roles = await this.roles(actor, row.rfq, tx);
      roleForNext(roles, input.next, orderEdges);
      return this.command(tx, actor, key, id, 'order.action', input, async () => {
        version(row.version, input.version);
        // Managed procurement uses buyer confirmations and the reviewed finance ledger.
        // The legacy synthetic state machine must not overwrite accepted quantities or close it.
        requireRule(
          !row.rfq.procurementManaged ||
            !['DELIVERED', 'BUYER_ACCEPTED', 'SETTLED', 'CLOSED'].includes(input.next),
          'MANAGED_FINANCIAL_WORKFLOW_REQUIRED',
          'Managed procurement requires buyer delivery confirmation and financial closure assessment.',
        );
        if (input.next === 'CLOSED') {
          const readiness = await this.finance.assess(
            tx,
            id,
            Boolean(input.materialsResolved && input.dispositionNote),
          );
          if (readiness.blockers.length)
            fail(
              409,
              'FINANCIAL_CLOSURE_REQUIRED',
              `Financial closure denied: ${readiness.blockers.join(', ')}`,
            );
        }
        const q = orderQuantities(row);
        const buyerSettled = sums(
          row.payments.filter((p) => p.kind === 'BUYER_RECEIPT' && p.status === 'SETTLED'),
          (p) => p.amountMillimes,
        );
        const artisanSettled = sums(
          row.payments.filter((p) => p.kind === 'ARTISAN_PAYOUT' && p.status === 'SETTLED'),
          (p) => p.amountMillimes,
        );
        const artisanDue = sums(row.batches, (b) =>
          payableForUnits(row.offers.find((o) => o.id === b.offerId)!.unitPayMillimes, b.approved),
        );
        if (input.next === 'IN_PRODUCTION' && row.rfq.procurementManaged) {
          const sample = await tx.procurementSample.findFirst({
            where: { rfqId: row.rfqId },
            orderBy: { version: 'desc' },
            include: { decision: true },
          });
          const current = await tx.procurementRevision.findFirst({
            where: { rfqId: row.rfqId },
            orderBy: { version: 'desc' },
          });
          requireRule(
            sample?.decision?.decision === 'APPROVED' && sample.revisionId === current?.id,
            'SAMPLE_APPROVAL_REQUIRED',
            'The latest sample and specification require buyer approval before production.',
          );
        }
        transitionOrder(row.status as OrderState, input.next, roles, {
          ...q,
          buyerDue: row.rfq.quoteMillimes!,
          buyerSettled,
          artisanDue,
          artisanSettled,
          materialsResolved:
            row.materialsResolved || Boolean(input.materialsResolved && input.dispositionNote),
          pendingPayments: row.payments.filter(
            (p) => !['SETTLED', 'FAILED', 'CANCELLED'].includes(p.status),
          ).length,
          openDisputes:
            row.payments.filter((p) => p.status === 'DISPUTED').length +
            row.batches.filter((b) => b.status === 'DISPUTED').length,
        });
        const result = await tx.commercialOrder.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'DELIVERED' ? { delivered: q.approved } : {}),
            ...(input.next === 'CLOSED'
              ? { materialsResolved: true, dispositionNote: input.dispositionNote }
              : {}),
          },
        });
        await this.event(
          tx,
          actor,
          row.rfq,
          `order.${input.next.toLowerCase()}`,
          'CommercialOrder',
          id,
        );
        return saved(result);
      });
    });
  }
  async createPayment(actor: Actor, input: PaymentCreate, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await this.order(tx, input.orderId);
      permit(await this.roles(actor, order.rfq, tx), ['FINANCE_MANAGER']);
      return this.command(tx, actor, key, order.id, 'payment.create', input, async () => {
        requireRule(
          !['CLOSED', 'CANCELLED', 'SETTLED', 'DISPUTED'].includes(order.status),
          'INVALID_TRANSITION',
          'This order cannot receive new simulated payments.',
        );
        const amount = parseTnd(input.amountTnd);
        requireRule(amount > 0n, 'INVALID_AMOUNT', 'Payment amount must be positive.');
        let eligible = order.rfq.quoteMillimes!;
        if (input.kind === 'ARTISAN_PAYOUT') {
          const batch = order.batches.find((b) => b.id === input.batchId);
          requireRule(batch, 'NOT_FOUND', 'Batch is not part of this order.');
          eligible = payableForUnits(
            order.offers.find((o) => o.id === batch.offerId)!.unitPayMillimes,
            batch.approved,
          );
        }
        const payments = order.payments.filter(
          (p) =>
            p.kind === input.kind &&
            (input.kind === 'BUYER_RECEIPT' || p.batchId === input.batchId) &&
            livePayment(p),
        );
        reconcileSettlement(
          eligible,
          sums(
            payments.filter((p) => p.status === 'SETTLED'),
            (p) => p.amountMillimes,
          ),
          sums(
            payments.filter((p) => p.status !== 'SETTLED'),
            (p) => p.amountMillimes,
          ),
          amount,
        );
        const row = await tx.syntheticPayment.create({
          data: {
            orderId: order.id,
            batchId: input.batchId,
            kind: input.kind,
            amountMillimes: amount,
          },
        });
        await this.event(tx, actor, order.rfq, 'payment.create', 'SyntheticPayment', row.id);
        return saved(row);
      });
    });
  }
  async paymentAction(actor: Actor, id: string, input: PaymentAction, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.syntheticPayment.findUnique({ where: { id } });
      requireRule(row, 'NOT_FOUND', 'Commercial record not found.');
      const order = await this.order(tx, row.orderId);
      const roles = await this.roles(actor, order.rfq, tx);
      roleForNext(roles, input.next, paymentEdges);
      return this.command(tx, actor, key, id, 'payment.action', input, async () => {
        version(row.version, input.version);
        requireRule(
          !['CLOSED', 'CANCELLED', 'SETTLED', 'DISPUTED'].includes(order.status),
          'INVALID_TRANSITION',
          'Payments on this order are frozen.',
        );
        transitionPayment(row.status as PaymentState, input.next, roles, {
          provenance: row.provenance as 'SYNTHETIC',
          evidenceType: input.evidenceType,
        });
        const result = await tx.syntheticPayment.update({
          where: { id },
          data: {
            status: input.next,
            version: { increment: 1 },
            ...(input.next === 'SETTLED' ? { evidenceType: 'SIMULATED_SETTLEMENT' } : {}),
          },
        });
        await this.event(
          tx,
          actor,
          order.rfq,
          `payment.${input.next.toLowerCase()}`,
          'SyntheticPayment',
          id,
        );
        return saved(result);
      });
    });
  }
  async workspace(actor: Actor): Promise<CommerceWorkspaceView> {
    // A single transaction and the shared IAM locks keep these cross-table projections consistent.
    return iamTransaction(this.db, actor, async (tx) => {
      const memberships = await tx.organizationMember.findMany({
        where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
        include: { organization: true, roles: true, permissionGrants: true },
      });
      const buyerOrganizations = memberships
        .filter(
          (m) =>
            m.organization.type === 'BUYER_BUSINESS' &&
            m.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role)),
        )
        .map((m) => ({
          id: m.organizationId,
          name: m.organization.name,
          permissions: permissionsForMembership(m),
        }));
      const operatorOrganizations = memberships
        .filter(
          (m) =>
            m.organization.type === 'INTERNAL' &&
            m.roles.some((r) => operatorRoles.includes(r.role as CommerceRole)),
        )
        .map((m) => ({
          id: m.organizationId,
          name: m.organization.name,
          roles: m.roles.map((r) => r.role),
        }));
      const buyers = buyerOrganizations.map((o) => o.id),
        operators = operatorOrganizations.map((o) => o.id);
      const finance = operatorOrganizations
        .filter((o) => o.roles.includes('FINANCE_MANAGER'))
        .map((o) => o.id);
      const production = operatorOrganizations
        .filter((o) => o.roles.includes('PRODUCTION_MANAGER'))
        .map((o) => o.id);
      const own = await tx.artisanProfile.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      const rfqs = await tx.commercialRfq.findMany({
        where: {
          OR: [
            { buyerOrganizationId: { in: buyers } },
            { operatorOrganizationId: { in: operators }, status: { not: 'DRAFT' } },
          ],
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const orders = await tx.commercialOrder.findMany({
        where: {
          rfq: {
            OR: [
              { buyerOrganizationId: { in: buyers } },
              { operatorOrganizationId: { in: operators } },
            ],
          },
        },
        include: orderInclude,
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const privateWhere = {
        OR: [
          { artisanProfileId: own?.id ?? '__none__' },
          { order: { rfq: { operatorOrganizationId: { in: operators } } } },
        ],
      };
      const offers = await tx.commercialOffer.findMany({
        where: privateWhere,
        include: {
          order: { include: { rfq: true, productSpecificationRevision: true } },
          artisanProfile: { select: { preferredLanguage: true } },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const batches = await tx.commercialBatch.findMany({
        where: privateWhere,
        include: { offer: true },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const payments = await tx.syntheticPayment.findMany({
        where: {
          OR: [
            { order: { rfq: { operatorOrganizationId: { in: finance } } } },
            { kind: 'BUYER_RECEIPT', order: { rfq: { buyerOrganizationId: { in: buyers } } } },
            { kind: 'ARTISAN_PAYOUT', batch: { artisanProfileId: own?.id ?? '__none__' } },
          ],
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      const candidates = production.length
        ? await tx.capacityDeclaration.findMany({
            where: {
              unitType: 'PIECES',
              supersededAt: null,
              effectiveTo: { gt: new Date() },
              artisanProfile: {
                user: {
                  status: 'ACTIVE',
                  emailVerified: true,
                  consents: {
                    some: { purpose: 'artisan.profile', decision: true, withdrawnAt: null },
                  },
                },
              },
            },
            include: { artisanProfile: { select: { id: true, displayName: true } } },
            take: 100,
          })
        : [];
      return {
        buyerOrganizations,
        operatorOrganizations,
        artisanProfileId: own?.id ?? null,
        operatorCatalog: await tx.organization.findMany({
          where: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
          select: { id: true, name: true },
          take: 100,
        }),
        crafts: await tx.craftSkill.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          take: 100,
        }),
        candidates: await Promise.all(
          candidates.map(async (c) => {
            const summary = await projectCapacity(tx, c);
            return {
              capacityDeclarationId: c.id,
              artisanProfileId: c.artisanProfileId,
              displayName: c.artisanProfile.displayName,
              craftSkillId: c.craftSkillId,
              quantity: summary.declared,
              remaining: summary.remaining,
              availabilityKnown: summary.availabilityKnown,
              effectiveFrom: c.effectiveFrom.toISOString(),
              effectiveTo: c.effectiveTo.toISOString(),
            };
          }),
        ),
        rfqs: rfqs.map((r) => ({
          id: r.id,
          buyerOrganizationId: r.buyerOrganizationId,
          operatorOrganizationId: r.operatorOrganizationId,
          title: r.title,
          specification: r.specification,
          designRequirements: r.designRequirements,
          craftSkillId: r.craftSkillId,
          quantity: r.quantity,
          deliveryAt: r.deliveryAt.toISOString(),
          deliveryLocation: r.deliveryLocation,
          status: r.status as RfqState,
          version: r.version,
          quoteTnd:
            buyers.includes(r.buyerOrganizationId) || finance.includes(r.operatorOrganizationId)
              ? r.quoteMillimes === null
                ? null
                : formatTnd(r.quoteMillimes)
              : null,
          quoteExpiresAt: r.quoteExpiresAt?.toISOString() ?? null,
          provenance: 'SYNTHETIC',
        })),
        orders: orders.map((o) => ({
          id: o.id,
          rfqId: o.rfqId,
          title: o.rfq.title,
          status: o.status as OrderState,
          version: o.version,
          quantity: o.rfq.quantity,
          allocated: orderQuantities(o).allocated,
          produced: orderQuantities(o).produced,
          approved: orderQuantities(o).approved,
          delivered: o.delivered,
          quoteTnd:
            buyers.includes(o.rfq.buyerOrganizationId) ||
            finance.includes(o.rfq.operatorOrganizationId)
              ? formatTnd(o.rfq.quoteMillimes!)
              : null,
          provenance: 'SYNTHETIC',
          buyerOrganizationId: o.rfq.buyerOrganizationId,
          operatorOrganizationId: o.rfq.operatorOrganizationId,
        })),
        offers: offers.map((o) => {
          const pay =
            o.artisanProfileId === own?.id ||
            finance.includes(o.order.rfq.operatorOrganizationId) ||
            production.includes(o.order.rfq.operatorOrganizationId);
          return {
            id: o.id,
            orderId: o.orderId,
            artisanProfileId: o.artisanProfileId,
            quantity: o.quantity,
            unitPayTnd: pay ? formatTnd(o.unitPayMillimes) : null,
            totalPayTnd: pay ? formatTnd(payableForUnits(o.unitPayMillimes, o.quantity)) : null,
            estimatedHours: o.estimatedHours,
            expiresAt: o.expiresAt.toISOString(),
            materials: o.materials,
            reworkTerms: o.reworkTerms,
            paymentConditions: o.paymentConditions,
            specification: o.order.productSpecificationRevision
              ? `${o.order.productSpecificationRevision.description} [Approved specification ${o.order.productSpecificationRevision.id}, revision ${o.order.productSpecificationRevision.revisionNumber}]`
              : o.order.rfq.specification,
            deliveryAt: (o.deliveryDeadline ?? o.order.rfq.deliveryAt).toISOString(),
            status: o.status as OfferState,
            version: o.version,
            provenance: 'SYNTHETIC',
            termsSha256: o.termsSha256,
            compensationMethod: o.compensationMethod,
            collectionArrangement: o.collectionArrangement,
            instructions: o.instructions,
            preferredLanguage: o.artisanProfile.preferredLanguage,
          };
        }),
        batches: batches.map((b) => ({
          id: b.id,
          orderId: b.orderId,
          offerId: b.offerId,
          artisanProfileId: b.artisanProfileId,
          status: b.status as BatchState,
          version: b.version,
          quantity: b.offer.quantity,
          produced: b.produced,
          submitted: b.submitted,
          approved: b.approved,
          rejected: b.rejected,
          pending: b.pending,
          provenance: 'SYNTHETIC',
        })),
        payments: payments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          batchId: p.batchId,
          kind: p.kind as 'BUYER_RECEIPT' | 'ARTISAN_PAYOUT',
          amountTnd: formatTnd(p.amountMillimes),
          status: p.status as PaymentState,
          version: p.version,
          evidenceType: p.evidenceType as 'SIMULATED_SETTLEMENT' | null,
          provenance: 'SYNTHETIC',
        })),
      };
    });
  }
}
