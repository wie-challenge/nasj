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
import { ProductionOfferService } from './production-offers.js';
import { projectCapacity } from '../artisans/capacity.js';
import { recordCost } from './commercial-decision.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const orderInclude = {
  rfq: { include: { craftSkill: true } },
  offers: true,
  acceptance: { include: { quote: true } },
} as const;
type LoadedOrder = Prisma.CommercialOrderGetPayload<{ include: typeof orderInclude }>;

const planInclude = {
  items: { include: { artisanProfile: { select: { displayName: true } } } },
  overrides: true,
} as const;
type LoadedPlan = Prisma.AllocationPlanGetPayload<{ include: typeof planInclude }>;

@Injectable()
export class ProductionPlanningService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductionOfferService) private readonly offers: ProductionOfferService,
  ) {}

  /**
   * Planning view for one order. Candidates come from the latest persisted eligibility assessment
   * for each artisan, so the ranking reasons shown to the operator are the reasons that were
   * recorded, not reasons invented at read time.
   */
  async workspace(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { order } = await this.gate(tx, actor, orderId);
      const assessments = await tx.eligibilityAssessment.findMany({
        where: { orderId },
        include: { artisanProfile: { include: { associations: { where: { endedAt: null } } } } },
        orderBy: { version: 'desc' },
      });
      // Latest assessment version per artisan.
      const latest = new Map<string, (typeof assessments)[number]>();
      for (const row of assessments)
        if (!latest.has(row.artisanProfileId)) latest.set(row.artisanProfileId, row);
      const declarations = await tx.capacityDeclaration.findMany({
        where: {
          artisanProfileId: { in: [...latest.keys()] },
          supersededAt: null,
          craftSkillId: order.rfq.craftSkillId,
          unitType: 'PIECES',
        },
      });
      const candidates: C.RankingCandidate[] = [...latest.values()].map((row) => ({
        artisanProfileId: row.artisanProfileId,
        displayName: row.artisanProfile.displayName,
        associationName: null,
        decision: row.decision as C.EligibilityDecision,
        knownRemaining: row.knownRemaining === null ? null : Number(row.knownRemaining).toFixed(2),
        declaredPieces: (() => {
          const declaration = declarations.find(
            (d) =>
              d.artisanProfileId === row.artisanProfileId &&
              d.effectiveFrom.getTime() === row.periodFrom?.getTime() &&
              d.effectiveTo.getTime() === row.periodTo?.getTime(),
          );
          return declaration ? Number(declaration.quantity) : null;
        })(),
        unitType: (row.unitType as 'HOURS' | 'PIECES' | null) ?? null,
        periodFrom: row.periodFrom?.toISOString() ?? null,
        periodTo: row.periodTo?.toISOString() ?? null,
        reasons: row.reasons as C.EligibilityFinding[],
        unknown: row.unknowns as string[],
      }));
      const unitCompatible = candidates.every(
        (candidate) => candidate.unitType === null || candidate.unitType === 'PIECES',
      );
      const ranked = C.rankCandidates({
        candidates,
        requiredQuantity: order.rfq.quantity,
        unitCompatible,
      });
      const suggestion = C.suggestAllocation({
        requiredQuantity: order.rfq.quantity,
        candidates: ranked.candidates,
      });
      const plans = await tx.allocationPlan.findMany({
        where: { orderId },
        include: planInclude,
        orderBy: { version: 'desc' },
        take: 20,
      });
      const view: C.PlanningWorkspaceView = {
        orderId,
        orderVersion: order.version,
        craftSkillId: order.rfq.craftSkillId,
        craftName: order.rfq.craftSkill.name,
        requiredQuantity: order.rfq.quantity,
        deadline: order.rfq.deliveryAt.toISOString(),
        materialReadiness: await this.materialReadiness(tx, orderId),
        planningPolicyVersion: C.PLANNING_POLICY_VERSION,
        candidates: ranked.candidates.map((candidate) => ({
          ...candidate,
          craftName: order.rfq.craftSkill.name,
        })),
        rankingWeights: C.rankingWeights,
        ranked: {
          policyVersion: ranked.policyVersion,
          weightVersion: ranked.weightVersion,
          candidates: ranked.candidates,
        },
        suggestion,
        plans: plans.map((plan) => this.planView(plan)),
        truncated: assessments.length >= 100,
        limitations: [
          'Ranking is advisory. A person decides which groups are offered work.',
          'Capacity that is unknown is shown as review, never assumed to be zero or unlimited.',
          'No health, wearable or decline-history signal participates in this ranking.',
          ...(unitCompatible
            ? []
            : ['Some capacity is recorded in hours. Hours are never converted to pieces.']),
        ],
      };
      return view;
    });
  }

  async createPlan(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.allocationPlanCreateSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { order } = await this.gate(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'plan.create', key, input, async () => {
        if (order.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This order changed. Reload before planning.');
        if (input.requiredQuantity !== order.rfq.quantity)
          fail(
            409,
            'QUANTITY_MISMATCH',
            'An allocation plan covers exactly the accepted order quantity.',
          );
        await this.assertCandidates(tx, orderId, input.lines);
        const version =
          ((await tx.allocationPlan.aggregate({ where: { orderId }, _max: { version: true } }))._max
            .version ?? 0) + 1;
        const created = await tx.allocationPlan.create({
          data: {
            orderId,
            version,
            state: 'DRAFT',
            materialAssumptions: json(input.materialAssumptions),
            requiredQuantity: input.requiredQuantity,
            policyVersion: C.PLANNING_POLICY_VERSION,
            authorId: actor.id,
            items: {
              create: input.lines.map((line) => ({
                artisanProfileId: line.artisanProfileId,
                quantity: line.quantity,
                state: 'DRAFT',
              })),
            },
          },
          include: planInclude,
        });
        await this.snapshot(tx, actor, order, created);
        await audit(tx, actor, {
          action: 'planning.allocation.created',
          targetType: 'AllocationPlan',
          targetId: created.id,
          organizationId: order.rfq.operatorOrganizationId,
          after: {
            version,
            required: input.requiredQuantity,
            allocated: input.lines.reduce((sum, line) => sum + line.quantity, 0),
            groups: input.lines.length,
            provenance: 'SYNTHETIC',
          },
        });
        return this.planView(created);
      });
    });
  }

  async reviewPlan(
    actor: Actor,
    planId: string,
    input: { version: number; confirm: true },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const plan = await tx.allocationPlan.findUnique({
        where: { id: planId },
        include: planInclude,
      });
      if (!plan) fail(404, 'NOT_FOUND', 'Allocation plan not found.');
      const { order } = await this.gate(tx, actor, plan.orderId);
      return this.command(tx, actor, planId, 'plan.review', key, input, async () => {
        if (plan.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This plan changed. Reload before reviewing it.');
        if (plan.state !== 'DRAFT')
          fail(409, 'INVALID_TRANSITION', 'Only a draft plan can be reviewed.');
        const validation = await this.validate(tx, plan);
        if (!validation.valid)
          fail(
            409,
            'ALLOCATION_INVALID',
            `This plan breaks a capacity or eligibility rule: ${validation.violations.join(', ')}.`,
          );
        const reviewed = await tx.allocationPlan.update({
          where: { id: planId },
          data: {
            state: 'REVIEWED',
            reviewedById: actor.id,
            reviewedAt: new Date(),
            version: { increment: 1 },
          },
          include: planInclude,
        });
        await audit(tx, actor, {
          action: 'planning.allocation.reviewed',
          targetType: 'AllocationPlan',
          targetId: planId,
          organizationId: order.rfq.operatorOrganizationId,
          after: {
            state: 'REVIEWED',
            allocated: validation.allocated,
            unallocated: validation.unallocated,
            provenance: 'SYNTHETIC',
          },
        });
        return this.planView(reviewed);
      });
    });
  }

  /** Create correctly scoped offers for a reviewed plan through the existing offer service. */
  async issueOffers(
    actor: Actor,
    planId: string,
    input: { version: number; expiresAt: string },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const plan = await tx.allocationPlan.findUnique({
        where: { id: planId },
        include: planInclude,
      });
      if (!plan) fail(404, 'NOT_FOUND', 'Allocation plan not found.');
      const { order } = await this.gate(tx, actor, plan.orderId);
      return this.command(tx, actor, planId, 'plan.offer', key, input, async () => {
        if (plan.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This plan changed. Reload before offering it.');
        await this.assertCandidates(tx, plan.orderId, plan.items);
        if (plan.state !== 'REVIEWED')
          fail(409, 'INVALID_TRANSITION', 'Review the allocation plan before creating offers.');
        if (new Date(input.expiresAt) <= new Date())
          fail(400, 'OFFER_EXPIRY_INVALID', 'An offer must expire in the future.');
        const eligible = await this.eligibility(tx, plan.orderId);
        const created: string[] = [];
        for (const item of plan.items) {
          if (item.state !== 'DRAFT') continue;
          const assessment = eligible.get(item.artisanProfileId);
          if (!assessment)
            fail(409, 'ELIGIBILITY_MISSING', 'Assess eligibility before offering this allocation.');
          const preparedOffer = await this.offers.createOffer(
            actor,
            plan.orderId,
            {
              version: (await tx.commercialOrder.findUniqueOrThrow({ where: { id: plan.orderId } }))
                .version,
              eligibilityId: assessment,
              quantity: item.quantity,
              expiresAt: input.expiresAt,
              materials: 'As recorded in the accepted quotation.',
              reworkTerms: 'Rework is agreed in writing before any remedial work begins.',
              paymentConditions: 'Payable on accepted output under the accepted quotation.',
              collectionArrangement: 'Collection is arranged with the assigned coordinator.',
              instructions: 'Follow the approved specification version for this order.',
            },
            `planning-${plan.id}-${item.id}`,
            tx,
          );
          if (!('id' in preparedOffer))
            fail(500, 'OFFER_PREPARATION_FAILED', 'The offer was not created.');
          const versionedOffer = await tx.commercialOffer.findUniqueOrThrow({
            where: { id: preparedOffer.id },
          });
          await this.offers.issue(
            actor,
            versionedOffer.id,
            { version: versionedOffer.version },
            `planning-issue-${plan.id}-${item.id}`,
            tx,
          );
          await tx.allocationPlanItem.update({
            where: { id: item.id },
            data: { state: 'OFFERED', offerId: preparedOffer.id },
          });
          created.push(preparedOffer.id);
        }
        const updated = await tx.allocationPlan.update({
          where: { id: planId },
          data: { state: created.length ? 'OFFERED' : plan.state, version: { increment: 1 } },
          include: planInclude,
        });
        await audit(tx, actor, {
          action: 'planning.allocation.offered',
          targetType: 'AllocationPlan',
          targetId: planId,
          organizationId: order.rfq.operatorOrganizationId,
          after: { offers: created.length, provenance: 'SYNTHETIC' },
        });
        return this.planView(updated);
      });
    });
  }

  /**
   * Recompute item states from the authoritative offers and propose replacements for declined or
   * expired quantity. Accepted work is never released or replaced.
   */
  async reallocate(
    actor: Actor,
    planId: string,
    input: { version: number; artisanProfileIds: string[] },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const plan = await tx.allocationPlan.findUnique({
        where: { id: planId },
        include: planInclude,
      });
      if (!plan) fail(404, 'NOT_FOUND', 'Allocation plan not found.');
      const { order } = await this.gate(tx, actor, plan.orderId);
      return this.command(tx, actor, planId, 'plan.reallocate', key, input, async () => {
        if (plan.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This plan changed. Reload before reallocating.');
        const offers = await tx.commercialOffer.findMany({
          where: { id: { in: plan.items.flatMap((item) => (item.offerId ? [item.offerId] : [])) } },
          select: { id: true, status: true, expiresAt: true, quantity: true },
        });
        const now = new Date();
        const sources: { itemId: string; offerId: string; quantity: number; reason: string }[] = [];
        let released = 0;
        for (const item of plan.items) {
          if (!item.offerId || ['DECLINED', 'EXPIRED', 'RELEASED'].includes(item.state)) continue;
          const offer = offers.find((row) => row.id === item.offerId);
          if (!offer) continue;
          if (offer.status === 'ACCEPTED') {
            await tx.allocationPlanItem.update({
              where: { id: item.id },
              data: { state: 'ACCEPTED' },
            });
            item.state = 'ACCEPTED';
            continue;
          }
          if (
            offer.status === 'DECLINED' ||
            (offer.status === 'OFFERED' && offer.expiresAt <= now)
          ) {
            const state = offer.status === 'DECLINED' ? 'DECLINED' : 'EXPIRED';
            const quantity = C.releasableQuantity({
              quantity: item.quantity,
              state,
              accepted: false,
            });
            released += quantity;
            sources.push({ itemId: item.id, offerId: offer.id, quantity, reason: state });
            await tx.allocationPlanItem.update({
              where: { id: item.id },
              data: { state, releasedQuantity: quantity },
            });
          }
        }
        const accepted = plan.items.filter((item) => item.state === 'ACCEPTED').length;
        const updated = await tx.allocationPlan.update({
          where: { id: planId },
          data: {
            state: accepted ? 'PARTIALLY_ACCEPTED' : plan.state,
            version: { increment: 1 },
          },
          include: planInclude,
        });
        const replacements = input.artisanProfileIds.length
          ? await this.replacementCandidates(
              tx,
              order,
              input.artisanProfileIds,
              updated.items.reduce((sum, item) => sum + item.releasedQuantity, 0),
              now,
              (plan.materialAssumptions as { readiness?: 'READY' | 'NOT_READY' | 'UNKNOWN' })
                .readiness ?? 'UNKNOWN',
            )
          : [];
        await audit(tx, actor, {
          action: 'planning.reallocation.proposed',
          targetType: 'AllocationPlan',
          targetId: planId,
          organizationId: order.rfq.operatorOrganizationId,
          after: {
            released,
            proposed: replacements.length,
            acceptedPreserved: accepted,
            releasedOfferIds: sources.map((source) => source.offerId),
            replacementCandidateIds: replacements.map((candidate) => candidate.artisanProfileId),
            evaluationSnapshot: 'Persisted in the keyed planning command outcome.',
            replacementReason:
              'Declined or expired offer; original artisan remains eligible without penalty.',
            provenance: 'SYNTHETIC',
          },
        });
        return {
          plan: this.planView(updated),
          released,
          replacementSources: sources,
          replacements: replacements.map((candidate) => ({
            ...candidate,
            replacementForOfferIds: updated.items.flatMap((item) =>
              item.offerId && item.releasedQuantity > 0 ? [item.offerId] : [],
            ),
            reason: 'Voluntary replanning after decline or expiry; no penalty.',
            materialAssumptions: plan.materialAssumptions,
          })),
        };
      });
    });
  }

  async override(actor: Actor, input: z.infer<typeof C.allocationOverrideSchema>, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const plan = await tx.allocationPlan.findUnique({
        where: { id: input.planId },
        include: planInclude,
      });
      if (!plan) fail(404, 'NOT_FOUND', 'Allocation plan not found.');
      const { order } = await this.gate(tx, actor, plan.orderId);
      return this.command(tx, actor, input.planId, 'plan.override', key, input, async () => {
        if (plan.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This plan changed. Reload before overriding it.');
        // Overrides change advisory ordering and group choice. They cannot bypass hard constraints.
        const eligible = await this.eligibility(tx, plan.orderId);
        const evaluation = eligible.get(input.artisanProfileId);
        if (!evaluation)
          fail(
            409,
            'ELIGIBILITY_MISSING',
            'Assess eligibility before overriding a recommendation.',
          );
        const assessment = await tx.eligibilityAssessment.findUniqueOrThrow({
          where: { id: evaluation },
        });
        if (assessment.decision !== 'ELIGIBLE')
          fail(
            409,
            'HARD_CONSTRAINT',
            'An override cannot select a group that fails a hard eligibility constraint.',
          );
        if (assessment.knownRemaining === null)
          fail(
            409,
            'CAPACITY_UNKNOWN',
            'An override cannot allocate quantity against unknown capacity.',
          );
        if (Number(assessment.knownRemaining) < input.quantity)
          fail(
            409,
            'CAPACITY_EXCEEDED',
            'An override cannot allocate more than the documented remaining capacity.',
          );
        if (plan.state !== 'DRAFT' && plan.state !== 'REVIEWED')
          fail(409, 'INVALID_TRANSITION', 'Only a draft or reviewed plan can be overridden.');
        const existing = plan.items.find(
          (item) => item.artisanProfileId === input.artisanProfileId,
        );
        if (existing)
          await tx.allocationPlanItem.update({
            where: { id: existing.id },
            data: { quantity: input.quantity },
          });
        else
          await tx.allocationPlanItem.create({
            data: {
              planId: plan.id,
              artisanProfileId: input.artisanProfileId,
              quantity: input.quantity,
              state: 'DRAFT',
            },
          });
        const recorded = await tx.allocationOverride.create({
          data: {
            planId: plan.id,
            originalRecommendation: json({
              suggestion: plan.items.map((item) => ({
                artisanProfileId: item.artisanProfileId,
                quantity: item.quantity,
              })),
              policyVersion: plan.policyVersion,
              recommendationId: plan.recommendationId,
              weights: C.rankingWeights,
            }),
            selectedAlternative: json({
              artisanProfileId: input.artisanProfileId,
              quantity: input.quantity,
            }),
            actingUserId: actor.id,
            businessScope: order.rfq.operatorOrganizationId,
            explanation: input.reason,
            decisionVersion: plan.version,
          },
        });
        const updated = await tx.allocationPlan.update({
          where: { id: plan.id },
          data: { state: 'DRAFT', reviewedAt: null, reviewedById: null, version: { increment: 1 } },
          include: planInclude,
        });
        await this.assertCandidates(tx, plan.orderId, updated.items);
        await audit(tx, actor, {
          action: 'planning.override.recorded',
          targetType: 'AllocationOverride',
          targetId: recorded.id,
          organizationId: order.rfq.operatorOrganizationId,
          reason: input.reason,
          after: {
            artisanProfileId: input.artisanProfileId,
            quantity: input.quantity,
            decisionVersion: plan.version,
            provenance: 'SYNTHETIC',
          },
        });
        return this.planView(updated);
      });
    });
  }

  async pricing(actor: Actor, orderId: string, input: z.infer<typeof C.pricingAssumptionSchema>) {
    return iamTransaction(this.db, actor, async (tx) => {
      const order = await tx.commercialOrder.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: order.rfq.operatorOrganizationId,
          status: 'ACTIVE',
          organization: { approvalStatus: 'APPROVED', type: 'INTERNAL' },
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (
        !member ||
        !C.permissionsForMembership(member).some((permission) =>
          ['operator.quotation.prepare', 'finance.quotation.read'].includes(permission),
        )
      )
        fail(
          403,
          'FORBIDDEN',
          'A scoped finance or quotation role is required to edit advisory pricing.',
        );
      const quote = order.acceptance?.quote;
      const suggestion = C.suggestPricing(input);
      return {
        ...suggestion,
        orderId,
        acceptedQuoteTotalTnd: quote ? C.formatTnd(quote.totalMillimes) : null,
        quoteStanding: quote?.status ?? null,
        missing: [...new Set([...suggestion.missing, ...(quote ? [] : ['ACCEPTED_QUOTATION'])])],
        limitations: [
          ...suggestion.limitations,
          'This calculation does not change the accepted quotation. A revision uses the versioned quotation workflow.',
        ],
      };
    });
  }

  async pricingHandoff(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.pricingHandoffSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { order } = await this.gate(tx, actor, orderId);
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: order.rfq.operatorOrganizationId,
          status: 'ACTIVE',
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (!member || !C.permissionsForMembership(member).includes('operator.quotation.prepare'))
        fail(
          403,
          'FORBIDDEN',
          'Quotation preparation authority is required to approve a costing handoff.',
        );
      return this.command(tx, actor, orderId, 'pricing.handoff', key, input, async () => {
        const target = await tx.commercialRfq.findUnique({ where: { id: input.targetRfqId } });
        if (
          !target ||
          target.operatorOrganizationId !== order.rfq.operatorOrganizationId ||
          target.buyerOrganizationId !== order.rfq.buyerOrganizationId
        )
          fail(404, 'NOT_FOUND', 'Target request not found.');
        if (target.version !== input.targetVersion)
          fail(409, 'VERSION_CONFLICT', 'Reload the target request before approving costing.');
        if (await tx.commercialOrder.findUnique({ where: { rfqId: target.id } }))
          fail(
            409,
            'ALREADY_ACCEPTED',
            'Accepted quotations remain immutable. Use a new request and obtain fresh buyer acceptance.',
          );
        if (input.assumptions.quantity !== target.quantity)
          fail(
            409,
            'QUANTITY_MISMATCH',
            'The costing assumptions must match the target request quantity.',
          );
        const suggestion = C.suggestPricing(input.assumptions);
        const lines = [
          {
            category: 'ARTISAN_LABOR' as const,
            basis: 'VARIABLE' as const,
            rateTnd: input.assumptions.artisanUnitTnd,
          },
          {
            category: 'MATERIALS' as const,
            basis: 'VARIABLE' as const,
            rateTnd: input.assumptions.materialsUnitTnd,
          },
          {
            category: 'QUALITY_ASSURANCE' as const,
            basis: 'VARIABLE' as const,
            rateTnd: input.assumptions.qualityUnitTnd,
          },
          {
            category: 'PACKAGING' as const,
            basis: 'VARIABLE' as const,
            rateTnd: input.assumptions.packagingUnitTnd,
          },
          {
            category: 'LOGISTICS' as const,
            basis: 'FIXED' as const,
            rateTnd: input.assumptions.transportFixedTnd,
          },
          {
            category: 'OVERHEAD' as const,
            basis: 'FIXED' as const,
            rateTnd: input.assumptions.overheadFixedTnd,
          },
          {
            category: 'CONTINGENCY' as const,
            basis: 'FIXED' as const,
            rateTnd: suggestion.contingencyTnd,
          },
        ];
        const cost = await recordCost(tx, actor, target, {
          feasibilityId: input.feasibilityId,
          marginMethod: 'NONE',
          marginBasisPoints: 0,
          lines,
        });
        await audit(tx, actor, {
          action: 'planning.pricing.approved_handoff',
          targetType: 'CostEstimate',
          targetId: cost.id,
          organizationId: target.operatorOrganizationId,
          reason: input.reviewReference,
          after: {
            sourceOrderId: orderId,
            targetRfqId: target.id,
            assumptionSource: suggestion.assumptionSource,
            totalCostTnd: suggestion.totalCostTnd,
            quoteIssued: false,
          },
        });
        return {
          ...cost,
          targetRfqId: target.id,
          quoteIssued: false,
          quoteIssuePath: `/api/v1/procurement/rfqs/${target.id}/costed-quotes`,
          requiresAuthorizedQuoteIssue: true,
        };
      });
    });
  }

  async simulate(
    actor: Actor,
    orderId: string,
    input: z.infer<typeof C.deliverySimulationSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { order } = await this.gate(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'simulate', key, input, async () => {
        if (order.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This order changed. Reload before simulating.');
        const result = C.simulateDelivery({
          requiredQuantity: order.rfq.quantity,
          startDate: input.startDate,
          deadline: input.deadline,
          scenarios: input.scenarios,
        });
        const capacitySnapshot = await tx.capacityDeclaration.findMany({
          where: {
            artisanProfileId: {
              in: input.scenarios.flatMap((scenario) =>
                scenario.lines.map((line) => line.artisanProfileId),
              ),
            },
            craftSkillId: order.rfq.craftSkillId,
            unitType: 'PIECES',
            supersededAt: null,
          },
          select: { id: true, artisanProfileId: true, version: true },
        });
        await tx.scheduleScenario.create({
          data: {
            orderId,
            name: input.scenarios
              .map((scenario) => scenario.name)
              .join(' / ')
              .slice(0, 180),
            requiredQuantity: order.rfq.quantity,
            startDate: new Date(input.startDate),
            deadline: new Date(input.deadline),
            result: json({ ...result, inputSnapshot: input, capacitySnapshot }),
            assumptions: json(result.assumptions),
            policyVersion: C.PLANNING_POLICY_VERSION,
            authorId: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'planning.delivery.simulated',
          targetType: 'CommercialOrder',
          targetId: orderId,
          organizationId: order.rfq.operatorOrganizationId,
          after: {
            scenarios: result.scenarios.length,
            policyVersion: C.PLANNING_POLICY_VERSION,
            provenance: 'SYNTHETIC',
          },
        });
        return result;
      });
    });
  }

  /* ---------------------------------------------------------------- helpers */

  async overrideHistory(actor: Actor, orderId: string, purpose: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { order } = await this.gate(tx, actor, orderId);
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId: order.rfq.operatorOrganizationId,
          status: 'ACTIVE',
        },
        include: { roles: true, permissionGrants: true, organization: true },
      });
      if (!member || !C.permissionsForMembership(member).includes('audit.read.scoped'))
        fail(403, 'FORBIDDEN', 'Scoped audit permission is required.');
      await audit(tx, actor, {
        action: 'planning.audit.reviewed',
        targetType: 'CommercialOrder',
        targetId: orderId,
        organizationId: order.rfq.operatorOrganizationId,
        reason: purpose,
      });
      return {
        purpose,
        snapshots: await tx.recommendationSnapshot.findMany({
          where: { orderId },
          include: { policy: true },
        }),
        overrides: await tx.allocationOverride.findMany({
          where: { plan: { orderId } },
          orderBy: { createdAt: 'asc' },
        }),
        findings: (
          await tx.auditEvent.findMany({
            where: { targetId: orderId, action: 'intelligence.audit.finding' },
            select: { id: true, actorId: true, timestamp: true, reason: true, after: true },
            orderBy: { timestamp: 'asc' },
          })
        ).map((row) => ({ ...row, createdAt: row.timestamp.toISOString() })),
      };
    });
  }

  private async materialReadiness(
    tx: Db,
    orderId: string,
  ): Promise<'READY' | 'NOT_READY' | 'UNKNOWN'> {
    const requirements = await tx.batchMaterialRequirement.findMany({
      where: { batch: { orderId } },
      select: { readiness: true },
    });
    if (!requirements.length) return 'UNKNOWN';
    return requirements.every((row) => row.readiness === 'READY') ? 'READY' : 'NOT_READY';
  }

  private async gate(tx: Db, actor: Actor, orderId: string) {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      include: orderInclude,
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
        member.organization.type === 'INTERNAL' &&
        C.permissionsForMembership(member).includes('operator.production.manage'),
    );
    const assigned = internal
      ? await tx.operatorAssignment.findFirst({
          where: {
            operatorId: actor.id,
            organizationId: order.rfq.buyerOrganizationId,
            revokedAt: null,
          },
        })
      : null;
    if (!assigned)
      fail(403, 'FORBIDDEN', 'An assigned production operator is required to plan work.');
    return { order };
  }

  private async eligibility(tx: Db, orderId: string) {
    const rows = await tx.eligibilityAssessment.findMany({
      where: { orderId },
      orderBy: { version: 'desc' },
      select: { id: true, artisanProfileId: true },
    });
    const latest = new Map<string, string>();
    for (const row of rows)
      if (!latest.has(row.artisanProfileId)) latest.set(row.artisanProfileId, row.id);
    return latest;
  }

  private async assertCandidates(
    tx: Db,
    orderId: string,
    lines: { artisanProfileId: string; quantity: number }[],
  ) {
    const eligible = await this.eligibility(tx, orderId);
    const assessments = await tx.eligibilityAssessment.findMany({
      where: { id: { in: [...eligible.values()] } },
    });
    const byProfile = new Map(assessments.map((row) => [row.artisanProfileId, row]));
    for (const line of lines) {
      const assessment = byProfile.get(line.artisanProfileId);
      if (!assessment)
        fail(
          409,
          'ELIGIBILITY_MISSING',
          'Assess eligibility for every group in a plan before allocating to it.',
        );
      if (assessment.decision !== 'ELIGIBLE')
        fail(
          409,
          'CANDIDATE_INELIGIBLE',
          'A group that fails a hard constraint cannot be planned.',
        );
      if (assessment.knownRemaining === null)
        fail(
          409,
          'CAPACITY_UNKNOWN',
          'Cannot allocate against unknown capacity. Review or record capacity first.',
        );
      if (Number(assessment.knownRemaining) < line.quantity)
        fail(409, 'CAPACITY_EXCEEDED', 'Allocated quantity exceeds documented remaining capacity.');
    }
    const total = lines.reduce((sum, line) => sum + line.quantity, 0);
    const order = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { rfq: true },
    });
    if (total > order.rfq.quantity)
      fail(409, 'OVER_ALLOCATED', 'Allocated quantity exceeds the accepted order quantity.');
  }

  private async validate(tx: Db, plan: LoadedPlan): Promise<C.AllocationValidation> {
    const eligible = await this.eligibility(tx, plan.orderId);
    const assessments = await tx.eligibilityAssessment.findMany({
      where: { id: { in: [...eligible.values()] } },
    });
    const byProfile = new Map(assessments.map((row) => [row.artisanProfileId, row]));
    return C.validateAllocation({
      requiredQuantity: plan.requiredQuantity,
      materialReadiness:
        (plan.materialAssumptions as { readiness?: 'READY' | 'NOT_READY' | 'UNKNOWN' }).readiness ??
        (await this.materialReadiness(tx, plan.orderId)),
      lines: plan.items.map((item) => {
        const assessment = byProfile.get(item.artisanProfileId);
        return {
          artisanProfileId: item.artisanProfileId,
          quantity: item.quantity,
          availablePieces:
            assessment?.knownRemaining === null || !assessment
              ? null
              : Math.floor(Number(assessment.knownRemaining)),
          unitType: (assessment?.unitType as 'HOURS' | 'PIECES' | null) ?? null,
          needsReview: assessment?.decision !== 'ELIGIBLE',
        };
      }),
    });
  }

  private async replacementCandidates(
    tx: Db,
    order: LoadedOrder,
    profileIds: string[],
    quantity: number,
    now: Date,
    planMaterialReadiness: 'READY' | 'NOT_READY' | 'UNKNOWN',
  ) {
    const orderId = order.id;
    const requirements = await tx.batchMaterialRequirement.findMany({
      where: { batch: { orderId } },
      select: { readiness: true },
    });
    const currentMaterials = requirements.length
      ? requirements.every((row) => row.readiness === 'READY')
        ? 'READY'
        : 'UNKNOWN'
      : planMaterialReadiness;
    const recorded = await tx.scheduleScenario.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    const offers = await tx.commercialOffer.findMany({
      where: {
        orderId,
        artisanProfileId: { in: profileIds },
        OR: [
          { status: 'ACCEPTED' },
          { status: { in: ['OFFERED', 'PLANNED'] }, expiresAt: { gt: now } },
        ],
      },
      select: { artisanProfileId: true },
    });
    const busy = new Set(offers.map((row) => row.artisanProfileId));
    const eligible = await this.eligibility(tx, orderId);
    const assessments = await tx.eligibilityAssessment.findMany({
      where: { id: { in: [...eligible.values()] } },
    });
    const result = [];
    for (const row of assessments) {
      if (
        !profileIds.includes(row.artisanProfileId) ||
        row.decision !== 'ELIGIBLE' ||
        busy.has(row.artisanProfileId) ||
        row.unitType !== 'PIECES' ||
        !row.periodFrom ||
        !row.periodTo
      )
        continue;
      const profile = await tx.artisanProfile.findUnique({
        where: { id: row.artisanProfileId },
        include: {
          user: true,
          skills: true,
          managements: { where: { endedAt: null }, include: { organization: true } },
          authorizations: {
            where: { withdrawnAt: null, purpose: 'PARTICIPATION', policy: { active: true } },
          },
        },
      });
      if (
        profile?.participantStatus !== 'ACTIVE' ||
        profile.availabilityStatus !== 'AVAILABLE' ||
        !profile.managements.some((link) => link.organization.approvalStatus === 'APPROVED')
      )
        continue;
      if (profile.userId) {
        if (
          profile.user?.status !== 'ACTIVE' ||
          !profile.user.emailVerified ||
          !(await tx.consentRecord.findFirst({
            where: {
              userId: profile.userId,
              purpose: 'artisan.profile',
              decision: true,
              withdrawnAt: null,
            },
          }))
        )
          continue;
      } else if (!profile.authorizations.length) continue;
      if (!profile.skills.some((skill) => skill.craftSkillId === order.rfq.craftSkillId)) continue;
      const declaration = await tx.capacityDeclaration.findFirst({
        where: {
          artisanProfileId: profile.id,
          craftSkillId: order.rfq.craftSkillId,
          unitType: 'PIECES',
          effectiveFrom: row.periodFrom,
          effectiveTo: row.periodTo,
          supersededAt: null,
        },
        orderBy: { version: 'desc' },
      });
      if (!declaration) continue;
      const capacity = await projectCapacity(tx, declaration, now);
      if (!capacity.availabilityKnown || declaration.effectiveTo <= now) continue;
      // Period budgets are never converted into a production rate. Only an explicitly reviewed
      // operator simulation supplies throughput, lead times and buffers; current holds are reread.
      const source = recorded.find((entry) => {
        const snapshot = entry.result as unknown as {
          inputSnapshot?: z.infer<typeof C.deliverySimulationSchema>;
          capacitySnapshot?: { id: string; version: number; artisanProfileId: string }[];
        };
        return (
          snapshot.inputSnapshot?.reviewedAssumptions &&
          snapshot.inputSnapshot.scenarios.some((scenario) =>
            scenario.lines.some((line) => line.artisanProfileId === profile.id),
          ) &&
          snapshot.capacitySnapshot?.some(
            (item) => item.id === declaration.id && item.version === declaration.version,
          )
        );
      });
      const saved = source?.result as unknown as
        | { inputSnapshot?: z.infer<typeof C.deliverySimulationSchema> }
        | undefined;
      const input = saved?.inputSnapshot;
      const alternatives =
        input?.scenarios.flatMap((scenario) =>
          scenario.lines.filter((line) => line.artisanProfileId === profile.id),
        ) ?? [];
      const documented = alternatives[0];
      const ambiguous = alternatives.some(
        (line) => JSON.stringify(line) !== JSON.stringify(documented),
      );
      const reviewed = input?.reviewedAssumptions;
      const start = new Date(
        Math.max(
          now.getTime(),
          declaration.effectiveFrom.getTime(),
          input ? new Date(input.startDate).getTime() : now.getTime(),
        ),
      );
      const allowances = reviewed ? reviewed.leadTimeDays + reviewed.bufferDays : 0;
      const deadline = new Date(
        Math.min(
          order.rfq.deliveryAt.getTime(),
          declaration.effectiveTo.getTime(),
          input ? new Date(input.deadline).getTime() : Infinity,
        ) -
          allowances * 86400000,
      );
      const weeks = Math.max(
        1,
        Math.ceil(
          (declaration.effectiveTo.getTime() - declaration.effectiveFrom.getTime()) /
            (7 * 86400000),
        ),
      );
      const simulationInput = {
        requiredQuantity: quantity,
        startDate: start.toISOString(),
        deadline: deadline.toISOString(),
        scenarios: [
          {
            name: 'Replacement of declined or expired quantity',
            lines: [
              {
                artisanProfileId: profile.id,
                quantity,
                weeklyPieces: documented && !ambiguous ? documented.weeklyPieces : null,
                committedPieces: Number(capacity.committed) + Number(capacity.reserved),
                committedWeeks: weeks,
                availableFrom: documented?.availableFrom ?? start.toISOString(),
                materialReadiness:
                  currentMaterials === 'READY'
                    ? (documented?.materialReadiness ?? 'UNKNOWN')
                    : 'UNKNOWN',
                materialReadyAt: documented?.materialReadyAt,
              },
            ],
          },
        ],
      };
      const simulation = C.simulateDelivery(simulationInput);
      const evaluation = simulation.scenarios[0];
      const deliveryFeasibility =
        quantity > Number(capacity.remaining) ? 'INFEASIBLE' : evaluation.deadlineFeasible;
      result.push({
        artisanProfileId: profile.id,
        knownRemaining: capacity.remaining,
        deliveryFeasibility,
        explanation:
          quantity > Number(capacity.remaining)
            ? 'Replacement quantity exceeds current unreserved period capacity.'
            : !documented || ambiguous
              ? 'Reviewed unambiguous throughput and dated assumptions are missing for the current capacity declaration.'
              : 'Deterministic simulation using reviewed dated assumptions and current capacity holds.',
        evidence: {
          asOf: now.toISOString(),
          assessmentId: row.id,
          capacity,
          sourceScenarioId: source?.id ?? null,
          reviewedAssumptions: reviewed ?? null,
          currentMaterialReadiness: currentMaterials,
          simulationInput,
          simulation,
        },
      });
    }
    return result;
  }

  private async snapshot(tx: Db, actor: Actor, order: LoadedOrder, plan: LoadedPlan) {
    let policy = await tx.recommendationPolicy.findFirst({
      where: { version: C.PLANNING_POLICY_VERSION },
    });
    if (!policy)
      policy = await tx.recommendationPolicy.create({
        data: {
          version: C.PLANNING_POLICY_VERSION,
          name: 'Deterministic eligibility ranking',
          inputs: json({ requiredInputs: C.requiredRankingInputs, weights: C.rankingWeights }),
          excluded: json([
            'wearable participation',
            'health or strain records',
            'medical conditions',
            'protected demographics',
            'offer decline history',
          ]),
          active: true,
        },
      });
    const assessments = await tx.eligibilityAssessment.findMany({
      where: { orderId: order.id },
      orderBy: { version: 'desc' },
      include: { artisanProfile: true },
    });
    const unique = [
      ...new Map(
        assessments
          .slice()
          .reverse()
          .map((row) => [row.artisanProfileId, row]),
      ).values(),
    ];
    const declarations = await tx.capacityDeclaration.findMany({
      where: {
        artisanProfileId: { in: unique.map((row) => row.artisanProfileId) },
        craftSkillId: order.rfq.craftSkillId,
        supersededAt: null,
        unitType: 'PIECES',
      },
    });
    const ranking = C.rankCandidates({
      requiredQuantity: plan.requiredQuantity,
      unitCompatible: true,
      candidates: unique.map((row) => ({
        artisanProfileId: row.artisanProfileId,
        displayName: row.artisanProfile.displayName,
        associationName: null,
        decision: row.decision as C.EligibilityDecision,
        knownRemaining: row.knownRemaining?.toString() ?? null,
        declaredPieces: (() => {
          const d = declarations.find(
            (d) =>
              d.artisanProfileId === row.artisanProfileId &&
              d.effectiveFrom.getTime() === row.periodFrom?.getTime() &&
              d.effectiveTo.getTime() === row.periodTo?.getTime(),
          );
          return d ? Number(d.quantity) : null;
        })(),
        unitType: row.unitType as 'HOURS' | 'PIECES' | null,
        periodFrom: row.periodFrom?.toISOString() ?? null,
        periodTo: row.periodTo?.toISOString() ?? null,
        reasons: row.reasons as C.EligibilityFinding[],
        unknown: row.unknowns as string[],
      })),
    });
    const recordedSnapshot = await tx.recommendationSnapshot.create({
      data: {
        policyId: policy.id,
        orderId: order.id,
        requiredQuantity: plan.requiredQuantity,
        craftSkillId: order.rfq.craftSkillId,
        candidates: json(ranking.candidates),
        suggestion: json({
          policyVersion: plan.policyVersion,
          weights: C.rankingWeights,
          allocation: plan.items.map((item) => ({
            artisanProfileId: item.artisanProfileId,
            quantity: item.quantity,
          })),
        }),
        limitations: json(['Advisory only.', 'Unknown capacity is not treated as zero.']),
        authorId: actor.id,
      },
    });
    await tx.allocationPlan.update({
      where: { id: plan.id },
      data: { recommendationId: recordedSnapshot.id },
    });
  }

  private planView(plan: LoadedPlan): C.AllocationPlanView {
    const sum = (states: string[]) =>
      plan.items
        .filter((item) => states.includes(item.state))
        .reduce((n, item) => n + item.quantity, 0);
    const allocated = plan.items.reduce(
      (n, item) => n + Math.max(0, item.quantity - item.releasedQuantity),
      0,
    );
    return {
      id: plan.id,
      orderId: plan.orderId,
      version: plan.version,
      state: plan.state as C.AllocationPlanState,
      requiredQuantity: plan.requiredQuantity,
      policyVersion: plan.policyVersion,
      createdAt: plan.createdAt.toISOString(),
      reviewedAt: plan.reviewedAt?.toISOString() ?? null,
      items: plan.items.map((item) => ({
        id: item.id,
        artisanProfileId: item.artisanProfileId,
        displayName: item.artisanProfile.displayName,
        quantity: item.quantity,
        state: item.state as C.AllocationItemState,
        offerId: item.offerId,
        releasedQuantity: item.releasedQuantity,
      })),
      totals: {
        allocated,
        offered: sum(['OFFERED']),
        accepted: sum(['ACCEPTED']),
        declined: sum(['DECLINED']),
        expired: sum(['EXPIRED']),
        unallocated: Math.max(0, plan.requiredQuantity - allocated),
        reconciles:
          allocated + Math.max(0, plan.requiredQuantity - allocated) === plan.requiredQuantity,
      },
      overrides: [],
      /* History is purpose-scoped through overrideHistory(), never disclosed with routine planning. */
      /* overrides: plan.overrides.map((row) => ({
        id: row.id,
        planId: row.planId,
        originalRecommendation: JSON.stringify(row.originalRecommendation),
        selectedAlternative: JSON.stringify(row.selectedAlternative),
        actingUser: row.actingUserId,
        businessScope: row.businessScope,
        explanation: row.explanation,
        decisionVersion: row.decisionVersion,
        createdAt: row.createdAt.toISOString(),
      })), */
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
      { actorId: actor.id, resourceId: id, operation: `planning.${operation}`, key },
      json(input),
      fn,
    );
  }
}
