import {
  quoteReviewSnapshot,
  latestFinanceReview,
  evidenceHash,
} from '../finance/review-policy.js';
import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import type { CommercialRfq, Prisma } from '@prisma/client';
import { z } from 'zod';
import * as C from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { DirectoryService } from '../directory/directory.service.js';
import {
  issueCostedQuote,
  recordCost,
  recordEffort,
  recordFeasibility,
  viewAssessment,
  viewCost,
} from './commercial-decision.js';
import { procurementAudit, revision, specificationSnapshot } from './records.js';
import { projectBuyerDocument, projectBuyerSnapshot } from './buyer-document.js';
const take = 30;
const pageArgs = (page: number) => ({ skip: (page - 1) * take, take: take + 1 });
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
function same(actual: number, expected: number) {
  if (actual !== expected)
    fail(409, 'VERSION_CONFLICT', 'This request changed. Reload before trying again.');
}
type Access = {
  buyer: boolean;
  operator: boolean;
  purchasing: boolean;
  negotiating: boolean;
  approving: boolean;
  coordinator: boolean;
};
@Injectable()
export class ProcurementService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
  ) {}
  private async access(tx: Db, actor: Actor, rfq: CommercialRfq, thread = false): Promise<Access> {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const buyer = members.find(
      (m) =>
        m.organizationId === rfq.buyerOrganizationId &&
        m.organization.type === 'BUYER_BUSINESS' &&
        C.permissionsForMembership(m).includes('buyer.rfq.read'),
    );
    const internal = members.find(
      (m) =>
        m.organizationId === rfq.operatorOrganizationId &&
        m.organization.type === 'INTERNAL' &&
        (m.roles.some((r) => ['FINANCE_MANAGER'].includes(r.role)) ||
          C.permissionsForMembership(m).includes('operator.quotation.prepare')),
    );
    const assigned =
      internal?.roles.some((r) => ['FINANCE_MANAGER'].includes(r.role)) ||
      Boolean(
        internal &&
          (await tx.operatorAssignment.findFirst({
            where: {
              operatorId: actor.id,
              organizationId: rfq.buyerOrganizationId,
              revokedAt: null,
              organization: { approvalStatus: 'APPROVED' },
            },
          })),
      );
    const buyerAvailable = await tx.organization.findFirst({
      where: { id: rfq.buyerOrganizationId, approvalStatus: 'APPROVED' },
      select: { id: true },
    });
    const operator = Boolean(internal && assigned && buyerAvailable && rfq.status !== 'DRAFT');
    const partnerScopeAvailable = Boolean(
      await tx.commercialRfq.findFirst({
        where: {
          id: rfq.id,
          buyerOrganization: { approvalStatus: 'APPROVED' },
          operatorOrganization: { approvalStatus: 'APPROVED' },
        },
        select: { id: true },
      }),
    );
    let coordinator = false;
    if (thread && !buyer && !operator && partnerScopeAvailable) {
      const member = members.find(
        (m) =>
          m.isCoordinator && ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(m.organization.type),
      );
      coordinator = Boolean(
        member &&
          (await tx.commercialOffer.findFirst({
            where: {
              order: { rfqId: rfq.id },
              status: 'ACCEPTED',
              artisanProfile: {
                authorizations: {
                  some: { purpose: 'PARTICIPATION', withdrawnAt: null, policy: { active: true } },
                },
                assignments: {
                  some: {
                    coordinatorId: actor.id,
                    organizationId: member.organizationId,
                    endedAt: null,
                  },
                },
                managements: { some: { organizationId: member.organizationId, endedAt: null } },
              },
            },
          })),
      );
    }
    if (!buyer && !operator && !coordinator) fail(404, 'NOT_FOUND', 'Request not found.');
    const perms = buyer ? C.permissionsForMembership(buyer) : [];
    return {
      buyer: Boolean(buyer),
      operator,
      purchasing: perms.includes('buyer.rfq.create'),
      negotiating: perms.includes('buyer.quotation.negotiate'),
      approving: perms.includes('buyer.quotation.approve'),
      coordinator,
    };
  }
  private async scoped(tx: Db, actor: Actor, id: string, thread = false) {
    const row = await tx.commercialRfq.findUnique({ where: { id } });
    if (!row) fail(404, 'NOT_FOUND', 'Request not found.');
    return { row, access: await this.access(tx, actor, row, thread) };
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    id: string,
    operation: string,
    key: string | undefined,
    input: Prisma.InputJsonValue,
    fn: () => Promise<T>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId: id, operation: `procurement.${operation}`, key },
      input,
      fn,
    );
  }
  private async currentRevision(tx: Db, actor: Actor, row: CommercialRfq) {
    return (
      (await tx.procurementRevision.findFirst({
        where: { rfqId: row.id },
        orderBy: { version: 'desc' },
      })) ??
      revision(
        tx,
        actor,
        row,
        'Baseline observed before procurement management; earlier revisions are unavailable.',
      )
    );
  }
  private async approvedSample(tx: Db, row: CommercialRfq) {
    const latest = await tx.procurementSample.findFirst({
      where: { rfqId: row.id },
      orderBy: { version: 'desc' },
      include: { decision: true },
    });
    const rev = await tx.procurementRevision.findFirst({
      where: { rfqId: row.id },
      orderBy: { version: 'desc' },
    });
    return latest?.decision?.decision === 'APPROVED' && latest.revisionId === rev?.id
      ? latest
      : null;
  }
  async list(actor: Actor, page: number): Promise<C.ProcurementList> {
    return iamTransaction(this.db, actor, async (tx) => {
      const members = await tx.organizationMember.findMany({
        where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
        include: { organization: true, roles: true, permissionGrants: true },
      });
      const buyers = members.filter(
        (m) =>
          m.organization.type === 'BUYER_BUSINESS' &&
          C.permissionsForMembership(m).includes('buyer.rfq.read'),
      );
      const internal = members.filter(
        (m) =>
          m.organization.type === 'INTERNAL' &&
          (m.roles.some((r) => ['FINANCE_MANAGER'].includes(r.role)) ||
            C.permissionsForMembership(m).includes('operator.quotation.prepare')),
      );
      const legacy = internal
        .filter((m) => m.roles.some((r) => ['FINANCE_MANAGER'].includes(r.role)))
        .map((m) => m.organizationId);
      const assignments = await tx.operatorAssignment.findMany({
        where: {
          operatorId: actor.id,
          revokedAt: null,
          organization: { approvalStatus: 'APPROVED' },
        },
        select: { organizationId: true },
      });
      const rows = await tx.commercialRfq.findMany({
        where: {
          OR: [
            { buyerOrganizationId: { in: buyers.map((m) => m.organizationId) } },
            {
              operatorOrganizationId: { in: legacy },
              buyerOrganization: { approvalStatus: 'APPROVED' },
              status: { not: 'DRAFT' },
            },
            {
              operatorOrganizationId: { in: internal.map((m) => m.organizationId) },
              buyerOrganizationId: { in: assignments.map((a) => a.organizationId) },
              status: { not: 'DRAFT' },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(page),
        select: { id: true, title: true, status: true, version: true, procurementManaged: true },
      });
      return {
        requests: rows.slice(0, take),
        page,
        hasMore: rows.length > take,
        buyerOrganizations: buyers
          .filter((m) => C.permissionsForMembership(m).includes('buyer.rfq.create'))
          .map((m) => ({ id: m.organizationId, name: m.organization.name })),
        operators: buyers.length
          ? await tx.organization.findMany({
              where: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
              select: { id: true, name: true },
              take: 100,
            })
          : [],
        crafts: await tx.craftSkill.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          take: 100,
        }),
      };
    });
  }
  async discussions(actor: Actor, page: number) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          isCoordinator: true,
          organization: {
            type: { in: ['ASSOCIATION', 'PARTNER_COOPERATIVE'] },
            approvalStatus: 'APPROVED',
          },
        },
      });
      if (!member) fail(403, 'FORBIDDEN', 'An active partner coordinator affiliation is required.');
      const rows = await tx.commercialOrder.findMany({
        where: {
          rfq: {
            buyerOrganization: { approvalStatus: 'APPROVED' },
            operatorOrganization: { approvalStatus: 'APPROVED' },
          },
          offers: {
            some: {
              status: 'ACCEPTED',
              artisanProfile: {
                authorizations: {
                  some: { purpose: 'PARTICIPATION', withdrawnAt: null, policy: { active: true } },
                },
                assignments: {
                  some: {
                    coordinatorId: actor.id,
                    organizationId: member.organizationId,
                    endedAt: null,
                  },
                },
                managements: { some: { organizationId: member.organizationId, endedAt: null } },
              },
            },
          },
        },
        select: { rfq: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page),
      });
      return { items: rows.slice(0, take).map((r) => r.rfq), page, hasMore: rows.length > take };
    });
  }
  async detail(actor: Actor, id: string): Promise<C.ProcurementDetail> {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      const products = await tx.approvedProductVersion.findMany({
        where: { sourceRfqId: id },
        select: { id: true, productCode: true, version: true, status: true },
        take: 100,
        orderBy: { version: 'desc' },
      });
      const revisions = await tx.procurementRevision.findMany({
        where: { rfqId: id },
        orderBy: { version: 'desc' },
        take: 100,
      });
      const quotes = await tx.procurementQuote.findMany({
        where: { rfqId: id },
        orderBy: { version: 'desc' },
        take: 100,
      });
      const [acceptances, rejections] = await Promise.all([
        tx.procurementAcceptance.findMany({
          where: { quote: { rfqId: id } },
          select: { quoteId: true },
        }),
        tx.procurementQuoteRejection.findMany({
          where: { quote: { rfqId: id } },
          select: { quoteId: true },
        }),
      ]);
      const acceptedIds = new Set(acceptances.map((item) => item.quoteId));
      const rejectedIds = new Set(rejections.map((item) => item.quoteId));
      const latestVersion = quotes[0]?.version ?? 0;
      const feasibility = access.operator
        ? await tx.feasibilityAssessment.findMany({
            where: { rfqId: id },
            orderBy: { version: 'desc' },
            take: 20,
          })
        : [];
      const costs = await tx.costEstimate.findMany({
        where: { rfqId: id },
        orderBy: { version: 'desc' },
        take: 20,
      });
      const samples = await tx.procurementSample.findMany({
        where: { rfqId: id },
        include: { decision: true },
        orderBy: { version: 'desc' },
        take: 100,
      });
      const attachments = await tx.procurementAttachment.findMany({
        where: { rfqId: id, removedAt: null },
        select: { id: true, filename: true, mime: true, sha256: true },
        take: 5,
      });
      const questions = await tx.procurementQuestion.findMany({
        where: { rfqId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const order = await tx.commercialOrder.findUnique({
        where: { rfqId: id },
        select: { id: true },
      });
      const docs = await tx.procurementDocument.findMany({
        where: { rfqId: id },
        orderBy: { number: 'desc' },
        take: 100,
      });
      return json({
        products,
        rfq: {
          id: row.id,
          ...specificationSnapshot(row),
          status: row.status,
          version: row.version,
          procurementManaged: row.procurementManaged,
          sourceProductId: row.sourceProductId,
        },
        access,
        revisions,
        attachments,
        questions,
        samples,
        quotes: quotes.map((q) => {
          const status = C.quoteStanding({
            version: q.version,
            expiresAt: q.expiresAt,
            accepted: acceptedIds.has(q.id),
            rejected: rejectedIds.has(q.id),
            latestVersion,
          });
          return {
            id: q.id,
            version: q.version,
            revisionId: q.revisionId,
            totalTnd: C.formatTnd(q.totalMillimes),
            expiresAt: q.expiresAt,
            status,
            termsSha256: q.termsSha256,
            snapshot: buyerSnapshot(q.snapshot, access.operator),
            current:
              status === 'ISSUED' && q.revisionId === revisions[0]?.id && row.status === 'QUOTED',
          };
        }),
        feasibility: feasibility.map(viewAssessment),
        costs: access.operator ? costs.map((cost) => viewCost(cost, true)) : [],
        documents: docs.map((d) => ({
          ...d,
          content: undefined,
          number: d.number,
          superseded: docs.some((other) => other.kind === d.kind && other.version > d.version),
        })),
        orderId: order?.id ?? null,
        currentSampleApproved: Boolean(await this.approvedSample(tx, row)),
      }) as unknown as C.ProcurementDetail;
    });
  }
  async history(actor: Actor, id: string, page: number, kind: 'activity' | 'revisions') {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.scoped(tx, actor, id);
      const items =
        kind === 'activity'
          ? await tx.procurementActivity.findMany({
              where: { rfqId: id },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              ...pageArgs(page),
              select: { id: true, actorLabel: true, code: true, version: true, createdAt: true },
            })
          : await tx.procurementRevision.findMany({
              where: { rfqId: id },
              orderBy: { version: 'desc' },
              ...pageArgs(page),
            });
      return { items: items.slice(0, take), page, hasMore: items.length > take };
    });
  }
  async revise(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementReviseSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.purchasing || !access.negotiating)
        fail(403, 'FORBIDDEN', 'Purchasing and negotiation authority are required.');
      return this.command(tx, actor, id, 'revise', key, json(input), async () => {
        same(row.version, input.version);
        if (
          ['ACCEPTED', 'DECLINED'].includes(row.status) ||
          (await tx.commercialOrder.findUnique({ where: { rfqId: id } }))
        )
          fail(
            409,
            'AMENDMENT_REQUIRED',
            'Accepted obligations require an approved contract amendment. Create a separate request; this contract remains unchanged.',
          );
        if (new Date(input.deliveryAt) <= new Date())
          fail(400, 'INVALID_DEADLINE', 'Choose a future delivery deadline.');
        if (!(await tx.craftSkill.findFirst({ where: { id: input.craftSkillId, isActive: true } })))
          fail(400, 'INVALID_CRAFT', 'Choose an active craft.');
        await this.currentRevision(tx, actor, row);
        const { reason, version: _v, ...fields } = input;
        const updated = await tx.commercialRfq.update({
          where: { id },
          data: {
            ...fields,
            deliveryAt: new Date(input.deliveryAt),
            version: { increment: 1 },
            status: row.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED',
            quoteMillimes: null,
            quoteExpiresAt: null,
          },
        });
        await revision(tx, actor, updated, reason);
        await procurementAudit(tx, actor, updated, 'revision.created');
        return { id, version: updated.version };
      });
    });
  }
  async close(
    actor: Actor,
    id: string,
    input: { version: number; next: 'DECLINED' | 'EXPIRED' },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (input.next === 'DECLINED' ? !access.negotiating : !access.operator)
        fail(403, 'FORBIDDEN', 'You cannot perform this request action.');
      return this.command(tx, actor, id, 'close', key, input, async () => {
        same(row.version, input.version);
        if (
          row.status !== 'QUOTED' ||
          (input.next === 'EXPIRED' && !(row.quoteExpiresAt && row.quoteExpiresAt <= new Date()))
        )
          fail(
            409,
            'INVALID_TRANSITION',
            'Only a quoted request can be declined, or marked expired after its deadline.',
          );
        const r = await tx.commercialRfq.update({
          where: { id },
          data: { status: input.next, version: { increment: 1 } },
        });
        await procurementAudit(tx, actor, r, `rfq.${input.next.toLowerCase()}`);
        return { id, version: r.version };
      });
    });
  }
  async review(actor: Actor, id: string, input: { version: number }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned internal operator is required.');
      return this.command(tx, actor, id, 'review', key, input, async () => {
        same(row.version, input.version);
        if (row.status !== 'SUBMITTED')
          fail(409, 'INVALID_TRANSITION', 'Only submitted requests enter review.');
        const r = await tx.commercialRfq.update({
          where: { id },
          data: { status: 'UNDER_REVIEW', version: { increment: 1 } },
        });
        await procurementAudit(tx, actor, r, 'rfq.under_review');
        return { id, version: r.version };
      });
    });
  }
  async attach(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementAttachmentSchema>,
    key?: string,
  ) {
    // Decode before opening a database transaction; bounded inputs and pixel limits bound work.
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 262144 || bytes.toString('base64') !== input.base64)
      fail(400, 'INVALID_IMAGE', 'Use a canonical image under 256 KiB.');
    let clean: Buffer;
    try {
      const image = sharp(bytes, {
        limitInputPixels: 16000000,
        failOn: 'warning',
        animated: false,
      });
      const metadata = await image.metadata();
      const type = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[
        metadata.format as 'png' | 'jpeg' | 'webp'
      ];
      if (type !== input.mime || (metadata.pages ?? 1) > 1) throw Error('Invalid image.');
      clean = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      if (clean.length > 262144) throw Error('Output too large.');
    } catch {
      fail(
        400,
        'INVALID_IMAGE',
        'Use a valid PNG, JPEG or WebP image under 256 KiB and 16 megapixels.',
      );
    }
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.purchasing) fail(403, 'FORBIDDEN', 'Purchasing authority is required.');
      return this.command(
        tx,
        actor,
        id,
        'attachment.add',
        key,
        json({ ...input, base64: createHash('sha256').update(bytes).digest('hex') }),
        async () => {
          same(row.version, input.version);
          if (row.status !== 'DRAFT')
            fail(409, 'INVALID_TRANSITION', 'Attachments can only be changed in a draft.');
          if (
            (await tx.procurementAttachment.count({ where: { rfqId: id, removedAt: null } })) >= 5
          )
            fail(409, 'ATTACHMENT_LIMIT', 'At most five images are allowed.');
          await this.currentRevision(tx, actor, row);
          const file = await tx.procurementAttachment.create({
            data: {
              rfqId: id,
              authorId: actor.id,
              filename: `${input.filename.replace(/\.[^.]+$/, '')}.webp`,
              mime: 'image/webp',
              bytes: new Uint8Array(clean),
              sha256: createHash('sha256').update(clean).digest('hex'),
            },
          });
          const updated = await tx.commercialRfq.update({
            where: { id },
            data: { version: { increment: 1 } },
          });
          await revision(tx, actor, updated, 'Reference image added.');
          await procurementAudit(tx, actor, updated, 'attachment.added', file.id);
          return { id: file.id, version: updated.version };
        },
      );
    });
  }
  async removeAttachment(
    actor: Actor,
    id: string,
    fileId: string,
    input: { version: number },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.purchasing) fail(403, 'FORBIDDEN', 'Purchasing authority is required.');
      return this.command(
        tx,
        actor,
        id,
        'attachment.remove',
        key,
        json({ ...input, fileId }),
        async () => {
          same(row.version, input.version);
          if (row.status !== 'DRAFT')
            fail(409, 'INVALID_TRANSITION', 'Submitted images are immutable.');
          const file = await tx.procurementAttachment.findFirst({
            where: { id: fileId, rfqId: id, removedAt: null },
          });
          if (!file) fail(404, 'NOT_FOUND', 'Image not found.');
          await this.currentRevision(tx, actor, row);
          await tx.procurementAttachment.update({
            where: { id: fileId },
            data: { removedAt: new Date() },
          });
          const r = await tx.commercialRfq.update({
            where: { id },
            data: { version: { increment: 1 } },
          });
          await revision(tx, actor, r, 'Reference image removed.');
          await procurementAudit(tx, actor, r, 'attachment.removed', fileId);
          return { id, version: r.version };
        },
      );
    });
  }
  private signature(value: string) {
    return createHmac('sha256', this.config.BETTER_AUTH_SECRET)
      .update(`procurement-download:${value}`)
      .digest('base64url');
  }
  async attachmentToken(actor: Actor, id: string, fileId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.scoped(tx, actor, id);
      if (
        !(await tx.procurementAttachment.findFirst({
          where: { id: fileId, rfqId: id, removedAt: null },
        }))
      )
        fail(404, 'NOT_FOUND', 'Image not found.');
      const expires = Date.now() + 60000;
      const value = Buffer.from(
        JSON.stringify({
          fileId,
          rfqId: id,
          actorId: actor.id,
          sessionId: actor.sessionId,
          expires,
        }),
      ).toString('base64url');
      return {
        token: `${value}.${this.signature(value)}`,
        expiresAt: new Date(expires).toISOString(),
      };
    });
  }
  async attachment(actor: Actor, id: string, fileId: string, token: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.scoped(tx, actor, id);
      try {
        const [value, signature, ...extra] = token.split('.');
        const expected = this.signature(value);
        if (
          extra.length ||
          !signature ||
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          throw Error('Invalid token.');
        const claims = JSON.parse(Buffer.from(value, 'base64url').toString());
        if (
          claims.actorId !== actor.id ||
          claims.sessionId !== actor.sessionId ||
          claims.rfqId !== id ||
          claims.fileId !== fileId ||
          !(claims.expires > Date.now())
        )
          throw Error('Expired token.');
      } catch {
        fail(403, 'DOWNLOAD_EXPIRED', 'Request a fresh image download.');
      }
      const file = await tx.procurementAttachment.findFirst({
        where: { id: fileId, rfqId: id, removedAt: null },
      });
      if (!file) fail(404, 'NOT_FOUND', 'Image not found.');
      return {
        filename: file.filename,
        mime: file.mime,
        base64: Buffer.from(file.bytes).toString('base64'),
      };
    });
  }
  async question(actor: Actor, id: string, input: { question: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator || ['ACCEPTED', 'DECLINED'].includes(row.status))
        fail(403, 'FORBIDDEN', 'An assigned operator may ask before acceptance.');
      return this.command(tx, actor, id, 'question', key, input, async () => {
        const q = await tx.procurementQuestion.create({
          data: { rfqId: id, authorId: actor.id, question: input.question },
        });
        await procurementAudit(tx, actor, row, 'clarification.asked', q.id);
        return { id: q.id };
      });
    });
  }
  async answer(
    actor: Actor,
    id: string,
    questionId: string,
    input: { answer: string },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.negotiating || ['ACCEPTED', 'DECLINED'].includes(row.status))
        fail(403, 'FORBIDDEN', 'Buyer negotiation authority is required before acceptance.');
      return this.command(tx, actor, id, 'answer', key, { ...input, questionId }, async () => {
        const q = await tx.procurementQuestion.findFirst({ where: { id: questionId, rfqId: id } });
        if (!q) fail(404, 'NOT_FOUND', 'Question not found.');
        if (q.answeredAt)
          fail(
            409,
            'ANSWER_IMMUTABLE',
            'This answer is already recorded. Submit a revision for changed terms.',
          );
        await this.currentRevision(tx, actor, row);
        await tx.procurementQuestion.update({
          where: { id: questionId },
          data: { answer: input.answer, answeredById: actor.id, answeredAt: new Date() },
        });
        const updated = await tx.commercialRfq.update({
          where: { id },
          data: {
            version: { increment: 1 },
            ...(row.status === 'QUOTED'
              ? { status: 'SUBMITTED', quoteMillimes: null, quoteExpiresAt: null }
              : {}),
          },
        });
        await revision(tx, actor, updated, `Buyer answered feasibility question ${q.id}.`);
        await procurementAudit(tx, actor, updated, 'clarification.answered', q.id);
        return { id: q.id };
      });
    });
  }
  async thread(actor: Actor, id: string, page: number): Promise<C.ProcurementThread> {
    return iamTransaction(this.db, actor, async (tx) => {
      const { access } = await this.scoped(tx, actor, id, true);
      const items = await tx.procurementMessage.findMany({
        where: { rfqId: id, ...(!access.operator ? { internal: false } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(page),
        select: { id: true, body: true, authorLabel: true, createdAt: true, internal: true },
      });
      return json({
        items: items.slice(0, take),
        page,
        hasMore: items.length > take,
        canPost: access.operator || access.negotiating || access.coordinator,
        canPostInternal: access.operator,
      }) as unknown as C.ProcurementThread;
    });
  }
  async postMessage(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementMessageSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id, true);
      if (
        !(access.operator || access.negotiating || access.coordinator) ||
        (input.internal && !access.operator)
      )
        fail(403, 'FORBIDDEN', 'You cannot post to this conversation.');
      return this.command(tx, actor, id, 'message', key, input, async () => {
        const message = await tx.procurementMessage.create({
          data: {
            rfqId: id,
            authorId: actor.id,
            authorLabel: access.operator
              ? 'NASJ operator'
              : access.coordinator
                ? 'Assigned coordinator'
                : 'Buyer representative',
            body: input.body,
            internal: input.internal,
          },
        });
        if (!input.internal)
          await procurementAudit(tx, actor, row, 'discussion.posted', message.id);
        else
          await import('../foundation/audit.js').then(({ audit }) =>
            audit(tx, actor, {
              action: 'procurement.internal_note',
              targetType: 'ProcurementMessage',
              targetId: message.id,
              organizationId: row.operatorOrganizationId,
            }),
          );
        return { id: message.id };
      });
    });
  }
  async sample(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementSampleSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator)
        fail(403, 'FORBIDDEN', 'An assigned operator publishes sample evidence.');
      return this.command(tx, actor, id, 'sample.publish', key, json(input), async () => {
        same(row.version, input.version);
        const order = await tx.commercialOrder.findUnique({ where: { rfqId: id } });
        if (order && !['APPROVED', 'FUNDING_PENDING', 'FUNDING_CONFIRMED'].includes(order.status))
          fail(
            409,
            'AMENDMENT_REQUIRED',
            'Production has progressed; use an approved amendment before changing sample criteria.',
          );
        const rev = await this.currentRevision(tx, actor, row);
        const previous = await tx.procurementSample.findFirst({
          where: { rfqId: id },
          orderBy: { version: 'desc' },
        });
        const s = await tx.procurementSample.create({
          data: {
            rfqId: id,
            version: (previous?.version ?? 0) + 1,
            revisionId: rev.id,
            authorId: actor.id,
            evidenceReference: input.evidenceReference,
            criteria: input.criteria,
            snapshot: rev.snapshot as Prisma.InputJsonObject,
          },
        });
        const r = await tx.commercialRfq.update({
          where: { id },
          data: { procurementManaged: true, version: { increment: 1 } },
        });
        await procurementAudit(tx, actor, r, 'sample.published', s.id);
        return { id: s.id, version: r.version };
      });
    });
  }
  async decideSample(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementDecisionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.approving)
        fail(403, 'FORBIDDEN', 'Explicit buyer approval authority is required.');
      return this.command(tx, actor, id, 'sample.decide', key, json(input), async () => {
        same(row.version, input.version);
        const latest = await tx.procurementSample.findFirst({
          where: { rfqId: id },
          orderBy: { version: 'desc' },
        });
        const rev = await this.currentRevision(tx, actor, row);
        if (latest?.id !== input.sampleId || latest.revisionId !== rev.id)
          fail(409, 'STALE_SAMPLE', 'Review the latest sample and specification.');
        if (await tx.procurementSampleDecision.findUnique({ where: { sampleId: input.sampleId } }))
          fail(
            409,
            'DECISION_IMMUTABLE',
            'This decision is recorded; publish a new sample version for a new decision.',
          );
        const d = await tx.procurementSampleDecision.create({
          data: {
            sampleId: input.sampleId,
            actorId: actor.id,
            decision: input.decision,
            comments: input.comments,
          },
        });
        const r = await tx.commercialRfq.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await procurementAudit(tx, actor, r, `sample.${input.decision.toLowerCase()}`, d.id);
        return { id: d.id, version: r.version };
      });
    });
  }
  private async document(
    tx: Db,
    actor: Actor,
    row: CommercialRfq,
    kind: string,
    content: Prisma.InputJsonObject,
    orderId?: string,
  ) {
    const previous = await tx.procurementDocument.findFirst({
      where: { rfqId: row.id, kind },
      orderBy: { version: 'desc' },
    });
    return tx.procurementDocument.create({
      data: {
        rfqId: row.id,
        authorId: actor.id,
        kind,
        version: (previous?.version ?? 0) + 1,
        orderId,
        content: {
          ...content,
          provenance: 'SYNTHETIC',
          legalStatus: 'DEMO_ONLY_NOT_A_TAX_OR_LEGAL_DOCUMENT',
        },
      },
    });
  }
  async quote(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementQuoteSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned quotation operator is required.');
      return this.command(tx, actor, id, 'quote', key, json(input), async () => {
        same(row.version, input.version);
        if (!['UNDER_REVIEW', 'QUOTED'].includes(row.status))
          fail(409, 'INVALID_TRANSITION', 'Start review before issuing a quote.');
        if (await tx.procurementQuestion.count({ where: { rfqId: id, answeredAt: null } }))
          fail(409, 'UNANSWERED_QUESTIONS', 'Resolve the feasibility questions first.');
        if (
          (await tx.feasibilityAssessment.count({ where: { rfqId: id } })) > 0 ||
          (await tx.costEstimate.count({ where: { rfqId: id } })) > 0
        )
          fail(
            409,
            'COSTED_QUOTATION_REQUIRED',
            'Issue the versioned costed quotation. A free-typed quote cannot replace it.',
          );
        if (row.sourceProductId) {
          const product = await tx.approvedProductVersion.findUnique({
            where: { id: row.sourceProductId },
          });
          if (
            product?.status !== 'ACTIVE' ||
            (await tx.approvedProductVersion.findFirst({
              where: {
                sourceRfqId: product.sourceRfqId,
                productCode: product.productCode,
                version: { gt: product.version },
              },
            }))
          )
            fail(
              409,
              'PRODUCT_REVIEW_REQUIRED',
              'The source product is superseded or discontinued. Review a new specification before quoting.',
            );
        }
        const expires = new Date(input.expiresAt),
          total = C.parseTnd(input.totalTnd);
        if (
          total <= 0n ||
          expires <= new Date() ||
          expires >= row.deliveryAt ||
          row.deliveryAt <= new Date()
        )
          fail(
            400,
            'INVALID_QUOTE',
            'Use a positive price and future expiry before the delivery deadline.',
          );
        if (!(await tx.craftSkill.findFirst({ where: { id: row.craftSkillId, isActive: true } })))
          fail(409, 'INVALID_CRAFT', 'The selected craft is no longer active.');
        const rev = await this.currentRevision(tx, actor, row),
          previous = await tx.procurementQuote.findFirst({
            where: { rfqId: id },
            orderBy: { version: 'desc' },
          });
        const buyer = await tx.organization.findUniqueOrThrow({
          where: { id: row.buyerOrganizationId },
          select: { id: true, name: true },
        });
        const tax = (total * BigInt(input.taxBasisPoints)) / BigInt(10000 + input.taxBasisPoints);
        const snapshot = {
          ...specificationSnapshot(row),
          ...json(rev.snapshot),
          buyer,
          ...input,
          version: undefined,
          totalTnd: C.formatTnd(total),
          taxTnd: C.formatTnd(tax),
          netTnd: C.formatTnd(total - tax),
          currency: 'TND',
          revisionId: rev.id,
        };
        const q = await tx.procurementQuote.create({
          data: {
            rfqId: id,
            revisionId: rev.id,
            authorId: actor.id,
            version: (previous?.version ?? 0) + 1,
            totalMillimes: total,
            expiresAt: expires,
            snapshot: json(snapshot),
            status: 'ISSUED',
          },
        });
        const r = await tx.commercialRfq.update({
          where: { id },
          data: {
            status: 'QUOTED',
            procurementManaged: true,
            quoteMillimes: total,
            quoteExpiresAt: expires,
            version: { increment: 1 },
          },
        });
        await this.document(tx, actor, r, 'QUOTE', {
          quoteId: q.id,
          quoteVersion: q.version,
          ...json(snapshot),
        });
        await procurementAudit(tx, actor, r, 'quote.issued', q.id);
        return { id: q.id, version: r.version };
      });
    });
  }
  async accept(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementAcceptSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.approving)
        fail(403, 'FORBIDDEN', 'Explicit buyer quotation approval authority is required.');
      return this.command(tx, actor, id, 'quote.accept', key, json(input), async () => {
        same(row.version, input.version);
        if (await tx.procurementQuestion.count({ where: { rfqId: id, answeredAt: null } }))
          fail(409, 'UNANSWERED_QUESTIONS', 'Resolve the feasibility questions before accepting.');
        const quote = await tx.procurementQuote.findFirst({
            where: { rfqId: id },
            orderBy: { version: 'desc' },
          }),
          rev = await this.currentRevision(tx, actor, row);
        const rejected = quote
          ? await tx.procurementQuoteRejection.findUnique({ where: { quoteId: quote.id } })
          : null;
        if (
          row.status !== 'QUOTED' ||
          !quote ||
          quote.id !== input.quoteId ||
          rejected ||
          quote.revisionId !== rev.id ||
          quote.expiresAt <= new Date() ||
          row.deliveryAt <= new Date() ||
          (quote.termsSha256 !== null && quote.termsSha256 !== input.termsSha256)
        )
          fail(
            409,
            'STALE_QUOTE',
            'Only the current unexpired quote for this specification can be accepted.',
          );
        if (
          quote.termsSha256 === null &&
          ((await tx.feasibilityAssessment.count({ where: { rfqId: id } })) > 0 ||
            (await tx.costEstimate.count({ where: { rfqId: id } })) > 0)
        )
          fail(
            409,
            'COSTED_QUOTATION_REQUIRED',
            'Accept the versioned costed quotation. A free-typed quote cannot authorize production.',
          );
        const salesConversion = await tx.pilotProposalRevision.findFirst({
          where: {
            prospect: {
              operatorOrganizationId: row.operatorOrganizationId,
              buyerOrganizationId: row.buyerOrganizationId,
            },
            OR: [{ rfqId: id }, { snapshot: { path: ['rfqId'], equals: id } }],
          },
        });
        const review = await latestFinanceReview(tx, id);
        // Explicit authorized sales linkage (any stage, including historical JSON links), or an explicit finance review, opts this RFQ into the gate. Unrelated historical procurement remains unchanged.
        if (salesConversion || review) {
          const data = review?.data as Record<string, unknown> | null;
          if (
            review?.status !== 'APPROVE_ADVISORY' ||
            data?.quoteId !== quote.id ||
            data?.termsSha256 !== quote.termsSha256 ||
            data?.costEstimateId !== quote.costEstimateId ||
            data?.fundingStatus !== 'DOCUMENTED_PLAN' ||
            data?.fundingSha256 !==
              evidenceHash({
                fundingStatus: data?.fundingStatus,
                fundingEvidence: data?.fundingEvidence,
              }) ||
            data?.quoteSnapshotSha256 !== (await quoteReviewSnapshot(tx, row, quote))
          )
            fail(
              409,
              'FINANCE_REVIEW_REQUIRED',
              'Sales-linked contracts require scoped finance review of this exact costed quote and funding plan.',
            );
        }
        const order = await tx.commercialOrder.create({ data: { rfqId: id } });
        const acceptance = await tx.procurementAcceptance.create({
          data: {
            quoteId: quote.id,
            orderId: order.id,
            actorId: actor.id,
            snapshot: json({
              quoteId: quote.id,
              quoteVersion: quote.version,
              termsSha256: quote.termsSha256,
              terms: quote.snapshot,
              capacityReserved: false,
              artisanAccepted: false,
              paymentReceived: false,
              legalSignature: false,
            }),
          },
        });
        if (salesConversion) {
          const prospect = await tx.commercialProspect.findUniqueOrThrow({
            where: { id: salesConversion.prospectId },
          });
          const next = {
            ...(prospect.snapshot as Record<string, unknown>),
            status: 'CONTRACTED',
            acceptedOrderId: order.id,
            acceptanceId: acceptance.id,
            stageProvenance:
              row.provenance === 'SYNTHETIC'
                ? 'SYNTHETIC_APPLICATION_ACCEPTANCE'
                : 'APPLICATION_ACCEPTANCE_LEGAL_STATUS_UNVERIFIED',
            reason:
              'Existing buyer-authorized exact quote acceptance; no legal signature or payment verification inferred',
          };
          await tx.prospectRevision.create({
            data: {
              prospectId: prospect.id,
              version: prospect.version + 1,
              snapshot: json(next),
              actorId: actor.id,
            },
          });
          await tx.commercialProspect.update({
            where: { id: prospect.id },
            data: { version: prospect.version + 1, snapshot: json(next) },
          });
        }
        const r = await tx.commercialRfq.update({
          where: { id },
          data: { status: 'ACCEPTED', version: { increment: 1 } },
        });
        await this.document(
          tx,
          actor,
          r,
          'CONTRACT',
          { acceptanceId: acceptance.id, ...json(acceptance.snapshot) },
          order.id,
        );
        await procurementAudit(tx, actor, r, 'quote.accepted', acceptance.id);
        return { id: order.id, version: r.version };
      });
    });
  }
  async issueDocument(
    actor: Actor,
    id: string,
    input: { kind: 'INVOICE' | 'DELIVERY' },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned operator is required.');
      return this.command(tx, actor, id, 'document.issue', key, input, async () => {
        const order = await tx.commercialOrder.findUnique({
          where: { rfqId: id },
          include: { acceptance: { include: { quote: true } } },
        });
        if (!order?.acceptance)
          fail(409, 'ACCEPTANCE_REQUIRED', 'An immutable accepted quote is required.');
        if (await tx.procurementDocument.findFirst({ where: { rfqId: id, kind: input.kind } }))
          fail(
            409,
            'DOCUMENT_IMMUTABLE',
            'This document is already issued. Corrections require the finance/logistics correction workflow.',
          );
        if (input.kind === 'DELIVERY' && !['DELIVERED', 'SETTLED', 'CLOSED'].includes(order.status))
          fail(409, 'DELIVERY_REQUIRED', 'A persisted delivery record is required.');
        // A buyer-facing invoice embeds only the buyer-facing terms. The full accepted snapshot,
        // including cost lines and the margin basis, stays on the immutable quote record where
        // internal roles already read it; copying it into the invoice is what leaked it.
        const snapshot = order.acceptance.quote.snapshot;
        const terms =
          snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            ? projectBuyerSnapshot(snapshot as Record<string, unknown>)
            : {};
        const doc = await this.document(
          tx,
          actor,
          row,
          input.kind,
          json({
            acceptanceId: order.acceptance.id,
            rfqId: row.id,
            terms,
            ...terms,
            ...(input.kind === 'DELIVERY'
              ? { delivered: order.delivered, orderStatus: order.status }
              : {}),
          }) as Prisma.InputJsonObject,
          order.id,
        );
        await procurementAudit(tx, actor, row, 'document.issued', doc.id);
        return { id: doc.id, number: doc.number };
      });
    });
  }
  async documents(actor: Actor, page: number) {
    return iamTransaction(this.db, actor, async (tx) => {
      const memberships = await tx.organizationMember.findMany({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          organization: { type: 'BUYER_BUSINESS', approvalStatus: 'APPROVED' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      const ids = memberships
        .filter((m) => C.permissionsForMembership(m).includes('buyer.invoice.read'))
        .map((m) => m.organizationId);
      const rows = await tx.procurementDocument.findMany({
        where: { rfq: { buyerOrganizationId: { in: ids } } },
        orderBy: { number: 'desc' },
        ...pageArgs(page),
        select: {
          id: true,
          number: true,
          rfqId: true,
          kind: true,
          version: true,
          status: true,
          createdAt: true,
        },
      });
      const items = await Promise.all(
        rows.slice(0, take).map(async (row) => ({
          ...row,
          superseded: Boolean(
            await tx.procurementDocument.findFirst({
              where: { rfqId: row.rfqId, kind: row.kind, version: { gt: row.version } },
              select: { id: true },
            }),
          ),
        })),
      );
      return { items, page, hasMore: rows.length > take };
    });
  }
  async downloadDocument(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const doc = await tx.procurementDocument.findUnique({ where: { id } });
      if (!doc) fail(404, 'NOT_FOUND', 'Document not found.');
      const { access } = await this.scoped(tx, actor, doc.rfqId);
      // The stored content embeds the accepted quote snapshot, which carries cost lines and the
      // margin basis. Anyone without internal operator access receives only the allowlisted
      // buyer-facing projection; internal staff keep the full immutable record.
      const header = {
        number: doc.number,
        kind: doc.kind,
        version: doc.version,
        status: doc.status,
        createdAt: doc.createdAt,
      };
      return {
        filename: `synthetic-${doc.kind.toLowerCase()}-${doc.number}-v${doc.version}.json`,
        document: access.operator
          ? json(doc)
          : (json({
              id: doc.id,
              rfqId: doc.rfqId,
              orderId: doc.orderId,
              ...projectBuyerDocument(doc.content, header),
            }) as Prisma.InputJsonObject),
      };
    });
  }
  async publishProduct(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementProductSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator)
        fail(403, 'FORBIDDEN', 'An assigned operator publishes approved product versions.');
      return this.command(tx, actor, id, 'product.publish', key, json(input), async () => {
        same(row.version, input.version);
        const sample = await this.approvedSample(tx, row),
          order = await tx.commercialOrder.findUnique({
            where: { rfqId: id },
            include: { acceptance: true },
          });
        if (!sample || !order?.acceptance)
          fail(
            409,
            'APPROVAL_REQUIRED',
            'Current sample approval and accepted exact quote are required.',
          );
        const previous = await tx.approvedProductVersion.findFirst({
          where: { sourceRfqId: id, productCode: input.productCode },
          orderBy: { version: 'desc' },
        });
        if (previous)
          await tx.approvedProductVersion.updateMany({
            where: { sourceRfqId: id, productCode: input.productCode, status: 'ACTIVE' },
            data: { status: 'SUPERSEDED' },
          });
        const product = await tx.approvedProductVersion.create({
          data: {
            sourceRfqId: id,
            sourceOrderId: order.id,
            sampleId: sample.id,
            authorId: actor.id,
            productCode: input.productCode,
            version: (previous?.version ?? 0) + 1,
            materials: input.materials,
            leadTimeDays: input.leadTimeDays,
            leadTimeSampleCount: input.leadTimeSampleCount,
            leadTimeContext: input.leadTimeContext,
            snapshot: sample.snapshot as Prisma.InputJsonObject,
          },
        });
        await procurementAudit(tx, actor, row, 'product.published', product.id);
        return { id: product.id };
      });
    });
  }
  async products(actor: Actor, page: number): Promise<C.ProcurementProducts> {
    return iamTransaction(this.db, actor, async (tx) => {
      const memberships = await tx.organizationMember.findMany({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          organization: { type: 'BUYER_BUSINESS', approvalStatus: 'APPROVED' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      const ids = memberships
        .filter((m) => C.permissionsForMembership(m).includes('buyer.rfq.read'))
        .map((m) => m.organizationId);
      const rows = await tx.approvedProductVersion.findMany({
        where: { sourceRfq: { buyerOrganizationId: { in: ids } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(page),
        select: {
          id: true,
          productCode: true,
          version: true,
          status: true,
          materials: true,
          leadTimeDays: true,
          leadTimeSampleCount: true,
          leadTimeContext: true,
          snapshot: true,
        },
      });
      return json({
        items: rows.slice(0, take),
        page,
        hasMore: rows.length > take,
      }) as unknown as C.ProcurementProducts;
    });
  }
  async productStatus(
    actor: Actor,
    id: string,
    input: { status: 'SUPERSEDED' | 'DISCONTINUED'; reason: string },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const product = await tx.approvedProductVersion.findUnique({ where: { id } });
      if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
      const { row, access } = await this.scoped(tx, actor, product.sourceRfqId);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned operator is required.');
      return this.command(tx, actor, id, 'product.status', key, input, async () => {
        await tx.approvedProductVersion.update({ where: { id }, data: { status: input.status } });
        await procurementAudit(
          tx,
          actor,
          row,
          `product.${input.status.toLowerCase()}`,
          id,
          input.reason,
        );
        return { id };
      });
    });
  }
  async reorder(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.procurementReorderSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const product = await tx.approvedProductVersion.findUnique({ where: { id } });
      if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
      const { row, access } = await this.scoped(tx, actor, product.sourceRfqId);
      if (!access.purchasing) fail(403, 'FORBIDDEN', 'Purchasing authority is required.');
      return this.command(tx, actor, id, 'reorder', key, json(input), async () => {
        if (
          product.status !== 'ACTIVE' ||
          (await tx.approvedProductVersion.findFirst({
            where: {
              sourceRfqId: product.sourceRfqId,
              productCode: product.productCode,
              version: { gt: product.version },
            },
          }))
        )
          fail(
            409,
            'PRODUCT_REVIEW_REQUIRED',
            'This specification is discontinued or superseded; request a reviewed replacement.',
          );
        if (new Date(input.deliveryAt) <= new Date())
          fail(400, 'INVALID_DEADLINE', 'Confirm a future delivery deadline.');
        const snapshot = product.snapshot as Record<string, unknown>;
        const r = await tx.commercialRfq.create({
          data: {
            buyerOrganizationId: row.buyerOrganizationId,
            operatorOrganizationId: row.operatorOrganizationId,
            title: String(snapshot.title),
            specification: String(snapshot.specification),
            designRequirements: String(snapshot.designRequirements),
            craftSkillId: String(snapshot.craftSkillId),
            quantity: input.quantity,
            deliveryAt: new Date(input.deliveryAt),
            deliveryLocation: input.deliveryLocation,
            procurementManaged: true,
            sourceProductId: id,
          },
        });
        await revision(
          tx,
          actor,
          r,
          'Reordered approved product ' +
            product.productCode +
            ' v' +
            product.version +
            '; fresh feasibility and approval required.',
        );
        await procurementAudit(tx, actor, r, 'reorder.created');
        return { id: r.id, version: r.version };
      });
    });
  }
  async assess(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.feasibilityRequestSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned operator is required.');
      return this.command(tx, actor, id, 'feasibility.assess', key, json(input), async () => {
        same(row.version, input.version);
        return recordFeasibility(tx, this.directory, actor, row, input);
      });
    });
  }
  async assumeEffort(actor: Actor, input: z.infer<typeof C.effortAssumptionSchema>, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          status: 'ACTIVE',
          organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (
        !member ||
        !C.permissionsForMembership(member).some(
          (permission) => permission === 'operator.quotation.prepare',
        )
      )
        fail(403, 'FORBIDDEN', 'An internal commercial role is required to record effort.');
      return this.command(tx, actor, input.craftSkillId, 'effort.record', key, json(input), () =>
        recordEffort(tx, actor, input),
      );
    });
  }
  async estimate(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.costEstimateSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned operator is required.');
      return this.command(tx, actor, id, 'cost.record', key, json(input), async () => {
        same(row.version, input.version);
        return recordCost(tx, actor, row, input);
      });
    });
  }
  async issueFromCost(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.costedQuoteSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned quotation operator is required.');
      return this.command(tx, actor, id, 'quote.costed', key, json(input), async () => {
        same(row.version, input.version);
        return issueCostedQuote(tx, this.directory, actor, row, input);
      });
    });
  }
  async rejectQuote(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.quoteRejectSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { row, access } = await this.scoped(tx, actor, id);
      if (!access.approving)
        fail(403, 'FORBIDDEN', 'Explicit buyer quotation approval authority is required.');
      return this.command(tx, actor, id, 'quote.reject', key, json(input), async () => {
        same(row.version, input.version);
        const quote = await tx.procurementQuote.findFirst({
          where: { id: input.quoteId, rfqId: id },
        });
        const latest = await tx.procurementQuote.findFirst({
          where: { rfqId: id },
          orderBy: { version: 'desc' },
        });
        const accepted = quote
          ? await tx.procurementAcceptance.findUnique({ where: { quoteId: quote.id } })
          : null;
        const rejected = quote
          ? await tx.procurementQuoteRejection.findUnique({ where: { quoteId: quote.id } })
          : null;
        if (
          row.status !== 'QUOTED' ||
          !quote ||
          quote.id !== latest?.id ||
          accepted ||
          rejected ||
          quote.expiresAt <= new Date()
        )
          fail(409, 'STALE_QUOTE', 'Only the current issued quotation can be rejected.');
        await tx.procurementQuoteRejection.create({
          data: { quoteId: quote.id, actorId: actor.id, reason: input.reason },
        });
        await procurementAudit(tx, actor, row, 'quote.rejected', quote.id, input.reason);
        return { id: quote.id, version: row.version };
      });
    });
  }
}
function buyerSnapshot(snapshot: Prisma.JsonValue, operator: boolean) {
  if (operator || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    return snapshot;
  const record = snapshot as Record<string, unknown>;
  // Strip every confidential container, not only the conventional `internal` one. `costEstimate`
  // and `feasibility` carry cost lines, margin basis and effort figures and are equally private.
  const rest = projectBuyerSnapshot(record);
  return rest;
}
