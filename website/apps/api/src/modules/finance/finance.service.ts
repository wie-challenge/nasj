import { quoteReviewSnapshot, latestFinanceReview, evidenceHash } from './review-policy.js';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import { z } from 'zod';
import {
  accountingExport,
  cashGap,
  paymentTimeliness,
  signedTnd,
  type AccountingRow,
  type CashEvent,
} from './analysis.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const depositView = (row: {
  expectedMillimes: bigint;
  amountMillimes: bigint;
  [key: string]: unknown;
}) => {
  const { expectedMillimes, ...rest } = row;
  return { ...view(rest), expectedTnd: C.formatTnd(expectedMillimes) };
};
const payableView = <T extends { amountMillimes: bigint; unitPayMillimes: bigint }>(row: T) => {
  const { unitPayMillimes, ...rest } = row;
  return { ...view(rest), unitPayTnd: C.formatTnd(unitPayMillimes) };
};
const view = <T extends { amountMillimes: bigint }>(row: T) => {
  const { amountMillimes, ...rest } = row;
  return { ...rest, amountTnd: C.formatTnd(amountMillimes), currency: 'TND' as const };
};
@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async access(tx: Db, actor: Actor, orderId: string, permission?: C.Permission) {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      include: { rfq: true, acceptance: { include: { quote: true } } },
    });
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organizationId: { in: [order.rfq.operatorOrganizationId, order.rfq.buyerOrganizationId] },
        organization: { approvalStatus: 'APPROVED' },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    const internal = members.find(
      (m) =>
        m.organizationId === order.rfq.operatorOrganizationId && m.organization.type === 'INTERNAL',
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
    const buyer = members.some(
      (m) =>
        m.organizationId === order.rfq.buyerOrganizationId &&
        m.organization.type === 'BUYER_BUSINESS',
    );
    const finance = Boolean(
      assigned &&
        (permissions.includes('finance.payout.read') ||
          permissions.includes('operator.accounts.read')),
    );
    if (permission ? !assigned || !permissions.includes(permission) : !finance && !buyer)
      fail(404, 'NOT_FOUND', 'Order not found or required scoped permission unavailable.');
    if (permission && permission !== 'finance.closure.assess' && order.status === 'CLOSED')
      fail(
        409,
        'ORDER_FINANCIALLY_CLOSED',
        'A closed order cannot acquire new financial obligations without a reviewed reopening policy.',
      );
    return { order, permissions: assigned ? permissions : [], finance, buyer };
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
      { actorId: actor.id, resourceId: id, operation: `finance.${operation}`, key },
      json(input),
      fn,
    );
  }
  private async event(
    tx: Db,
    actor: Actor,
    type: string,
    id: string,
    status: string,
    reason: string,
  ) {
    await tx.financeRecordEvent.create({
      data: { targetId: id, targetType: type, actorId: actor.id, status, reason },
    });
    await audit(tx, actor, {
      action: `finance.${type}.${status.toLowerCase()}`,
      targetType: type,
      targetId: id,
      reason,
      after: { status, bankVerified: false },
    });
  }
  async workspace(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId);
      const deposits = await tx.buyerDepositRecord.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      if (!a.finance)
        return {
          orderId,
          organizationId: a.order.rfq.buyerOrganizationId,
          permissions: a.permissions,
          expectedTnd: C.formatTnd(a.order.acceptance?.quote.totalMillimes ?? 0n),
          deposits: deposits.map(depositView),
          payables: [],
          payouts: [],
          disputes: [],
          adjustments: [],
          closure: { status: 'BLOCKED', blockers: ['BANK_EVIDENCE_UNAVAILABLE'] },
        };
      const [payables, payouts, disputes, adjustments, events] = await Promise.all([
        tx.artisanPayable.findMany({ where: { orderId } }),
        tx.payoutRequest.findMany({ where: { orderId } }),
        tx.paymentDispute.findMany({ where: { orderId } }),
        tx.financialAdjustment.findMany({ where: { orderId } }),
        tx.financeRecordEvent.findMany({
          where: { targetId: { in: [orderId, ...deposits.map((d) => d.id)] } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
      ]);
      const executions = await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      });
      return {
        orderId,
        orderVersion: a.order.version,
        organizationId: a.order.rfq.operatorOrganizationId,
        permissions: a.permissions,
        delivered: a.order.delivered,
        expectedTnd: C.formatTnd(a.order.acceptance?.quote.totalMillimes ?? 0n),
        deposits: deposits.map(depositView),
        payables: payables.map(payableView),
        payouts: payouts.map((p) => ({
          ...view(p),
          payableSnapshotMillimes: undefined,
          payableSnapshotTnd: C.formatTnd(p.payableSnapshotMillimes),
          executions: executions.filter((e) => e.payoutId === p.id).map(view),
        })),
        disputes: disputes.map(view),
        adjustments: adjustments.map(view),
        events: [
          ...events,
          ...(await tx.financeRecordEvent.findMany({
            where: {
              targetId: {
                in: [
                  ...payouts.map((p) => p.id),
                  ...executions.map((e) => e.id),
                  ...disputes.map((d) => d.id),
                  ...adjustments.map((a) => a.id),
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          })),
        ],
        closure: {
          ...(await this.assess(tx, orderId)),
          history: await this.assessmentHistory(tx, orderId),
        },
      };
    });
  }
  async deposit(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.depositRecordSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId, 'finance.deposit.record');
      return this.command(tx, actor, orderId, 'deposit.record', key, input, async () => {
        if (new Date(input.paymentDate) > new Date())
          fail(400, 'INVALID_DATE', 'Payment date cannot be in the future.');
        const reference = input.paymentReference.trim().toUpperCase();
        if (
          await tx.buyerDepositRecord.findUnique({
            where: {
              buyerOrganizationId_paymentReference: {
                buyerOrganizationId: a.order.rfq.buyerOrganizationId,
                paymentReference: reference,
              },
            },
          })
        )
          fail(
            409,
            'DUPLICATE_PAYMENT_REFERENCE',
            'This buyer payment reference has already been reported.',
          );
        const row = await tx.buyerDepositRecord.create({
          data: {
            orderId,
            buyerOrganizationId: a.order.rfq.buyerOrganizationId,
            expectedMillimes: a.order.acceptance?.quote.totalMillimes ?? 0n,
            amountMillimes: C.parseTnd(input.amountTnd),
            paymentReference: reference,
            paymentDate: new Date(input.paymentDate),
            evidence: input.evidence,
            provenance: input.provenance,
            actorId: actor.id,
          },
        });
        await this.event(
          tx,
          actor,
          'BuyerDepositRecord',
          row.id,
          row.status,
          'Operator evidence is pending independent verification.',
        );
        const aggregate = await tx.buyerDepositRecord.aggregate({
          where: { orderId, status: { not: 'REJECTED' } },
          _sum: { amountMillimes: true },
        });
        return json({
          ...view(row),
          expectedMillimes: undefined,
          expectedTnd: C.formatTnd(row.expectedMillimes),
          coverage:
            (aggregate._sum.amountMillimes ?? 0n) < row.expectedMillimes
              ? 'PARTIAL'
              : (aggregate._sum.amountMillimes ?? 0n) > row.expectedMillimes
                ? 'OVERPAYMENT_REVIEW'
                : 'CLAIMED_FULL',
          bankVerified: false,
        });
      });
    });
  }
  async reviewDeposit(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.depositReviewSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.buyerDepositRecord.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Deposit not found.');
      await this.access(tx, actor, row.orderId, 'finance.deposit.review');
      return this.command(tx, actor, id, 'deposit.review', key, input, async () => {
        C.assertIndependentApproval(row.actorId, actor.id);
        const saved = await tx.buyerDepositRecord.update({
          where: { id },
          data: { status: input.decision, reviewerId: actor.id, reason: input.reason },
        });
        await this.event(tx, actor, 'BuyerDepositRecord', id, saved.status, input.reason);
        return json(depositView(saved));
      });
    });
  }
  private async noDisputes(tx: Db, payable: { id: string; batchId: string | null }) {
    if (!payable.batchId)
      fail(
        409,
        'SAMPLE_PAYOUT_REQUIRES_REVIEW',
        'Sample obligations require a separately authorized finance review.',
      );
    if (
      await tx.paymentDispute.count({
        where: { batchId: payable.batchId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      })
    )
      fail(
        409,
        'OPEN_PAYMENT_DISPUTE',
        'Payout is blocked until the artisan claim receives an audited resolution.',
      );
  }
  async requestPayout(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.payoutRequestSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.payout.request');
      return this.command(tx, actor, orderId, 'payout.request', key, input, async () => {
        const payable = await tx.artisanPayable.findUnique({ where: { id: input.payableId } });
        if (!payable || payable.orderId !== orderId) fail(404, 'NOT_FOUND', 'Payable not found.');
        await this.noDisputes(tx, payable);
        if (payable.status !== 'RECOGNIZED')
          fail(409, 'PAYABLE_INELIGIBLE', 'Payable is not eligible.');
        const held = await tx.payoutRequest.aggregate({
          where: { payableId: payable.id, status: { not: 'FAILED' } },
          _sum: { amountMillimes: true },
        });
        const amount = C.parseTnd(input.amountTnd);
        C.assertPayoutCapacity(payable.amountMillimes, held._sum.amountMillimes ?? 0n, amount);
        const row = await tx.payoutRequest.create({
          data: {
            orderId,
            payableId: payable.id,
            amountMillimes: amount,
            payableSnapshotMillimes: payable.amountMillimes,
            requesterId: actor.id,
            reason: input.reason,
          },
        });
        await this.event(tx, actor, 'PayoutRequest', row.id, row.status, input.reason);
        return json(view(row));
      });
    });
  }
  async approvePayout(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.payoutRequest.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Payout not found.');
      await this.access(tx, actor, row.orderId, 'finance.payout.approve');
      return this.command(tx, actor, id, 'payout.approve', key, input, async () => {
        C.assertIndependentApproval(row.requesterId, actor.id);
        if (row.status !== 'REQUESTED')
          fail(409, 'INVALID_TRANSITION', 'Only a requested payout can be approved.');
        const payable = await tx.artisanPayable.findUniqueOrThrow({ where: { id: row.payableId } });
        await this.noDisputes(tx, payable);
        if (
          payable.amountMillimes !== row.payableSnapshotMillimes ||
          payable.status !== 'RECOGNIZED'
        )
          fail(409, 'PAYABLE_CHANGED', 'Payable changed after the request; review a new request.');
        const held = await tx.payoutRequest.aggregate({
          where: { payableId: row.payableId, status: { not: 'FAILED' }, id: { not: id } },
          _sum: { amountMillimes: true },
        });
        C.assertPayoutCapacity(
          payable.amountMillimes,
          held._sum.amountMillimes ?? 0n,
          row.amountMillimes,
        );
        const saved = await tx.payoutRequest.update({
          where: { id },
          data: { status: 'APPROVED', approverId: actor.id, approvedAt: new Date() },
        });
        await this.event(tx, actor, 'PayoutRequest', id, saved.status, input.reason);
        return json(view(saved));
      });
    });
  }
  async execution(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.payoutExecutionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.payoutRequest.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Payout not found.');
      await this.access(tx, actor, row.orderId, 'finance.payout.execute');
      return this.command(tx, actor, id, 'payout.execution', key, input, async () => {
        if (!['APPROVED', 'EXECUTION_PENDING', 'VERIFICATION_PENDING'].includes(row.status))
          fail(409, 'INVALID_TRANSITION', 'Execution requires independent payout approval.');
        if (
          !row.approverId ||
          !row.approvedAt ||
          row.approverId === row.requesterId ||
          row.policyVersion !== 1
        )
          fail(409, 'INVALID_APPROVAL', 'A valid independent approval is required.');
        const payable = await tx.artisanPayable.findUniqueOrThrow({ where: { id: row.payableId } });
        await this.noDisputes(tx, payable);
        if (
          payable.amountMillimes !== row.payableSnapshotMillimes ||
          payable.status !== 'RECOGNIZED'
        )
          fail(409, 'PAYABLE_CHANGED', 'Payable changed after approval.');
        if (new Date(input.occurredAt) > new Date())
          fail(400, 'INVALID_DATE', 'Execution date cannot be in the future.');
        const prior = await tx.payoutExecutionRecord.aggregate({
          where: { payoutId: id, status: 'VERIFICATION_PENDING' },
          _sum: { amountMillimes: true },
        });
        const amount = C.parseTnd(input.amountTnd);
        C.assertPayoutCapacity(row.amountMillimes, prior._sum.amountMillimes ?? 0n, amount);
        const status = input.outcome === 'FAILED' ? 'FAILED' : 'VERIFICATION_PENDING';
        const saved = await tx.payoutExecutionRecord.create({
          data: {
            payoutId: id,
            amountMillimes: amount,
            reference: input.reference,
            evidence: input.evidence,
            occurredAt: new Date(input.occurredAt),
            actorId: actor.id,
            status,
            bankVerified: false,
          },
        });
        await tx.payoutRequest.update({
          where: { id },
          data: {
            status:
              (prior._sum.amountMillimes ?? 0n) > 0n || status === 'VERIFICATION_PENDING'
                ? 'VERIFICATION_PENDING'
                : 'EXECUTION_PENDING',
          },
        });
        await this.event(
          tx,
          actor,
          'PayoutExecutionRecord',
          saved.id,
          status,
          `Manual execution evidence is unverified. ${input.evidence}`,
        );
        return json({ ...view(saved), paidVerifiedTnd: '0.000' });
      });
    });
  }
  private async claim(tx: Db, actor: Actor, batchId: string) {
    const batch = await tx.commercialBatch.findUnique({
      where: { id: batchId },
      include: { artisanProfile: true, offer: true },
    });
    if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
    return { batch, own: batch.artisanProfile.userId === actor.id };
  }
  async dispute(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.paymentDisputeSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const c = await this.claim(tx, actor, input.batchId);
      if (c.batch.orderId !== orderId) fail(404, 'NOT_FOUND', 'Batch not found.');
      if (!c.own)
        fail(
          403,
          'ASSISTED_REPORTING_UNAPPROVED',
          'Only the authenticated artisan can lodge this claim; assisted financial reporting has no approved policy.',
        );
      return this.command(tx, actor, orderId, 'dispute.raise', key, input, async () => {
        if (input.payableId) {
          const p = await tx.artisanPayable.findUnique({ where: { id: input.payableId } });
          if (!p || p.batchId !== input.batchId) fail(404, 'NOT_FOUND', 'Payable not found.');
        }
        const row = await tx.paymentDispute.create({
          data: {
            orderId,
            batchId: input.batchId,
            payableId: input.payableId,
            artisanProfileId: c.batch.artisanProfileId,
            amountMillimes: C.parseTnd(input.amountTnd),
            reason: input.reason,
            description: input.description,
            evidence: input.evidence,
            actorId: actor.id,
            responseDueAt: new Date(Date.now() + 7 * 86400_000),
          },
        });
        await this.event(tx, actor, 'PaymentDispute', row.id, 'OPEN', input.reason);
        return json(view(row));
      });
    });
  }
  async reviewDispute(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.disputeReviewSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.paymentDispute.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Dispute not found.');
      const c = await this.claim(tx, actor, row.batchId);
      if (!['RESOLVED', 'CLOSED'].includes(input.status))
        await this.access(tx, actor, row.orderId, 'finance.dispute.manage');
      else if (!c.own)
        fail(
          403,
          'CLAIMANT_CONFIRMATION_REQUIRED',
          'The claimant must accept the proposed resolution.',
        );
      return this.command(tx, actor, id, 'dispute.review', key, input, async () => {
        C.assertDisputeTransition(row.status, input.status, c.own);
        const saved = await tx.paymentDispute.update({
          where: { id },
          data: { status: input.status, ...(!c.own ? { handlerId: actor.id } : {}) },
        });
        await this.event(tx, actor, 'PaymentDispute', id, input.status, input.reason);
        return json(view(saved));
      });
    });
  }
  async adjustment(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.adjustmentProposalSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.adjustment.propose');
      return this.command(tx, actor, orderId, 'adjustment.propose', key, input, async () => {
        const snapshot = await this.snapshot(tx, orderId);
        const row = await tx.financialAdjustment.create({
          data: {
            orderId,
            amountMillimes: C.parseTnd(input.amountTnd),
            kind: input.kind,
            reason: input.reason,
            makerId: actor.id,
            direction: input.direction,
            evidence: input.evidence ?? input.reason,
            snapshot: json(snapshot),
          },
        });
        await this.event(tx, actor, 'FinancialAdjustment', row.id, row.status, input.reason);
        return json({ ...view(row), effect: 'PROPOSED_ONLY_OBLIGATIONS_PRESERVED' });
      });
    });
  }
  async approveAdjustment(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.financialAdjustment.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Adjustment not found.');
      await this.access(tx, actor, row.orderId, 'finance.adjustment.approve');
      return this.command(tx, actor, id, 'adjustment.approve', key, input, async () => {
        C.assertIndependentApproval(row.makerId, actor.id);
        if (row.status !== 'PENDING_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'Adjustment already reviewed.');
        const saved = await tx.financialAdjustment.update({
          where: { id },
          data: { status: 'APPROVED_PENDING_POLICY', checkerId: actor.id },
        });
        await this.event(tx, actor, 'FinancialAdjustment', id, saved.status, input.reason);
        return json({
          ...view(saved),
          effect: 'PENDING_COMPENSATION_POLICY_OBLIGATIONS_PRESERVED',
        });
      });
    });
  }
  async statement(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batches = await tx.commercialBatch.findMany({
        where: { artisanProfile: { userId: actor.id } },
        include: { offer: true, payables: true },
      });
      const disputes = await tx.paymentDispute.findMany({
        where: { batchId: { in: batches.map((b) => b.id) } },
      });
      const payouts = await tx.payoutRequest.findMany({
        where: { payableId: { in: batches.flatMap((b) => b.payables.map((p) => p.id)) } },
      });
      const executions = await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      });
      const events = await tx.financeRecordEvent.findMany({
        where: { targetId: { in: disputes.map((d) => d.id) } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        items: batches.map((b) => ({
          orderId: b.orderId,
          batchId: b.id,
          agreedTnd: C.formatTnd(b.offer.unitPayMillimes * BigInt(b.offer.quantity)),
          earnedTnd: C.formatTnd(b.payables.reduce((s, p) => s + p.amountMillimes, 0n)),
          payableTnd: C.formatTnd(b.payables.reduce((s, p) => s + p.amountMillimes, 0n)),
          paidVerifiedTnd: '0.000',
          payables: b.payables.map(payableView),
          disputes: disputes
            .filter((d) => d.batchId === b.id)
            .map((d) => ({ ...view(d), history: events.filter((e) => e.targetId === d.id) })),
          payouts: payouts
            .filter((p) => b.payables.some((q) => q.id === p.payableId))
            .map((p) => ({
              ...view(p),
              payableSnapshotMillimes: undefined,
              executions: executions.filter((e) => e.payoutId === p.id).map(view),
            })),
        })),
      };
    });
  }
  private async linkedPayables(tx: Db, orderId: string) {
    const order = await tx.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
    const projections = order.catalogueProcurementRevisionId
      ? await tx.procurementSample.findMany({
          where: { revisionId: order.catalogueProcurementRevisionId },
          include: { catalogueApproval: true },
        })
      : [];
    const sampleIds = projections.flatMap((p) =>
      p.catalogueApproval ? [p.catalogueApproval.sampleRequestId] : [],
    );
    return tx.artisanPayable.findMany({
      where: {
        OR: [{ orderId }, ...(sampleIds.length ? [{ sampleRequestId: { in: sampleIds } }] : [])],
      },
    });
  }
  async reviewRfq(
    actor: Actor,
    rfqId: string,
    input: z.infer<typeof C.rfqFinanceReviewSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const rfq = await tx.commercialRfq.findUnique({ where: { id: rfqId } });
      if (!rfq) fail(404, 'NOT_FOUND', 'RFQ unavailable.');
      const m = await tx.organizationMember.findFirst({
        where: {
          organizationId: rfq.operatorOrganizationId,
          userId: actor.id,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED', type: 'INTERNAL' },
        },
        include: { organization: true, roles: true, permissionGrants: true },
      });
      const assigned = await tx.operatorAssignment.findFirst({
        where: { operatorId: actor.id, organizationId: rfq.buyerOrganizationId, revokedAt: null },
      });
      if (!m || !assigned || !C.permissionsForMembership(m).includes('finance.payable.reconcile'))
        fail(404, 'NOT_FOUND', 'Scoped finance review required.');
      return this.command(tx, actor, rfqId, 'rfq.review', key, input, async () => {
        const quote = await tx.procurementQuote.findFirst({
          where: { id: input.quoteId, rfqId },
          include: { costEstimate: true },
        });
        if (!quote) fail(404, 'NOT_FOUND', 'Quote unavailable.');
        const currentQuote = await tx.procurementQuote.findFirst({
          where: { rfqId },
          orderBy: { version: 'desc' },
        });
        const currentCost = await tx.costEstimate.findFirst({
          where: { rfqId },
          orderBy: { version: 'desc' },
        });
        const currentFeasibility = await tx.feasibilityAssessment.findFirst({
          where: { rfqId },
          orderBy: { version: 'desc' },
        });
        if (currentQuote?.id !== quote.id || quote.expiresAt <= new Date())
          fail(409, 'STALE_QUOTE', 'Review the current unexpired quote.');
        if (
          input.decision === 'APPROVE_ADVISORY' &&
          (currentCost?.id !== quote.costEstimateId ||
            currentFeasibility?.id !== quote.feasibilityAssessmentId ||
            input.fundingStatus !== 'DOCUMENTED_PLAN' ||
            !quote.costEstimate ||
            quote.costEstimate.incomplete ||
            quote.totalMillimes < quote.costEstimate.subtotalMillimes)
        )
          fail(
            409,
            'FINANCE_REVIEW_UNSUPPORTED',
            'A complete sustainable cost estimate and documented funding plan are required.',
          );
        const previous = await latestFinanceReview(tx, rfqId);
        const reviewVersion =
          Number((previous?.data as Record<string, unknown> | null)?.reviewVersion ?? 0) + 1;
        const row = await tx.financeRecordEvent.create({
          data: {
            targetId: rfqId,
            targetType: 'RfqFinanceReview',
            actorId: actor.id,
            status: input.decision,
            reason: input.reason,
            data: json({
              ...input,
              reviewVersion,
              quoteSnapshotSha256: await quoteReviewSnapshot(tx, rfq, quote),
              fundingSha256: evidenceHash({
                fundingStatus: input.fundingStatus,
                fundingEvidence: input.fundingEvidence,
              }),
              termsSha256: quote.termsSha256,
              costEstimateId: quote.costEstimateId,
            }),
          },
        });
        await audit(tx, actor, {
          action: 'finance.rfq.review',
          targetType: 'FinanceRecordEvent',
          targetId: row.id,
          organizationId: rfq.operatorOrganizationId,
          reason: input.reason,
          after: { decision: input.decision, verifiedFunds: false },
        });
        return json({ id: row.id, decision: input.decision, verifiedFunds: false });
      });
    });
  }
  async analysis(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor, orderId);
      if (!access.finance) fail(404, 'NOT_FOUND', 'Scoped finance access required.');
      const quote = access.order.acceptance?.quote;
      const estimate = quote?.costEstimateId
        ? await tx.costEstimate.findUnique({ where: { id: quote.costEstimateId } })
        : null;
      const [payables, costs, models, deposits] = await Promise.all([
        this.linkedPayables(tx, orderId),
        tx.financeRecordEvent.findMany({
          where: { orderId, targetType: 'OrderCostEvidence' },
          orderBy: { createdAt: 'asc' },
        }),
        tx.financeRecordEvent.findMany({
          where: { orderId, targetType: 'CashModelReview' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }),
        tx.buyerDepositRecord.findMany({ where: { orderId } }),
      ]);
      const costLines = costs.map((c) => ({
        id: c.id,
        sourceReference: c.sourceKey,
        ...(c.data as Record<string, unknown>),
      }));
      const recordedCosts = costLines.reduce(
        (sum, c) => sum + C.parseTnd(String((c as Record<string, unknown>).amountTnd)),
        0n,
      );
      const obligations = payables.reduce((sum, p) => sum + p.amountMillimes, 0n);
      const model = models[0]?.data as z.infer<typeof C.cashModelSchema> | undefined;
      const events: CashEvent[] = (model?.events ?? []).map((e, i) => ({
        id: `${models[0].id}:${i}`,
        date: e.date,
        direction: e.direction,
        amount: C.parseTnd(e.amountTnd),
        evidence: 'PROJECTED',
      }));
      const revenue = quote?.totalMillimes ?? null;
      const known = recordedCosts + obligations;
      return {
        orderId,
        currency: 'TND',
        acceptedQuote: quote
          ? {
              id: quote.id,
              revenueTnd: C.formatTnd(quote.totalMillimes),
              termsSha256: quote.termsSha256,
            }
          : null,
        plannedCost: estimate
          ? {
              id: estimate.id,
              totalTnd: C.formatTnd(estimate.subtotalMillimes),
              components: estimate.components,
              incomplete: estimate.incomplete,
            }
          : null,
        plannedContributionTnd:
          revenue !== null && estimate && !estimate.incomplete
            ? signedTnd(revenue - estimate.subtotalMillimes)
            : null,
        recordedCostLines: costLines,
        recordedCostsTnd: C.formatTnd(recordedCosts),
        artisanObligationsTnd: C.formatTnd(obligations),
        outstandingLiabilitiesTnd: C.formatTnd(obligations),
        obligations: payables.map((p) => ({
          id: p.id,
          sampleRequestId: p.sampleRequestId,
          amountTnd: C.formatTnd(p.amountMillimes),
          provenance: p.provenance,
        })),
        quoteBasisContributionTnd: revenue === null ? null : signedTnd(revenue - known),
        actualContributionTnd: null,
        actualRevenueTnd: null,
        reason: 'REVENUE_RECOGNITION_POLICY_AND_FULL_COST_EVIDENCE_UNAVAILABLE',
        quotedVsRecordedCostVarianceTnd: estimate
          ? signedTnd(known - estimate.subtotalMillimes)
          : null,
        varianceReason: model?.varianceReason ?? 'NOT_REVIEWED',
        receipts: deposits.map((d) => ({ ...depositView(d), verified: false })),
        verifiedReceiptsTnd: '0.000',
        buyerMilestones: model?.events.filter((e) => e.direction === 'IN') ?? [],
        cashModel: model
          ? {
              reviewId: models[0].id,
              reviewedBy: models[0].actorId,
              costCoverage: model.costCoverage,
              ...cashGap(events),
              incomplete: model.costCoverage === 'INCOMPLETE' || cashGap(events).incomplete,
              minimumModeledGapTnd:
                model.costCoverage === 'INCOMPLETE' ? null : cashGap(events).minimumModeledGapTnd,
            }
          : null,
        financeReviewRequired: true,
        contractCommitmentAllowed: false,
        limitations: [
          'Quote-basis contribution is an estimate, not recognized profit',
          'Recorded cost evidence is unverified and excludes artisan amounts shown separately',
          'Linked samples may support multiple orders: each view discloses the full shared obligation, not allocated portfolio costs',
          'Cash model is advisory and does not amend contractual dates or settle obligations',
          'No live bank verification or revenue-recognition policy is enabled',
        ],
      };
    });
  }
  async recordCost(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.financialCostSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.payable.reconcile');
      return this.command(tx, actor, orderId, 'cost.record', key, input, async () => {
        if (new Date(input.occurredAt) > new Date())
          fail(400, 'INVALID_DATE', 'Recorded cost occurrence cannot be in the future.');
        const row = await tx.financeRecordEvent.create({
          data: {
            orderId,
            targetId: orderId,
            targetType: 'OrderCostEvidence',
            actorId: actor.id,
            status: 'RECORDED_UNVERIFIED',
            reason: input.reason,
            sourceKey: `${orderId}:cost:${input.sourceReference}`,
            data: json(input),
          },
        });
        await audit(tx, actor, {
          action: 'finance.cost.record',
          targetType: 'FinanceRecordEvent',
          targetId: row.id,
          reason: input.reason,
          after: { orderId, verified: false },
        });
        return json({ id: row.id, ...input, verified: false });
      });
    });
  }
  async reviewCashModel(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.cashModelSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.payable.reconcile');
      return this.command(tx, actor, orderId, 'cash.review', key, input, async () => {
        const row = await tx.financeRecordEvent.create({
          data: {
            orderId,
            targetId: orderId,
            targetType: 'CashModelReview',
            actorId: actor.id,
            status: 'ADVISORY_REVIEWED',
            reason: input.reason,
            data: json(input),
          },
        });
        await audit(tx, actor, {
          action: 'finance.cash.review',
          targetType: 'FinanceRecordEvent',
          targetId: row.id,
          reason: input.reason,
          after: { orderId, commitsContract: false },
        });
        return json({ id: row.id, status: row.status, commitsContract: false });
      });
    });
  }
  async exportAccounting(
    actor: Actor,
    orderId: string,
    period: z.infer<typeof C.financePeriodSchema>,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.accounting.export');
      const rows: AccountingRow[] = [];
      const add = (
        id: string,
        sourceId: string,
        date: Date,
        kind: string,
        amount: bigint,
        evidence: string,
      ) => rows.push({ id, sourceId, orderId, date: date.toISOString(), kind, amount, evidence });
      const order = await tx.commercialOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { rfq: true, acceptance: { include: { quote: true } } },
      });
      if (order.acceptance)
        add(
          `quote:${order.acceptance.quote.id}`,
          order.acceptance.id,
          order.acceptance.createdAt,
          'ACCEPTED_QUOTE_REFERENCE',
          order.acceptance.quote.totalMillimes,
          `${order.rfq.provenance}:CONTRACT_REFERENCE_NOT_REVENUE_RECOGNITION`,
        );
      const exportPayables = await this.linkedPayables(tx, orderId);
      for (const p of exportPayables)
        add(
          `payable:${p.id}`,
          p.sourceEventId,
          p.createdAt,
          p.sampleRequestId ? 'SHARED_SAMPLE_LIABILITY' : 'ARTISAN_LIABILITY',
          p.amountMillimes,
          p.provenance,
        );
      for (const d of await tx.buyerDepositRecord.findMany({ where: { orderId } }))
        add(
          `deposit:${d.id}`,
          d.id,
          d.paymentDate,
          'BUYER_RECEIPT_REPORT',
          d.amountMillimes,
          `${d.provenance}:${d.status}`,
        );
      const payouts = await tx.payoutRequest.findMany({ where: { orderId } });
      for (const p of payouts)
        add(
          `request:${p.id}`,
          p.payableId,
          p.createdAt,
          'PAYOUT_REQUEST',
          p.amountMillimes,
          `${exportPayables.find((a) => a.id === p.payableId)?.provenance ?? 'UNKNOWN'}:${p.status}`,
        );
      for (const e of await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      }))
        add(
          `execution:${e.id}`,
          e.id,
          e.occurredAt,
          'PAYOUT_EXECUTION',
          e.amountMillimes,
          e.bankVerified && e.status === 'VERIFIED_SETTLED'
            ? 'VERIFIED_SETTLED'
            : `${exportPayables.find((p) => p.id === payouts.find((r) => r.id === e.payoutId)?.payableId)?.provenance ?? 'UNKNOWN'}:${e.status}:UNVERIFIED`,
        );
      for (const s of await tx.simulatedSettlement.findMany({ where: { orderId } }))
        add(
          `simulation:${s.id}`,
          s.id,
          s.createdAt,
          'SIMULATED_SETTLEMENT',
          s.amountMillimes,
          `SYNTHETIC:${s.status}`,
        );
      for (const c of await tx.financeRecordEvent.findMany({
        where: { orderId, targetType: 'OrderCostEvidence' },
      })) {
        const data = c.data as Record<string, string>;
        add(
          `cost:${c.id}`,
          c.id,
          new Date(data.occurredAt),
          `COST_${data.category}`,
          C.parseTnd(data.amountTnd),
          data.provenance,
        );
      }
      const result = accountingExport(
        rows,
        new Date(period.from).toISOString(),
        new Date(period.to).toISOString(),
      );
      await audit(tx, actor, {
        action: 'finance.accounting.export',
        targetType: 'CommercialOrder',
        targetId: orderId,
        after: {
          from: period.from,
          to: period.to,
          rowCount: result.rowCount,
          sourceIds: rows
            .filter(
              (r) =>
                r.date >= new Date(period.from).toISOString() &&
                r.date < new Date(period.to).toISOString(),
            )
            .map((r) => r.id),
        },
      });
      return result;
    });
  }
  async contractualDates(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId);
      if (!a.finance) fail(404, 'NOT_FOUND', 'Scoped finance access required.');
      const payables = await this.linkedPayables(tx, orderId);
      return {
        payables: payables.map((p) => ({
          id: p.id,
          amountTnd: C.formatTnd(p.amountMillimes),
          sampleRequestId: p.sampleRequestId,
        })),
        history: await tx.contractualDueDate.findMany({
          where: { payableId: { in: payables.map((p) => p.id) } },
          orderBy: { version: 'desc' },
        }),
        // Owner decision D1 is open: no approved settlement-verification authority exists, so the
        // capability is reported unavailable rather than as a measured zero.
        verificationAvailability: C.verificationAvailability({
          authorityApproved: false,
          verifiedPaid: 0n,
        }),
      };
    });
  }
  async recordContractualDate(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.contractualDueDateSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access(tx, actor, orderId, 'finance.payable.reconcile');
      const payable = (await this.linkedPayables(tx, orderId)).find(
        (p) => p.id === input.payableId,
      );
      if (!payable) fail(404, 'NOT_FOUND', 'A payable in this order scope is required.');
      return this.command(tx, actor, orderId, 'contract-date.record', key, input, async () => {
        const previous = await tx.contractualDueDate.findFirst({
          where: { payableId: payable.id },
          orderBy: { version: 'desc' },
        });
        if (input.version !== (previous?.version ?? 0) + 1)
          fail(409, 'VERSION_CONFLICT', 'Reload the contractual date history.');
        const offer = payable.offerId
          ? await tx.commercialOffer.findUnique({ where: { id: payable.offerId } })
          : null;
        const sha = evidenceHash(payable.termsSnapshot);
        const row = await tx.contractualDueDate.create({
          data: {
            payableId: payable.id,
            version: input.version,
            basis: input.basis,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            contractReference: payable.offerId
              ? `OFFER:${payable.offerId}`
              : `SAMPLE:${payable.sampleRequestId}`,
            contractVersion: `PAYABLE_TERMS_SHA256:${sha}`,
            payableTermsSha256: sha,
            offerVersionAtRecording: offer?.version ?? null,
            sourceEvidence: input.sourceEvidence,
            reason: input.reason,
            actorId: actor.id,
            correctionOfId: previous?.id ?? null,
          },
        });
        await audit(tx, actor, {
          action: 'finance.contract-date.record',
          targetType: 'ContractualDueDate',
          targetId: row.id,
          reason: input.reason,
          after: {
            payableId: payable.id,
            version: row.version,
            changesAcceptedTerms: false,
            verifiedPayment: false,
          },
        });
        return json({ ...row, changesAcceptedTerms: false, verifiedPayment: false });
      });
    });
  }
  async timeliness(actor: Actor, orderId: string, period: z.infer<typeof C.financePeriodSchema>) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId);
      if (!a.finance) fail(404, 'NOT_FOUND', 'Scoped finance access required.');
      const payables = await this.linkedPayables(tx, orderId);
      const payouts = await tx.payoutRequest.findMany({ where: { orderId } });
      const executions = await tx.payoutExecutionRecord.findMany({
        where: { payoutId: { in: payouts.map((p) => p.id) } },
      });
      const disputes = await tx.paymentDispute.findMany({
        where: { orderId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      });
      const dates = await tx.contractualDueDate.findMany({
        where: { payableId: { in: payables.map((p) => p.id) } },
        orderBy: { version: 'desc' },
      });
      const simulations = await tx.simulatedSettlement.findMany({ where: { orderId } });
      const rows = payables.map((p) => {
        const latest = dates.find((d) => d.payableId === p.id);
        const due =
          latest?.payableTermsSha256 === evidenceHash(p.termsSnapshot)
            ? (latest.dueAt?.toISOString() ?? null)
            : null;
        return {
          id: p.id,
          amount: p.amountMillimes,
          dueAt: due,
          createdAt: p.createdAt.toISOString(),
          provenance: p.provenance,
          disputed: disputes.some((d) => d.payableId === p.id || d.batchId === p.batchId),
          settlements: executions
            .filter((e) => payouts.find((r) => r.id === e.payoutId)?.payableId === p.id)
            .map((e) => ({
              amount: e.amountMillimes,
              date: e.occurredAt.toISOString(),
              verified: e.bankVerified,
              status: e.status,
              reference: e.reference,
            })),
        };
      });
      const metric = paymentTimeliness(rows, period.from, period.to);
      return {
        ...metric,
        // Owner decision D1 is open: no approved settlement-verification authority exists, so the
        // capability is reported unavailable rather than as a measured zero.
        verificationAvailability: C.verificationAvailability({
          authorityApproved: false,
          verifiedPaid: 0n,
        }),
        contractualDateHistory: dates.map((d) => ({ ...d, dueAt: d.dueAt?.toISOString() ?? null })),
        details: metric.details.map((detail) => {
          const request = payouts.filter((r) => r.payableId === detail.id);
          const reports = executions.filter((e) => request.some((r) => r.id === e.payoutId));
          const simulated = simulations.filter((s) => s.payableId === detail.id);
          const reported = reports
            .filter((e) => e.status !== 'FAILED')
            .reduce((n, e) => n + e.amountMillimes, 0n);
          const amount = payables.find((p) => p.id === detail.id)!.amountMillimes;
          const date = dates.find((d) => d.payableId === detail.id);
          let state = simulated.length
            ? simulated[simulated.length - 1].status
            : 'UNKNOWN_UNAVAILABLE';
          if (request.some((p) => p.status === 'FAILED')) state = 'FAILED';
          if (request.some((p) => p.status === 'REQUESTED' || p.status === 'APPROVED'))
            state = 'SCHEDULED';
          if (request.some((p) => p.status === 'EXECUTION_PENDING')) state = 'INITIATED';
          if (reports.some((e) => e.status === 'VERIFICATION_PENDING'))
            state = 'VERIFICATION_PENDING';
          if (reports.length && reports.every((e) => e.status === 'FAILED')) state = 'FAILED';
          if (reported > 0n && reported < amount) state = 'PARTIAL_REPORTED_UNVERIFIED';
          if (reported > amount) state = 'OVERPAYMENT_REPORTED_REVIEW';
          if (detail.status === 'DISPUTED_EXCLUDED') state = 'DISPUTED';
          return {
            ...detail,
            operationalState: state,
            executionStatuses: reports.map((e) => e.status),
            requestStatuses: request.map((r) => r.status),
            simulatedSettlementStatuses: simulated.map((r) => r.status),
            reportedUnverifiedTnd: C.formatTnd(reported),
            dueDateEvidence: date
              ? {
                  id: date.id,
                  version: date.version,
                  basis: date.basis,
                  status: date.evidenceStatus,
                  sourceEvidence: date.sourceEvidence,
                  contractReference: date.contractReference,
                  contractVersion: date.contractVersion,
                }
              : null,
          };
        }),
        exclusions: [
          ...metric.exclusions,
          'Contractual dates are explicit evidence transcriptions, not amendments or legal approval. No approved settlement-verification mechanism is enabled.',
        ],
      };
    });
  }
  async closeOrder(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.closureDecisionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const a = await this.access(tx, actor, orderId, 'finance.closure.assess');
      return this.command(tx, actor, orderId, 'closure.decide', key, input, async () => {
        if (a.order.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the order.');
        const result = await this.assess(tx, orderId);
        // No reviewed legal, bank or liability-disposition policy is installed. No role can waive debt.
        const row = await tx.orderClosureAssessment.create({
          data: {
            orderId,
            actorId: actor.id,
            status: 'BLOCKED',
            blockers: result.blockers,
            snapshot: json({
              ledger: await this.snapshot(tx, orderId),
              decision: input,
              exceptionDisposition: 'NO_APPROVED_EXCEPTION_POLICY',
            }),
          },
        });
        await this.event(tx, actor, 'OrderClosureAssessment', row.id, 'DENIED', input.reason);
        return json({
          id: row.id,
          status: 'DENIED',
          orderUnchanged: true,
          blockers: result.blockers,
          exceptionDisposition: input.exceptionReference
            ? 'DENIED_NO_APPROVED_EXCEPTION_POLICY'
            : 'NONE_REQUESTED',
        });
      });
    });
  }
  private async snapshot(tx: Db, orderId: string) {
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        batches: { include: { offer: true, materialRequirements: true } },
        shipments: { include: { buyerConfirmation: true } },
        payables: true,
      },
    });
    const batchIds = order.batches.map((b) => b.id);
    const payouts = await tx.payoutRequest.findMany({ where: { orderId } });
    const custody = await tx.materialHandover.findMany({ where: { batchId: { in: batchIds } } });
    return json({
      orderId,
      status: order.status,
      delivered: order.delivered,
      materialsResolved: order.materialsResolved,
      batches: order.batches.map((b) => ({
        id: b.id,
        produced: b.produced,
        approved: b.approved,
        rejected: b.rejected,
        acceptedQuantity: b.offer.quantity,
        unitPayTnd: C.formatTnd(b.offer.unitPayMillimes),
        paymentTerms: b.offer.paymentConditions,
        termsSha256: b.offer.termsSha256,
        materialRequirements: b.materialRequirements,
      })),
      confirmations: order.shipments.map((s) => ({
        shipmentId: s.id,
        status: s.status,
        confirmation: s.buyerConfirmation,
      })),
      payables: (await this.linkedPayables(tx, orderId)).map(payableView),
      payouts: payouts.map((p) => ({
        ...view(p),
        payableSnapshotMillimes: undefined,
        payableSnapshotTnd: C.formatTnd(p.payableSnapshotMillimes),
      })),
      executions: (
        await tx.payoutExecutionRecord.findMany({
          where: { payoutId: { in: payouts.map((p) => p.id) } },
        })
      ).map(view),
      deposits: (await tx.buyerDepositRecord.findMany({ where: { orderId } })).map(depositView),
      disputes: (
        await tx.paymentDispute.findMany({
          where: { orderId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        })
      ).map(view),
      adjustments: (
        await tx.financialAdjustment.findMany({
          where: { orderId },
          select: { id: true, kind: true, direction: true, status: true, amountMillimes: true },
        })
      ).map(view),
      materialReadiness: await tx.materialReadiness.findMany({
        where: { batchId: { in: batchIds } },
      }),
      reservations: await tx.materialReservation.findMany({ where: { batchId: { in: batchIds } } }),
      custody,
      returns: await tx.materialReturn.findMany({
        where: { handoverId: { in: custody.map((h) => h.id) } },
      }),
      policyVersions: {
        payoutApproval: 1,
        compensationEntitlement: null,
        stockVerification: null,
        bankVerification: null,
        taxInvoice: null,
      },
      verifiedPaidTnd: '0.000',
      materialCostStatus: 'UNAVAILABLE_REQUIRES_POLICY',
    });
  }
  async assess(tx: Db, orderId: string, syntheticDisposition = false) {
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        rfq: true,
        batches: { include: { offer: true, materialRequirements: true } },
        acceptance: { include: { quote: true } },
        payments: true,
        shipments: { include: { buyerConfirmation: true } },
        payables: true,
      },
    });
    const [disputes, adjustments, payouts] = await Promise.all([
      tx.paymentDispute.count({ where: { orderId, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      tx.financialAdjustment.count({ where: { orderId } }),
      tx.payoutRequest.count({ where: { orderId, status: { not: 'FAILED' } } }),
    ]);
    const linkedPayables = await this.linkedPayables(tx, orderId);
    const batchIds = order.batches.map((b) => b.id);
    const deposits = await tx.buyerDepositRecord.findMany({ where: { orderId } });
    const requests = await tx.payoutRequest.findMany({
      where: { OR: [{ orderId }, { payableId: { in: linkedPayables.map((p) => p.id) } }] },
    });
    const executions = await tx.payoutExecutionRecord.findMany({
      where: { payoutId: { in: requests.map((p) => p.id) } },
    });
    const custody = await tx.materialHandover.findMany({ where: { batchId: { in: batchIds } } });
    const allReservations = await tx.materialReservation.findMany({
      where: { batchId: { in: batchIds } },
    });
    const readiness = await tx.materialReadiness.findMany({ where: { batchId: { in: batchIds } } });
    const adjustmentsRows = await tx.financialAdjustment.findMany({ where: { orderId } });
    const disputedRows = await tx.paymentDispute.findMany({
      where: { OR: [{ orderId }, { payableId: { in: linkedPayables.map((p) => p.id) } }] },
    });
    const sourceIds = [
      orderId,
      order.rfqId,
      ...(order.acceptance ? [order.acceptance.id, order.acceptance.quoteId] : []),
      ...linkedPayables.flatMap((p) => [
        p.sourceEventId,
        ...(p.offerId ? [p.offerId] : []),
        ...(p.sampleRequestId ? [p.sampleRequestId] : []),
      ]),
      ...batchIds,
      ...deposits.map((d) => d.id),
      ...linkedPayables.map((p) => p.id),
      ...requests.map((p) => p.id),
      ...executions.map((p) => p.id),
      ...adjustmentsRows.map((a) => a.id),
      ...disputedRows.map((d) => d.id),
      ...custody.map((h) => h.id),
      ...allReservations.map((a) => a.id),
    ];
    const financeEvidence = await tx.financeRecordEvent.count({
      where: {
        targetType: { not: 'OrderClosureAssessment' },
        OR: [{ orderId }, { targetId: { in: sourceIds } }],
      },
    });
    // Historical demo state machine is available only when there is no authoritative finance/inventory source.
    const syntheticOnly =
      !order.rfq.procurementManaged &&
      order.provenance === 'SYNTHETIC' &&
      !order.catalogueProcurementRevisionId &&
      !order.productSpecificationRevisionId &&
      !linkedPayables.length &&
      !deposits.length &&
      !requests.length &&
      !adjustments &&
      !disputedRows.length &&
      !financeEvidence &&
      !custody.length &&
      !allReservations.length &&
      !readiness.length &&
      !order.shipments.length &&
      !order.batches.some((b) => b.materialRequirements.length);
    if (syntheticOnly) {
      const sum = (key: 'produced' | 'submitted' | 'approved' | 'rejected' | 'pending') =>
        order.batches.reduce((n, b) => n + b[key], 0);
      const blockers: string[] = [];
      try {
        C.transitionOrder(order.status as C.OrderState, 'CLOSED', ['FINANCE_MANAGER'], {
          requested: order.rfq.quantity,
          allocated: order.batches.reduce((n, b) => n + b.offer.quantity, 0),
          reserved: 0,
          produced: sum('produced'),
          submitted: sum('submitted'),
          approved: sum('approved'),
          rejected: sum('rejected'),
          pending: sum('pending'),
          delivered: order.delivered,
          buyerDue: order.rfq.quoteMillimes ?? 0n,
          buyerSettled: order.payments
            .filter((p) => p.kind === 'BUYER_RECEIPT' && p.status === 'SETTLED')
            .reduce((n, p) => n + p.amountMillimes, 0n),
          artisanDue: order.batches.reduce(
            (n, b) => n + b.offer.unitPayMillimes * BigInt(b.approved),
            0n,
          ),
          artisanSettled: order.payments
            .filter((p) => p.kind === 'ARTISAN_PAYOUT' && p.status === 'SETTLED')
            .reduce((n, p) => n + p.amountMillimes, 0n),
          materialsResolved: order.materialsResolved || syntheticDisposition,
          pendingPayments: order.payments.filter(
            (p) => !['SETTLED', 'FAILED', 'CANCELLED'].includes(p.status),
          ).length,
          openDisputes:
            order.batches.filter((b) => b.status === 'DISPUTED').length +
            order.payments.filter((p) => p.status === 'DISPUTED').length,
        });
      } catch (error) {
        blockers.push(
          error instanceof C.CommerceRuleError ? error.code : 'SYNTHETIC_ORDER_NOT_READY',
        );
      }
      return {
        status: blockers.length ? 'BLOCKED' : 'SYNTHETIC_ONLY_READY',
        blockers,
        buyerAcceptedQuantity: order.delivered,
        paidVerifiedTnd: '0.000',
      };
    }
    const accepted = order.shipments.reduce((s, r) => s + (r.buyerConfirmation?.accepted ?? 0), 0);
    const blockers = [
      'BUYER_BANK_EVIDENCE_UNAVAILABLE',
      'PAYOUT_PROVIDER_VERIFICATION_UNAVAILABLE',
      'TAX_INVOICE_POLICY_UNAPPROVED',
    ];
    const expectedRevenue = order.acceptance?.quote.totalMillimes ?? order.rfq.quoteMillimes;
    blockers.push(
      expectedRevenue === null
        ? 'BUYER_RECEIVABLE_AMOUNT_UNKNOWN'
        : 'BUYER_RECEIVABLES_UNRECONCILED',
    );
    if (
      accepted < order.rfq.quantity ||
      order.shipments.some((s) => s.status === 'DISCREPANCY' || !s.buyerConfirmation)
    )
      blockers.push('DELIVERY_RECONCILIATION_INCOMPLETE');
    if (linkedPayables.some((p) => p.amountMillimes > 0n))
      blockers.push('ARTISAN_PAYABLES_OUTSTANDING');
    if (
      order.batches.some(
        (batch) =>
          batch.produced >
          order.payables
            .filter((payable) => payable.batchId === batch.id)
            .reduce((sum, payable) => sum + payable.quantity, 0),
      ) ||
      (order.status === 'CANCELLED' && order.batches.length > 0)
    )
      blockers.push('COMPENSATION_ENTITLEMENT_REVIEW_REQUIRED');
    if (disputes || disputedRows.some((d) => !['RESOLVED', 'CLOSED'].includes(d.status)))
      blockers.push('OPEN_PAYMENT_DISPUTES');
    if (payouts || requests.some((p) => p.status !== 'FAILED')) blockers.push('PAYOUTS_UNVERIFIED');
    if (adjustments || order.status === 'CANCELLED')
      blockers.push('SETTLEMENT_POLICY_REVIEW_REQUIRED');
    const reservations = await tx.materialReservation.count({
      where: { batchId: { in: batchIds }, remainingMilli: { gt: 0 } },
    });
    const returns = await tx.materialReturn.count({
      where: { handoverId: { in: custody.map((h) => h.id) }, disposition: 'AWAITING_INSPECTION' },
    });
    const materialReadiness = await tx.materialReadiness.findMany({
      where: { batchId: { in: batchIds } },
    });
    if (
      materialReadiness.some((r) =>
        [
          'RECEIPT_INCOMPLETE',
          'DISCREPANCY_BLOCKED',
          'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION',
        ].includes(r.readiness),
      )
    )
      blockers.push('MATERIAL_READINESS_REVIEW_REQUIRED');
    const receipts = await tx.materialReceipt.findMany({
      where: { handoverId: { in: custody.map((h) => h.id) } },
    });
    if (custody.length) blockers.push('PHYSICAL_STOCK_VERIFICATION_UNAVAILABLE');
    if (
      !order.materialsResolved ||
      reservations ||
      returns ||
      custody.some((h) => {
        const receipt = receipts.find((r) => r.handoverId === h.id);
        return (
          !['RECEIVED_CONFIRMED', 'DISCREPANCY_RECONCILED'].includes(h.status) ||
          !receipt ||
          receipt.receivedMilli - receipt.damagedMilli > h.consumedMilli + h.returnedMilli
        );
      })
    )
      blockers.push('MATERIAL_LIABILITIES_UNRESOLVED');
    return {
      status: 'BLOCKED',
      blockers,
      buyerAcceptedQuantity: accepted,
      paidVerifiedTnd: '0.000',
    };
  }
  private assessmentHistory(tx: Db, orderId: string) {
    return tx.orderClosureAssessment.findMany({
      where: { orderId },
      select: {
        id: true,
        actorId: true,
        status: true,
        blockers: true,
        snapshot: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  }
  async closure(actor: Actor, orderId: string, persist = false, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(
        tx,
        actor,
        orderId,
        persist ? 'finance.closure.assess' : undefined,
      );
      if (!access.finance && !persist)
        fail(404, 'NOT_FOUND', 'Financial closure requires scoped finance access.');
      if (!persist)
        return {
          ...(await this.assess(tx, orderId)),
          history: await this.assessmentHistory(tx, orderId),
        };
      return this.command(tx, actor, orderId, 'closure.assess', key, {}, async () => {
        const result = await this.assess(tx, orderId);
        const row = await tx.orderClosureAssessment.create({
          data: {
            orderId,
            actorId: actor.id,
            status: result.status,
            blockers: result.blockers,
            snapshot: await this.snapshot(tx, orderId),
          },
        });
        await this.event(
          tx,
          actor,
          'OrderClosureAssessment',
          row.id,
          result.status,
          result.blockers.join(', '),
        );
        return { ...result, id: row.id };
      });
    });
  }
}
