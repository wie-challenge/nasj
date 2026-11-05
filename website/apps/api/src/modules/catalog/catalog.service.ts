import { createHash } from 'node:crypto';
import { recognizeSampleObligation } from '../finance/sample-obligations.js';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class ProductCatalogService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async workspace(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (
        !access.specification &&
        !access.sampleApproval &&
        !access.sampleRequest &&
        !access.artisanProfileId
      )
        fail(403, 'FORBIDDEN', 'Product catalogue access is required.');

      const specifications = await tx.productSpecification.findMany({
        where: access.platform
          ? {}
          : {
              ownerOrganizationId: {
                in: access.organizationIds.length ? access.organizationIds : [''],
              },
            },
        include: { craftSkill: true, revisions: { orderBy: { revisionNumber: 'desc' } } },
        orderBy: [{ productCode: 'asc' }],
        take: 50,
      });
      const sampleWhere: Prisma.ProductSampleRequestWhereInput = access.platform
        ? {}
        : {
            OR: [
              { buyerOrganizationId: { in: access.organizationIds } },
              { operatorOrganizationId: { in: access.organizationIds } },
              ...(access.artisanProfileId
                ? [{ responsibleArtisanProfileId: access.artisanProfileId }]
                : []),
            ],
          };
      const samples = await tx.productSampleRequest.findMany({
        where: sampleWhere,
        include: {
          specificationRevision: { include: { specification: true } },
          evaluations: { orderBy: { createdAt: 'desc' } },
          approvals: { orderBy: { createdAt: 'desc' } },
          ledgerPayable: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const view: C.CatalogWorkspaceView = {
        specifications: specifications.map((specification) => ({
          id: specification.id,
          productCode: specification.productCode,
          name: specification.name,
          craftSkillId: specification.craftSkillId,
          craftName: specification.craftSkill.name,
          ownerOrganizationId: specification.ownerOrganizationId,
          revisions: specification.revisions.map((revision) => ({
            id: revision.id,
            revisionNumber: revision.revisionNumber,
            status: revision.status as C.SpecificationState,
            description: revision.description,
            dimensions: revision.dimensions,
            unit: revision.unit,
            materials: revision.materials as C.SpecificationRevisionView['materials'],
            instructions: revision.instructions,
            tolerances: revision.tolerances,
            qualityCriteria: revision.qualityCriteria,
            referenceImages:
              revision.referenceImages as C.SpecificationRevisionView['referenceImages'],
            sampleReference: revision.sampleReference,
            createdAt: revision.createdAt.toISOString(),
            approvedAt: revision.approvedAt?.toISOString() ?? null,
            rejectionReason: revision.rejectionReason,
            supersededByRevisionNumber: null,
          })),
        })),
        samples: samples.map((sample) => {
          const blocker = C.sampleMayStart({
            compensationMillimes: sample.compensationMillimes?.toString() ?? null,
            compensationBasis: sample.compensationBasis,
          });
          return {
            id: sample.id,
            revisionId: sample.specificationRevisionId,
            revisionNumber: sample.specificationRevision.revisionNumber,
            specification: {
              description: sample.specificationRevision.description,
              dimensions: sample.specificationRevision.dimensions,
              tolerances: sample.specificationRevision.tolerances,
              qualityCriteria: sample.specificationRevision.qualityCriteria,
              instructions: sample.specificationRevision.instructions,
            },
            specificationName: sample.specificationRevision.specification.name,
            productCode: sample.specificationRevision.specification.productCode,
            buyerOrganizationId: sample.buyerOrganizationId,
            operatorOrganizationId: sample.operatorOrganizationId,
            sampleQuantity: sample.sampleQuantity,
            status: sample.status as C.SampleState,
            workTerms: sample.workTerms,
            termsSha256: sample.termsSha256,
            canAcceptTerms:
              sample.responsibleArtisanProfileId === access.artisanProfileId && !sample.acceptedAt,
            canIssueTerms: access.operatorOrganizationIds.includes(sample.operatorOrganizationId),
            canRecordWork: sample.responsibleArtisanProfileId === access.artisanProfileId,
            canEvaluate: access.qualityOrganizationIds.includes(sample.operatorOrganizationId),
            canApprove:
              access.organizationIds.includes(sample.buyerOrganizationId) && access.sampleApproval,
            acceptedAt: sample.acceptedAt?.toISOString() ?? null,
            compensationTnd:
              sample.compensationMillimes === null
                ? null
                : C.formatTnd(sample.compensationMillimes),
            compensationBasis: sample.compensationBasis,
            materialCostTnd:
              sample.materialCostMillimes === null
                ? null
                : C.formatTnd(sample.materialCostMillimes),
            payable: sample.ledgerPayable
              ? {
                  id: sample.ledgerPayable.id,
                  amountTnd: C.formatTnd(sample.ledgerPayable.amountMillimes),
                  status: sample.ledgerPayable.status,
                }
              : null,
            materialResponsibility: sample.materialResponsibility,
            plannedCompletion: sample.plannedCompletion?.toISOString() ?? null,
            actualRecordedMinutes: sample.actualRecordedMinutes,
            actualMaterialCostTnd:
              sample.actualMaterialCostMillimes === null
                ? null
                : C.formatTnd(sample.actualMaterialCostMillimes),
            actualMaterialUsage: sample.actualMaterialUsage,
            timeEvidence: sample.timeEvidence,
            evidenceReference: sample.evidenceReference,
            evaluations: sample.evaluations.map((evaluation) => ({
              id: evaluation.id,
              decision: evaluation.decision,
              criteria: evaluation.criteria,
              comments: evaluation.comments,
              evidenceReference: evaluation.evidenceReference,
              createdAt: evaluation.createdAt.toISOString(),
            })),
            approvals: sample.approvals.map((approval) => ({
              id: approval.id,
              decision: approval.decision,
              comments: approval.comments,
              evidenceReference: approval.evidenceReference,
              createdAt: approval.createdAt.toISOString(),
              buyerOrganizationId: approval.buyerOrganizationId,
            })),
            compensationBlocker: blocker.allowed ? null : blocker.reason,
          };
        }),
        canApprove: access.sampleApproval,
        limitations: [
          'Approved revisions are immutable. A change creates a new revision.',
          'Sample compensation must be agreed before sample work starts.',
          'Recorded sample time is labelled with its evidence class and never inferred.',
        ],
      };
      return view;
    });
  }

  async createSpecification(actor: Actor, input: C.SpecificationCreateInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.specification)
        fail(403, 'FORBIDDEN', 'Product specification management is required.');
      const organizationId = access.designOrganizationId;
      if (!organizationId)
        fail(403, 'FORBIDDEN', 'A product design organization membership is required.');
      return this.command(
        tx,
        actor,
        organizationId,
        'specification.create',
        key,
        input,
        async () => {
          const existing = await tx.productSpecification.findUnique({
            where: {
              ownerOrganizationId_productCode: {
                ownerOrganizationId: organizationId,
                productCode: input.productCode,
              },
            },
          });
          if (existing)
            fail(409, 'PRODUCT_EXISTS', 'This product code already exists. Add a new revision.');
          const specification = await tx.productSpecification.create({
            data: {
              craftSkillId: input.craftSkillId,
              productCode: input.productCode,
              name: input.name,
              ownerOrganizationId: organizationId,
              authorId: actor.id,
            },
          });
          const revision = await tx.productSpecificationRevision.create({
            data: {
              specificationId: specification.id,
              revisionNumber: input.revision.revisionNumber,
              status: 'DRAFT',
              description: input.revision.description,
              dimensions: input.revision.dimensions,
              unit: input.revision.unit,
              materials: json(input.revision.materials),
              instructions: input.revision.instructions,
              instructionLanguage: input.revision.instructionLanguage,
              instructionTranslations: json(input.revision.instructionTranslations),
              tolerances: input.revision.tolerances,
              qualityCriteria: input.revision.qualityCriteria,
              referenceImages: json(input.revision.referenceImages),
              sampleReference: input.revision.sampleReference,
              authorId: actor.id,
            },
          });
          await audit(tx, actor, {
            action: 'catalog.specification.created',
            targetType: 'ProductSpecificationRevision',
            targetId: revision.id,
            organizationId,
            after: {
              productCode: input.productCode,
              revisionNumber: revision.revisionNumber,
              status: 'DRAFT',
              provenance: 'SYNTHETIC',
            },
          });
          return { id: specification.id, revisionId: revision.id };
        },
      );
    });
  }

  async submitSpecification(
    actor: Actor,
    revisionId: string,
    input: { version: number },
    key?: string,
  ) {
    return this.transitionSpecification(
      actor,
      revisionId,
      input.version,
      key,
      'SUBMITTED_FOR_REVIEW',
    );
  }

  async decideSpecification(
    actor: Actor,
    revisionId: string,
    input: z.infer<typeof C.specificationDecisionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const revision = await tx.productSpecificationRevision.findUnique({
        where: { id: revisionId },
        include: { specification: true },
      });
      if (!revision) fail(404, 'NOT_FOUND', 'Specification revision not found.');
      const access = await this.access(tx, actor);
      if (
        !access.specification ||
        !access.designOrganizationIds.includes(revision.specification.ownerOrganizationId)
      )
        fail(403, 'FORBIDDEN', 'Approval requires authority in the owning design organization.');
      return this.command(tx, actor, revisionId, 'specification.decide', key, input, async () => {
        if (input.version !== revision.revisionNumber)
          fail(409, 'STALE_VERSION', 'The specification revision changed.');
        if (revision.status !== 'SUBMITTED_FOR_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'Only a submitted revision can be decided.');
        if (!C.canTransitionSpecification(revision.status as C.SpecificationState, input.decision))
          fail(409, 'INVALID_TRANSITION', 'This decision is not allowed from the current state.');
        const decided = await tx.productSpecificationRevision.update({
          where: { id: revisionId },
          data:
            input.decision === 'APPROVED'
              ? {
                  status: 'APPROVED',
                  approvedById: actor.id,
                  approvedAt: new Date(),
                }
              : { status: 'REJECTED', rejectionReason: input.comments },
        });
        await audit(tx, actor, {
          action: `catalog.specification.${input.decision.toLowerCase()}`,
          targetType: 'ProductSpecificationRevision',
          targetId: revisionId,
          organizationId: revision.specification.ownerOrganizationId,
          reason: input.comments || undefined,
          after: { status: decided.status, provenance: 'SYNTHETIC' },
        });
        return { id: decided.id, status: decided.status };
      });
    });
  }

  /** A new revision supersedes the previous approved one without rewriting it. */
  async reviseSpecification(
    actor: Actor,
    specificationId: string,
    input: C.SpecificationRevisionInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const specification = await tx.productSpecification.findUnique({
        where: { id: specificationId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });
      if (!specification) fail(404, 'NOT_FOUND', 'Specification not found.');
      const access = await this.access(tx, actor);
      if (
        !access.specification ||
        specification.ownerOrganizationId !== access.designOrganizationId
      )
        fail(403, 'FORBIDDEN', 'Only the owning design organization can revise this product.');
      return this.command(
        tx,
        actor,
        specificationId,
        'specification.revise',
        key,
        input,
        async () => {
          const latest = specification.revisions[0];
          if (latest && input.revisionNumber <= latest.revisionNumber)
            fail(409, 'REVISION_EXISTS', 'Use a new revision number above the latest revision.');
          const revision = await tx.productSpecificationRevision.create({
            data: {
              specificationId,
              revisionNumber: input.revisionNumber,
              status: 'DRAFT',
              description: input.description,
              dimensions: input.dimensions,
              unit: input.unit,
              materials: json(input.materials),
              instructions: input.instructions,
              instructionLanguage: input.instructionLanguage,
              instructionTranslations: json(input.instructionTranslations),
              tolerances: input.tolerances,
              qualityCriteria: input.qualityCriteria,
              referenceImages: json(input.referenceImages),
              sampleReference: input.sampleReference,
              authorId: actor.id,
            },
          });
          await audit(tx, actor, {
            action: 'catalog.specification.revised',
            targetType: 'ProductSpecificationRevision',
            targetId: revision.id,
            organizationId: specification.ownerOrganizationId,
            after: {
              revisionNumber: revision.revisionNumber,
              supersedes: latest?.revisionNumber ?? null,
              provenance: 'SYNTHETIC',
            },
          });
          return { id: revision.id, revisionNumber: revision.revisionNumber };
        },
      );
    });
  }

  async requestSample(actor: Actor, input: C.SampleRequestInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const revision = await tx.productSpecificationRevision.findUnique({
        where: { id: input.revisionId },
        include: { specification: true },
      });
      if (!revision) fail(404, 'NOT_FOUND', 'Specification revision not found.');
      const access = await this.access(tx, actor);
      if (!access.sampleRequest) fail(403, 'FORBIDDEN', 'Sample request authority is required.');
      return this.command(tx, actor, input.revisionId, 'sample.request', key, input, async () => {
        const buyer = await tx.organizationMember.findFirst({
          where: {
            userId: actor.id,
            organizationId: input.buyerOrganizationId,
            status: 'ACTIVE',
            organization: { approvalStatus: 'APPROVED', type: 'BUYER_BUSINESS' },
          },
        });
        if (!buyer)
          fail(403, 'FORBIDDEN', 'Sample requests are raised by the buying organization.');
        if (revision.status !== 'APPROVED' || revision.supersededById)
          fail(409, 'SPECIFICATION_NOT_APPROVED', 'Use a current approved specification.');
        const artisan = input.responsibleArtisanProfileId
          ? await tx.artisanProfile.findUnique({
              where: { id: input.responsibleArtisanProfileId },
              include: { skills: true },
            })
          : null;
        if (
          !artisan?.userId ||
          !artisan.skills.some(
            (skill) => skill.craftSkillId === revision.specification.craftSkillId,
          )
        )
          fail(
            400,
            'SAMPLE_OWNER_REQUIRED',
            'A qualified account-linked artisan must own the sample.',
          );
        const operatorOrganizationId = input.operatorOrganizationId;
        const operator = await tx.organization.findFirst({
          where: { id: operatorOrganizationId, type: 'INTERNAL', approvalStatus: 'APPROVED' },
        });
        const assigned = await tx.operatorAssignment.findFirst({
          where: {
            organizationId: input.buyerOrganizationId,
            revokedAt: null,
            operator: {
              organizationMemberships: {
                some: { organizationId: operatorOrganizationId, status: 'ACTIVE' },
              },
            },
          },
        });
        if (!operator || !assigned)
          fail(
            403,
            'FORBIDDEN',
            'A buyer-assigned operating organization must coordinate the sample.',
          );
        const sample = await tx.productSampleRequest.create({
          data: {
            specificationRevisionId: input.revisionId,
            buyerOrganizationId: input.buyerOrganizationId,
            operatorOrganizationId,
            sampleQuantity: input.sampleQuantity,
            responsibleArtisanProfileId: input.responsibleArtisanProfileId,
            status: 'TERMS_PENDING',
            workTerms: input.workTerms,
            compensationBasis: 'UNPAID_BY_DEFAULT_BLOCKED',
            materialResponsibility: input.materialResponsibility,
            plannedCompletion: input.plannedCompletion ? new Date(input.plannedCompletion) : null,
            authorId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'catalog.sample.requested',
          targetType: 'ProductSampleRequest',
          targetId: sample.id,
          organizationId: input.buyerOrganizationId,
          after: {
            status: 'TERMS_PENDING',
            compensation: 'UNPAID_BY_DEFAULT_BLOCKED',
            provenance: 'SYNTHETIC',
          },
        });
        return { id: sample.id, status: sample.status };
      });
    });
  }

  async agreeTerms(actor: Actor, sampleId: string, input: C.SampleTermsInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const sample = await this.sample(tx, actor, sampleId);
      const access = await this.access(tx, actor);
      if (!access.operatorOrganizationIds.includes(sample.operatorOrganizationId))
        fail(403, 'FORBIDDEN', 'The coordinating operator issues paid sample terms.');
      return this.command(tx, actor, sampleId, 'sample.terms', key, input, async () => {
        if (sample.acceptedAt || !['REQUESTED', 'TERMS_PENDING'].includes(sample.status))
          fail(
            409,
            'INVALID_TRANSITION',
            'Accepted sample terms are immutable. Request a new sample for changed work.',
          );
        const millimes = C.parseTnd(input.compensationTnd);
        const materialCost = C.parseTnd(input.materialCostTnd);
        if (millimes <= 0n) fail(400, 'COMPENSATION_REQUIRED', 'Sample work is never unpaid.');
        const termsSha256 = createHash('sha256')
          .update(
            JSON.stringify({
              sampleId,
              revisionId: sample.specificationRevisionId,
              artisanProfileId: sample.responsibleArtisanProfileId,
              quantity: sample.sampleQuantity,
              compensationMillimes: millimes.toString(),
              materialCostMillimes: materialCost.toString(),
              compensationBasis: input.compensationBasis,
              workTerms: input.workTerms,
              materialResponsibility: sample.materialResponsibility,
              reimburseMaterials: input.reimburseMaterials,
              deadline: sample.plannedCompletion?.toISOString(),
              milestone: 'COMPLETION',
            }),
          )
          .digest('hex');
        await tx.productSampleRequest.update({
          where: { id: sampleId },
          data: {
            compensationMillimes: millimes,
            compensationBasis: input.compensationBasis,
            materialCostMillimes: materialCost,
            reimburseMaterials: input.reimburseMaterials,
            workTerms: input.workTerms,
            evidenceReference: input.evidenceReference,
            termsSha256,
            status: 'TERMS_PENDING',
          },
        });
        await audit(tx, actor, {
          action: 'catalog.sample.terms_issued',
          targetType: 'ProductSampleRequest',
          targetId: sampleId,
          organizationId: sample.operatorOrganizationId,
          after: {
            termsSha256,
            milestone: 'COMPLETION',
            consent: 'PENDING',
            issuedTerms: JSON.stringify(input),
            artisanProfileId: sample.responsibleArtisanProfileId,
            sampleQuantity: sample.sampleQuantity,
            plannedCompletion: sample.plannedCompletion?.toISOString() ?? null,
            materialResponsibility: sample.materialResponsibility,
          },
        });
        return {
          id: sampleId,
          status: 'TERMS_PENDING',
          termsSha256,
          requiresArtisanAcceptance: true,
        };
      });
    });
  }

  async acceptTerms(actor: Actor, sampleId: string, input: { termsSha256: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const sample = await this.sample(tx, actor, sampleId);
      const artisan = sample.responsibleArtisanProfileId
        ? await tx.artisanProfile.findUnique({ where: { id: sample.responsibleArtisanProfileId } })
        : null;
      if (artisan?.userId !== actor.id)
        fail(403, 'FORBIDDEN', 'Only the sample artisan can accept these terms.');
      return this.command(tx, actor, sampleId, 'sample.accept', key, input, async () => {
        if (
          sample.status !== 'TERMS_PENDING' ||
          sample.acceptedAt ||
          !sample.termsSha256 ||
          sample.termsSha256 !== input.termsSha256
        )
          fail(409, 'STALE_TERMS', 'Review and explicitly accept the current sample terms.');
        const saved = await tx.productSampleRequest.update({
          where: { id: sampleId },
          data: {
            acceptedById: actor.id,
            acceptedAt: new Date(),
            acceptedTermsSha256: input.termsSha256,
            status: 'ACCEPTED_FOR_PRODUCTION',
          },
        });
        await audit(tx, actor, {
          action: 'catalog.sample.artisan_accepted',
          targetType: 'ProductSampleRequest',
          targetId: sampleId,
          organizationId: sample.operatorOrganizationId,
          after: { termsSha256: input.termsSha256, status: saved.status },
        });
        return { id: sampleId, status: saved.status };
      });
    });
  }

  async recordWork(actor: Actor, sampleId: string, input: C.SampleWorkInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const sample = await this.sample(tx, actor, sampleId);
      const artisan = sample.responsibleArtisanProfileId
        ? await tx.artisanProfile.findUnique({ where: { id: sample.responsibleArtisanProfileId } })
        : null;
      if (artisan?.userId !== actor.id)
        fail(403, 'FORBIDDEN', 'Only the sample artisan records completion and observed effort.');
      return this.command(tx, actor, sampleId, 'sample.work', key, input, async () => {
        if (
          !sample.acceptedAt ||
          sample.acceptedTermsSha256 !== sample.termsSha256 ||
          sample.status !== 'ACCEPTED_FOR_PRODUCTION'
        )
          fail(
            409,
            'SAMPLE_TERMS_REQUIRED',
            'Sample work requires the artisan acceptance of final terms.',
          );
        const blocker = C.sampleMayStart({
          compensationMillimes: sample.compensationMillimes?.toString() ?? null,
          compensationBasis: sample.compensationBasis,
        });
        if (!blocker.allowed)
          fail(409, 'COMPENSATION_PENDING', blocker.reason ?? 'Sample compensation is pending.');
        // Unknown time stays unknown: a null measurement is never recorded as zero.
        if (input.actualRecordedMinutes === null && input.timeEvidence === 'OBSERVED')
          fail(400, 'TIME_EVIDENCE_INCONSISTENT', 'An observed record needs measured minutes.');
        const updated = await tx.productSampleRequest.update({
          where: { id: sampleId },
          data: {
            actualRecordedMinutes: input.actualRecordedMinutes,
            actualMaterialCostMillimes:
              input.actualMaterialCostTnd === null ? null : C.parseTnd(input.actualMaterialCostTnd),
            actualMaterialUsage: input.actualMaterialUsage,
            timeEvidence: input.timeEvidence,
            evidenceReference: input.evidenceReference || sample.evidenceReference,
            status: 'SUBMITTED',
          },
        });
        await recognizeSampleObligation(tx, updated);
        await audit(tx, actor, {
          action: 'catalog.sample.work_recorded',
          targetType: 'ProductSampleRequest',
          targetId: sampleId,
          organizationId: sample.operatorOrganizationId,
          after: {
            minutes: input.actualRecordedMinutes,
            evidence: input.timeEvidence,
            status: updated.status,
            provenance: input.timeEvidence === 'OBSERVED' ? 'OBSERVED' : 'SYNTHETIC',
          },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  async evaluate(actor: Actor, sampleId: string, input: C.SampleEvaluationInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const sample = await this.sample(tx, actor, sampleId);
      const access = await this.access(tx, actor);
      if (!access.qualityOrganizationIds.includes(sample.operatorOrganizationId))
        fail(403, 'FORBIDDEN', 'The operating quality inspector evaluates this sample.');
      const revision = await tx.productSpecificationRevision.findUniqueOrThrow({
        where: { id: sample.specificationRevisionId },
      });
      return this.command(tx, actor, sampleId, 'sample.evaluate', key, input, async () => {
        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(sample.status))
          fail(409, 'INVALID_TRANSITION', 'Inspection follows submitted sample work.');
        const target =
          input.decision === 'APPROVED'
            ? 'UNDER_REVIEW'
            : input.decision === 'REVISION_REQUESTED'
              ? 'REVISION_REQUESTED'
              : 'REJECTED';
        await tx.sampleEvaluation.create({
          data: {
            sampleRequestId: sampleId,
            decision: input.decision,
            criteria: revision.qualityCriteria,
            comments: input.comments,
            evidenceReference: input.evidenceReference,
            inspectorId: actor.id,
          },
        });
        const updated = await tx.productSampleRequest.update({
          where: { id: sampleId },
          data: { status: target },
        });
        await audit(tx, actor, {
          action: `catalog.sample.${input.decision.toLowerCase()}`,
          targetType: 'ProductSampleRequest',
          targetId: sampleId,
          organizationId: sample.operatorOrganizationId,
          after: { status: updated.status, provenance: 'SYNTHETIC' },
        });
        return { id: updated.id, status: updated.status };
      });
    });
  }

  /** Buyer approval. Only the request's own buying organization may approve. */
  async approve(actor: Actor, sampleId: string, input: C.SampleApprovalInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const sample = await tx.productSampleRequest.findUnique({
        where: { id: sampleId },
        include: { specificationRevision: { include: { specification: true } } },
      });
      if (!sample) fail(404, 'NOT_FOUND', 'Sample request not found.');
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: sample.buyerOrganizationId,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED', type: 'BUYER_BUSINESS' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (!member || !C.permissionsForMembership(member).includes('buyer.quotation.approve'))
        fail(403, 'FORBIDDEN', 'Only the authorized buyer organization can approve a sample.');
      return this.command(tx, actor, sampleId, 'sample.approval', key, input, async () => {
        if (sample.status !== 'UNDER_REVIEW')
          fail(409, 'INVALID_TRANSITION', 'A sample is approved after inspection, not before.');
        if (await tx.buyerSampleApproval.findFirst({ where: { sampleRequestId: sampleId } }))
          fail(
            409,
            'DECISION_IMMUTABLE',
            'A sample decision is recorded. Request a new sample for a new decision.',
          );
        const revision = sample.specificationRevision;
        if (revision.status !== 'APPROVED')
          fail(
            409,
            'SPECIFICATION_NOT_APPROVED',
            'The sample references a specification revision that is not approved.',
          );
        const priorApproval = await tx.buyerSampleApproval.findFirst({
          where: {
            buyerOrganizationId: sample.buyerOrganizationId,
            specificationRevision: {
              specificationId: revision.specificationId,
              revisionNumber: { lt: revision.revisionNumber },
            },
            amendedBy: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        const approval = await tx.buyerSampleApproval.create({
          data: {
            sampleRequestId: sampleId,
            amendmentOfId: priorApproval?.id,
            specificationRevisionId: revision.id,
            buyerOrganizationId: sample.buyerOrganizationId,
            actorId: actor.id,
            decision: input.decision,
            comments: input.comments,
            evidenceReference: input.evidenceReference,
          },
        });
        const updated = await tx.productSampleRequest.update({
          where: { id: sampleId },
          data: { status: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
        });
        // Sample work was performed under agreed terms, so the obligation survives a rejection:
        // the artisan is paid for the sample even when the sample is not accepted and even when
        // bulk production is never awarded. Recognition is not payment.
        const payable = await recognizeSampleObligation(tx, updated);
        await audit(tx, actor, {
          action: `catalog.sample.buyer_${input.decision.toLowerCase()}`,
          targetType: 'BuyerSampleApproval',
          targetId: approval.id,
          organizationId: sample.buyerOrganizationId,
          after: {
            decision: input.decision,
            revisionNumber: revision.revisionNumber,
            payableId: payable.id,
            provenance: 'SYNTHETIC',
          },
        });
        return { id: approval.id, status: updated.status, payableId: payable.id };
      });
    });
  }

  /**
   * Pin an accepted order revision to the catalogue revision it accepted. This is what makes the
   * catalogue the single design authority: the release gate then verifies this binding. It never
   * rewrites an already bound revision, so historical orders keep the version they accepted.
   */
  async bindOrderRevision(
    actor: Actor,
    orderId: string,
    catalogueRevisionId: string,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await tx.commercialOrder.findUnique({
        where: { id: orderId },
        include: {
          rfq: true,
          acceptance: { include: { quote: true } },
          batches: { include: { release: true } },
          offers: true,
        },
      });
      if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
      const buyer = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: order.rfq.buyerOrganizationId,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED', type: 'BUYER_BUSINESS' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (!buyer || !C.permissionsForMembership(buyer).includes('buyer.quotation.approve'))
        fail(
          403,
          'FORBIDDEN',
          'Only the authorized buyer may bind approved design and sample terms.',
        );
      return this.command(
        tx,
        actor,
        orderId,
        'order.bind',
        key,
        { catalogueRevisionId },
        async () => {
          if (order.productSpecificationRevisionId || order.batches.some((b) => b.release))
            fail(
              409,
              'REVISION_ALREADY_BOUND',
              'Accepted or released specification versions cannot be silently replaced.',
            );
          const acceptedRevisionId = order.acceptance?.quote.revisionId;
          if (!acceptedRevisionId)
            fail(409, 'ORDER_NOT_READY', 'An accepted procurement revision is required.');
          const catalogue = await tx.productSpecificationRevision.findUnique({
            where: { id: catalogueRevisionId },
            include: { specification: true },
          });
          if (
            catalogue?.status !== 'APPROVED' ||
            catalogue.supersededById ||
            catalogue.specification.craftSkillId !== order.rfq.craftSkillId
          )
            fail(
              409,
              'SPECIFICATION_NOT_APPROVED',
              'Use a matching approved specification revision.',
            );
          const approval = await tx.buyerSampleApproval.findFirst({
            where: {
              specificationRevisionId: catalogueRevisionId,
              buyerOrganizationId: order.rfq.buyerOrganizationId,
              decision: 'APPROVED',
              sampleRequest: { operatorOrganizationId: order.rfq.operatorOrganizationId },
            },
            include: { sampleRequest: { include: { evaluations: true } } },
            orderBy: { createdAt: 'desc' },
          });
          if (!approval)
            fail(
              409,
              'SAMPLE_NOT_APPROVED',
              'This buyer must approve the exact sample and specification before binding.',
            );
          if (order.batches.length || order.offers.length)
            fail(
              409,
              'WORK_ALREADY_OFFERED',
              'Bind specification before issuing artisan work; later design changes require contractual reapproval.',
            );
          const latest = await tx.procurementSample.findFirst({
            where: { rfqId: order.rfqId },
            orderBy: { version: 'desc' },
          });
          const latestRevision = await tx.procurementRevision.findFirstOrThrow({
            where: { rfqId: order.rfqId },
            orderBy: { version: 'desc' },
          });
          const procurementRevision = await tx.procurementRevision.create({
            data: {
              rfqId: order.rfqId,
              version: latestRevision.version + 1,
              predecessorId: latestRevision.id,
              authorId: actor.id,
              reason: 'Buyer explicitly bound approved catalogue design before artisan offers.',
              snapshot: json({
                ...(latestRevision.snapshot as Record<string, unknown>),
                specification: catalogue.description,
                dimensions: catalogue.dimensions,
                tolerances: catalogue.tolerances,
                designRequirements: catalogue.instructions,
                catalogueRevisionId,
                buyerApprovalId: approval.id,
                previouslyAcceptedRevisionId: acceptedRevisionId,
              }),
            },
          });
          const revisionId = procurementRevision.id;
          // Compatibility projection of the SAME buyer decision; it is never a second consent gate.
          await tx.procurementSample.create({
            data: {
              rfqId: order.rfqId,
              revisionId,
              version: (latest?.version ?? 0) + 1,
              authorId: actor.id,
              evidenceReference: approval.evidenceReference,
              criteria: catalogue.qualityCriteria,
              catalogueApprovalId: approval.id,
              snapshot: json({
                catalogueRevisionId,
                buyerApprovalId: approval.id,
                revisionNumber: catalogue.revisionNumber,
                description: catalogue.description,
                dimensions: catalogue.dimensions,
                tolerances: catalogue.tolerances,
                instructions: catalogue.instructions,
                qualityCriteria: catalogue.qualityCriteria,
                materials: catalogue.materials,
                images: catalogue.referenceImages,
              }),
              decision: {
                create: {
                  actorId: approval.actorId,
                  decision: 'APPROVED',
                  comments: approval.comments,
                  createdAt: approval.createdAt,
                },
              },
            },
          });
          if (
            (await tx.specificationMaterialLine.count({ where: { revisionId } })) ||
            (await tx.inspectionCriterion.count({ where: { revisionId } }))
          )
            fail(
              409,
              'SPECIFICATION_IMMUTABLE',
              'Existing accepted procurement criteria cannot be rewritten. Bind the catalogue before recording production requirements.',
            );
          const materials = catalogue.materials as C.SpecificationRevisionInput['materials'];
          await tx.specificationMaterialLine.createMany({
            data: materials.map((m) => ({
              revisionId,
              materialCode: m.materialCode,
              name: m.name,
              unit: m.unit,
              perItemMilli: Number(C.parseTnd(m.quantity)),
              wastageBps: 0,
            })),
          });
          await tx.inspectionCriterion.create({
            data: {
              revisionId,
              code: 'APPROVED_SAMPLE_STANDARD',
              description: catalogue.qualityCriteria,
              expected: catalogue.dimensions || catalogue.description,
              tolerance: catalogue.tolerances,
              required: true,
              evidenceRequired: true,
            },
          });
          const updated = await tx.commercialOrder.update({
            where: { id: orderId },
            data: {
              productSpecificationRevisionId: catalogueRevisionId,
              catalogueProcurementRevisionId: revisionId,
              version: { increment: 1 },
            },
          });
          await audit(tx, actor, {
            action: 'catalog.order.bound',
            targetType: 'CommercialOrder',
            targetId: orderId,
            organizationId: order.rfq.buyerOrganizationId,
            after: {
              catalogueRevisionId,
              buyerApprovalId: approval.id,
              revisionNumber: catalogue.revisionNumber,
            },
          });
          return {
            id: updated.id,
            catalogueRevisionId,
            orderVersion: updated.version,
            buyerApprovalId: approval.id,
            procurementRevisionId: revisionId,
          };
        },
      );
    });
  }

  /* ------------------------------------------------------------ helpers */

  private async transitionSpecification(
    actor: Actor,
    revisionId: string,
    version: number,
    key: string | undefined,
    target: C.SpecificationState,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const revision = await tx.productSpecificationRevision.findUnique({
        where: { id: revisionId },
        include: { specification: true },
      });
      if (!revision) fail(404, 'NOT_FOUND', 'Specification revision not found.');
      const access = await this.access(tx, actor);
      if (
        !access.specification ||
        !access.designOrganizationIds.includes(revision.specification.ownerOrganizationId)
      )
        fail(403, 'FORBIDDEN', 'Only the owning design organization submits this revision.');
      return this.command(
        tx,
        actor,
        revisionId,
        'specification.submit',
        key,
        { version },
        async () => {
          if (version !== revision.revisionNumber)
            fail(409, 'STALE_VERSION', 'The specification revision changed.');
          if (!C.canTransitionSpecification(revision.status as C.SpecificationState, target))
            fail(
              409,
              'INVALID_TRANSITION',
              'This transition is not allowed from the current state.',
            );
          const updated = await tx.productSpecificationRevision.update({
            where: { id: revisionId },
            data: { status: target, submittedById: actor.id, submittedAt: new Date() },
          });
          await audit(tx, actor, {
            action: 'catalog.specification.submitted',
            targetType: 'ProductSpecificationRevision',
            targetId: revisionId,
            organizationId: revision.specification.ownerOrganizationId,
            after: { status: updated.status, provenance: 'SYNTHETIC' },
          });
          return { id: updated.id, status: updated.status };
        },
      );
    });
  }

  private async sample(tx: Db, actor: Actor, sampleId: string) {
    const sample = await tx.productSampleRequest.findUnique({ where: { id: sampleId } });
    if (!sample) fail(404, 'NOT_FOUND', 'Sample request not found.');
    const access = await this.access(tx, actor);
    if (
      sample.responsibleArtisanProfileId !== access.artisanProfileId &&
      !access.platform &&
      !access.organizationIds.includes(sample.buyerOrganizationId) &&
      !access.organizationIds.includes(sample.operatorOrganizationId)
    )
      fail(404, 'NOT_FOUND', 'Sample request not found.');
    return sample;
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
    const design = members.find(
      (member) =>
        C.permissionsForMembership(member).includes('product.specification.manage') &&
        ['INTERNAL', 'ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(member.organization.type),
    );
    const operators = members
      .filter(
        (member) =>
          member.organization.type === 'INTERNAL' &&
          C.permissionsForMembership(member).includes('operator.production.manage'),
      )
      .map((member) => member.organizationId);
    const artisan = await tx.artisanProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    return {
      artisanProfileId: artisan?.id ?? null,
      designOrganizationIds: members
        .filter((m) => C.permissionsForMembership(m).includes('product.specification.manage'))
        .map((m) => m.organizationId),
      qualityOrganizationIds: members
        .filter(
          (m) =>
            C.permissionsForMembership(m).includes('operator.quality.approve') ||
            C.permissionsForMembership(m).includes('quality.inspection.create'),
        )
        .map((m) => m.organizationId),
      platform: permissions.has('platform.roles.manage'),
      specification:
        permissions.has('product.specification.manage') || permissions.has('platform.roles.manage'),
      sampleRequest:
        permissions.has('buyer.rfq.create') ||
        permissions.has('operator.production.manage') ||
        permissions.has('platform.roles.manage'),
      sampleApproval:
        permissions.has('buyer.quotation.approve') || permissions.has('platform.roles.manage'),
      organizationIds,
      operatorOrganizationIds: operators,
      designOrganizationId: design?.organizationId ?? null,
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
      { actorId: actor.id, resourceId: id, operation: `catalog.${operation}`, key },
      json(input),
      fn,
    );
  }
}
