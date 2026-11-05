import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { z } from 'zod';
import { fail } from '../../common/errors.js';
import type { Actor } from '../../common/identity.js';
import { PrismaService } from '../../database/prisma.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { audit } from '../foundation/audit.js';
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
@Injectable()
export class SalesService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async scope(tx: Db, actor: Actor, orgId?: string) {
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    const ids = members
      .filter((m) => C.permissionsForMembership(m).includes('buyer.relationship.manage'))
      .map((m) => m.organizationId);
    if (!ids.length) fail(404, 'NOT_FOUND', 'Sales workspace unavailable.');
    return ids;
  }
  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    resourceId: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    fn: () => Promise<T>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId, operation: `sales.${operation}`, key },
      json(input),
      fn,
    );
  }
  /**
   * Contracted status is an evidentiary claim, not a stage label. Two records can support it: an
   * accepted procurement order for this buyer organization (the same path issue #205 already trusts
   * for a won pilot proposal), or a signed-contract reference the sales owner recorded on the
   * prospect snapshot. Absent both, the transition is refused. No signature or legal status is
   * inferred, and the recorded provenance says so.
   */
  private async contractedEvidence(
    tx: Db,
    prospect: {
      id: string;
      buyerOrganizationId: string;
      operatorOrganizationId: string;
      snapshot: unknown;
    },
  ): Promise<{ ok: true; kind: string; reference: string } | { ok: false }> {
    const accepted = await tx.commercialRfq.findFirst({
      where: {
        buyerOrganizationId: prospect.buyerOrganizationId,
        operatorOrganizationId: prospect.operatorOrganizationId,
        status: 'ACCEPTED',
        order: { isNot: null },
      },
      select: { id: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (accepted) return { ok: true, kind: 'SYNTHETIC_ACCEPTANCE', reference: accepted.id };
    const snapshot = prospect.snapshot as Record<string, unknown> | null;
    const reference = snapshot?.signedContractReference;
    if (typeof reference === 'string' && reference.trim().length >= 6)
      return { ok: true, kind: 'SIGNED_CONTRACT_REFERENCE', reference: reference.trim() };
    return { ok: false };
  }
  private async owner(tx: Db, orgId: string, userId: string) {
    const m = await tx.organizationMember.findFirst({
      where: { organizationId: orgId, userId, status: 'ACTIVE' },
      include: { roles: true, organization: true, permissionGrants: true },
    });
    if (!m || !C.permissionsForMembership(m).includes('buyer.relationship.manage'))
      fail(422, 'OWNER_UNAVAILABLE', 'Choose an active sales owner in this organization.');
  }
  async workspace(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const ids = await this.scope(tx, actor);
      const prospects = await tx.commercialProspect.findMany({
        where: { operatorOrganizationId: { in: ids } },
        include: {
          revisions: { orderBy: { version: 'desc' } },
          proposals: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const safe = [];
      for (const p of prospects) {
        const s = p.snapshot as Record<string, unknown>;
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: p.buyerOrganizationId },
          select: { id: true, name: true, approvalStatus: true, contactEmail: true },
        });
        const allowed =
          s.contactBasis !== 'DO_NOT_CONTACT' &&
          typeof s.contactReviewAt === 'string' &&
          new Date(s.contactReviewAt) > new Date();
        safe.push({
          ...p,
          organization: {
            ...organization,
            contactEmail: allowed ? organization.contactEmail : null,
          },
          contactAllowed: allowed,
        });
      }
      const owners = await tx.organizationMember.findMany({
        where: { organizationId: { in: ids }, status: 'ACTIVE' },
        include: {
          roles: true,
          organization: true,
          permissionGrants: true,
          user: { select: { name: true } },
        },
      });
      return {
        organizationIds: ids,
        owners: owners
          .filter((m) => C.permissionsForMembership(m).includes('buyer.relationship.manage'))
          .map((m) => ({ id: m.userId, name: m.user.name, organizationId: m.organizationId })),
        prospects: safe,
      };
    });
  }
  async create(actor: Actor, input: z.infer<typeof C.prospectCreateSchema>, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.scope(tx, actor, input.operatorOrganizationId);
      await this.owner(tx, input.operatorOrganizationId, input.ownerId);
      return this.command(
        tx,
        actor,
        input.operatorOrganizationId,
        'prospect.create',
        key,
        input,
        async () => {
          let buyerId = input.buyerOrganizationId;
          if (buyerId) {
            const assigned = await tx.operatorAssignment.findFirst({
              where: { operatorId: actor.id, organizationId: buyerId, revokedAt: null },
            });
            const org = await tx.organization.findFirst({
              where: { id: buyerId, type: 'BUYER_BUSINESS' },
            });
            if (!assigned || !org) fail(404, 'NOT_FOUND', 'Assigned buyer organization required.');
          } else {
            const org = await tx.organization.create({
              data: {
                name: input.organizationName!,
                slug: `prospect-${randomUUID()}`,
                type: 'BUYER_BUSINESS',
                approvalStatus: 'PENDING_REVIEW',
                country: 'TN',
                region: 'Unspecified',
                description: 'Unverified commercial prospect',
                contactEmail: input.contactEmail ?? '',
                representativeName: 'Unverified prospect contact',
                createdByUserId: actor.id,
              },
            });
            buyerId = org.id;
            await audit(tx, actor, {
              action: 'sales.organization.discovery',
              targetType: 'Organization',
              targetId: buyerId,
              organizationId: input.operatorOrganizationId,
              after: { verifiedBuyer: false },
            });
          }
          if (input.status !== 'LEAD')
            fail(422, 'INITIAL_STAGE', 'New discovery starts as a lead.');
          const snapshot = C.prospectDetailsSchema.parse(
            Object.fromEntries(
              Object.entries(input).filter(
                ([k]) =>
                  ![
                    'operatorOrganizationId',
                    'buyerOrganizationId',
                    'organizationName',
                    'contactEmail',
                  ].includes(k),
              ),
            ),
          );
          const p = await tx.commercialProspect.create({
            data: {
              operatorOrganizationId: input.operatorOrganizationId,
              buyerOrganizationId: buyerId!,
              snapshot: json(snapshot),
              revisions: { create: { version: 1, snapshot: json(snapshot), actorId: actor.id } },
            },
          });
          await audit(tx, actor, {
            action: 'sales.prospect.create',
            targetType: 'CommercialProspect',
            targetId: p.id,
            organizationId: p.operatorOrganizationId,
            reason: input.reason,
            after: { version: 1, status: input.status },
          });
          return json(p);
        },
      );
    });
  }
  async update(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.prospectUpdateSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const p = await tx.commercialProspect.findUnique({ where: { id } });
      if (!p) fail(404, 'NOT_FOUND', 'Prospect unavailable.');
      await this.scope(tx, actor, p.operatorOrganizationId);
      await this.owner(tx, p.operatorOrganizationId, input.ownerId);
      return this.command(tx, actor, id, 'prospect.update', key, input, async () => {
        if (p.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the prospect.');
        const old = p.snapshot as Record<string, unknown>;
        const edges: Record<string, string[]> = {
          LEAD: ['QUALIFIED', 'LOST'],
          QUALIFIED: ['PROPOSAL', 'LOST'],
          // CONTRACTED is deliberately reachable from PROPOSAL. The edge is listed so the stage is
          // not a dead end, but the guard below demands accepted procurement or signed-contract
          // evidence; selecting the enum alone never satisfies it.
          PROPOSAL: ['QUALIFIED', 'CONTRACTED', 'LOST'],
          CONTRACTED: [],
          LOST: ['LEAD'],
        };
        if (input.status !== old.status && !edges[String(old.status)]?.includes(input.status))
          fail(
            409,
            'INVALID_TRANSITION',
            'Use the reviewed sales stages; contracted status requires separately reviewed signed-contract evidence.',
          );
        const contractedEvidence =
          input.status === 'CONTRACTED' && old.status !== 'CONTRACTED'
            ? await this.contractedEvidence(tx, p)
            : null;
        if (contractedEvidence && !contractedEvidence.ok)
          fail(
            409,
            'CONTRACT_EVIDENCE_REQUIRED',
            'Contracted status requires an accepted procurement order or a recorded signed-contract reference for this buyer organization.',
          );
        const { version, organizationName, ...snapshot } = input;
        if (contractedEvidence?.ok)
          Object.assign(snapshot, {
            contractedEvidence: {
              kind: contractedEvidence.kind,
              reference: contractedEvidence.reference,
              recordedAt: new Date().toISOString(),
            },
            stageProvenance:
              contractedEvidence.kind === 'SYNTHETIC_ACCEPTANCE'
                ? 'SYNTHETIC_APPLICATION_ACCEPTANCE'
                : 'APPLICATION_CONTRACT_REFERENCE_LEGAL_STATUS_UNVERIFIED',
            conversionMeaning: 'EVIDENCE_RECORDED_NOT_LEGAL_SIGNATURE_VERIFIED',
          });
        if (organizationName) {
          const organization = await tx.organization.findUniqueOrThrow({
            where: { id: p.buyerOrganizationId },
          });
          if (
            organization.approvalStatus !== 'PENDING_REVIEW' ||
            organization.createdByUserId !== actor.id
          )
            fail(
              403,
              'ORGANIZATION_AUTHORITY_REQUIRED',
              'Approved buyer details require the existing organization correction authority.',
            );
          await tx.organization.update({
            where: { id: organization.id },
            data: { name: organizationName },
          });
          await audit(tx, actor, {
            action: 'sales.organization.correct',
            targetType: 'Organization',
            targetId: organization.id,
            organizationId: p.operatorOrganizationId,
            reason: input.reason,
            before: { name: organization.name },
            after: { name: organizationName },
          });
        }
        await tx.prospectRevision.create({
          data: {
            prospectId: id,
            version: version + 1,
            snapshot: json(snapshot),
            actorId: actor.id,
          },
        });
        const row = await tx.commercialProspect.update({
          where: { id },
          data: { version: version + 1, snapshot: json(snapshot) },
        });
        await audit(tx, actor, {
          action: 'sales.prospect.update',
          targetType: 'CommercialProspect',
          targetId: id,
          organizationId: p.operatorOrganizationId,
          reason: input.reason,
          before: { version, status: String(old.status) },
          after: { version: version + 1, status: input.status },
        });
        return json(row);
      });
    });
  }
  async propose(
    actor: Actor,
    id: string,
    input: z.infer<typeof C.pilotProposalSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const p = await tx.commercialProspect.findUnique({ where: { id } });
      if (!p) fail(404, 'NOT_FOUND', 'Prospect unavailable.');
      await this.scope(tx, actor, p.operatorOrganizationId);
      return this.command(tx, actor, id, 'proposal.revise', key, input, async () => {
        const contact = p.snapshot as Record<string, unknown>;
        if (
          input.status === 'SENT' &&
          (contact.contactBasis === 'DO_NOT_CONTACT' ||
            new Date(String(contact.contactReviewAt)) <= new Date())
        )
          fail(
            409,
            'CONTACT_PERMISSION_REQUIRED',
            'Review contact permission before sending a proposal.',
          );
        const previous = input.groupId
          ? await tx.pilotProposalRevision.findFirst({
              where: { groupId: input.groupId, prospectId: id },
              orderBy: { version: 'desc' },
            })
          : null;
        if (input.groupId && !previous) fail(404, 'NOT_FOUND', 'Proposal unavailable.');
        if (input.version !== (previous ? previous.version + 1 : 1))
          fail(409, 'VERSION_CONFLICT', 'Reload proposal revisions.');
        const prior = previous?.snapshot as Record<string, unknown> | undefined;
        if (prior && ['WON', 'LOST', 'NO_DECISION'].includes(String(prior.status)))
          fail(409, 'PROPOSAL_TERMINAL', 'Start a new proposal after an outcome.');
        if (!previous && input.status !== 'DRAFT')
          fail(409, 'PROPOSAL_DRAFT_REQUIRED', 'Start with a draft proposal.');
        if (
          previous &&
          input.status !== 'DRAFT' &&
          prior?.status !== 'SENT' &&
          input.status !== 'SENT'
        )
          fail(409, 'PROPOSAL_NOT_SENT', 'Send a proposal before recording the buyer outcome.');
        const spec = await tx.productSpecificationRevision.findFirst({
          where: {
            id: input.specificationRevisionId,
            specification: { ownerOrganizationId: p.operatorOrganizationId },
          },
        });
        if (!spec) fail(404, 'NOT_FOUND', 'Specification unavailable.');
        if (
          input.status === 'SENT' &&
          (spec.status !== 'APPROVED' || new Date(input.validUntil) <= new Date())
        )
          fail(
            409,
            'PROPOSAL_NOT_READY',
            'An approved specification and future validity are required.',
          );
        if (['WON', 'LOST', 'NO_DECISION'].includes(input.status) && !input.decisionAt)
          fail(422, 'DECISION_DATE_REQUIRED', 'Record the buyer decision date.');
        const linkedRfqId = input.rfqId ?? previous?.rfqId ?? undefined;
        if (previous?.rfqId && input.rfqId && input.rfqId !== previous.rfqId)
          fail(409, 'RFQ_LINK_IMMUTABLE', 'Start a separate proposal for a different RFQ.');
        if (linkedRfqId) {
          const rfq = await tx.commercialRfq.findFirst({
            where: {
              id: linkedRfqId,
              buyerOrganizationId: p.buyerOrganizationId,
              operatorOrganizationId: p.operatorOrganizationId,
            },
          });
          const assigned = await tx.operatorAssignment.findFirst({
            where: { operatorId: actor.id, organizationId: p.buyerOrganizationId, revokedAt: null },
          });
          if (!rfq || !assigned) fail(404, 'NOT_FOUND', 'Authorized RFQ linkage required.');
        }
        if (input.status === 'WON') {
          if (!linkedRfqId)
            fail(422, 'CONVERSION_EVIDENCE_REQUIRED', 'Link an authorized RFQ before marking won.');
          const rfq = await tx.commercialRfq.findFirst({
            where: {
              id: linkedRfqId,
              buyerOrganizationId: p.buyerOrganizationId,
              operatorOrganizationId: p.operatorOrganizationId,
              status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED'] },
            },
          });
          const assignment = await tx.operatorAssignment.findFirst({
            where: { operatorId: actor.id, organizationId: p.buyerOrganizationId, revokedAt: null },
          });
          if (!rfq || !assignment)
            fail(404, 'NOT_FOUND', 'Authorized submitted RFQ evidence required.');
          if (
            prior?.status !== 'SENT' ||
            new Date(String(prior.validUntil)) < new Date(input.decisionAt!)
          )
            fail(409, 'PROPOSAL_EXPIRED', 'The sent proposal was not valid at the decision date.');
          const accepted =
            rfq.status === 'ACCEPTED'
              ? await tx.procurementAcceptance.findFirst({ where: { order: { rfqId: rfq.id } } })
              : null;
          const previousStage = p.snapshot as Record<string, unknown>;
          const next = {
            ...previousStage,
            status: accepted || previousStage.status === 'CONTRACTED' ? 'CONTRACTED' : 'PROPOSAL',
            conversionMeaning: 'RFQ_LINKED_ONLY_NOT_SIGNED_AGREEMENT',
            ...(accepted
              ? {
                  acceptedOrderId: accepted.orderId,
                  acceptanceId: accepted.id,
                  stageProvenance:
                    rfq.provenance === 'SYNTHETIC'
                      ? 'SYNTHETIC_APPLICATION_ACCEPTANCE'
                      : 'APPLICATION_ACCEPTANCE_LEGAL_STATUS_UNVERIFIED',
                }
              : {}),
          };
          await tx.prospectRevision.create({
            data: {
              prospectId: id,
              version: p.version + 1,
              snapshot: json(next),
              actorId: actor.id,
            },
          });
          await tx.commercialProspect.update({
            where: { id },
            data: { version: p.version + 1, snapshot: json(next) },
          });
        }
        if (previous && ['WON', 'LOST', 'NO_DECISION'].includes(input.status)) {
          for (const field of [
            'specificationRevisionId',
            'quantity',
            'proposedPriceTnd',
            'estimatedCostTnd',
            'validUntil',
            'timing',
            'responsibilities',
          ] as const) {
            if (prior?.[field] !== input[field])
              fail(
                409,
                'PROPOSAL_SCOPE_CHANGED',
                'Record the outcome against the exact sent proposal; revise and resend changed terms first.',
              );
          }
        }
        const row = await tx.pilotProposalRevision.create({
          data: {
            prospectId: id,
            groupId: input.groupId ?? randomUUID(),
            version: input.version,
            specificationRevisionId: spec.id,
            rfqId: linkedRfqId ?? null,
            snapshot: json({ ...input, ...(linkedRfqId ? { rfqId: linkedRfqId } : {}) }),
            actorId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'sales.proposal.revise',
          targetType: 'PilotProposalRevision',
          targetId: row.id,
          organizationId: p.operatorOrganizationId,
          reason: input.reason,
          after: { version: input.version, status: input.status, createsAgreement: false },
        });
        return json({ ...row, createsAgreement: false });
      });
    });
  }
}
