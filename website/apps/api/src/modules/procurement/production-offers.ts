import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { projectCapacity } from '../artisans/capacity.js';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';
import { commercialTermsHash } from './commercial-decision.js';
import { requireCurrentEligibility } from './eligibility-guard.js';

const orderInclude = {
  rfq: true,
  productSpecificationRevision: true,
  offers: true,
  acceptance: {
    include: { quote: { include: { costEstimate: true, feasibilityAssessment: true } } },
  },
} as const;
const offerInclude = {
  order: { include: { rfq: true, productSpecificationRevision: true } },
  artisanProfile: true,
  association: true,
  assistedDecision: true,
  eligibilityAssessment: true,
} as const;
type LoadedOrder = Prisma.CommercialOrderGetPayload<{ include: typeof orderInclude }>;
type LoadedOffer = Prisma.CommercialOfferGetPayload<{ include: typeof offerInclude }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class ProductionOfferService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async workspace(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.gate(tx, actor, orderId);
      if (!loaded.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
      return this.present(tx, loaded.order);
    });
  }
  async assess(
    actor: Actor,
    orderId: string,
    input: {
      version: number;
      restrictionsReviewed: boolean;
      restrictionSource?: string;
      equipment?: string;
    },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.gate(tx, actor, orderId);
      if (!loaded.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
      return this.command(tx, actor, orderId, 'eligibility.assess', key, input, async () => {
        this.ready(loaded.order);
        if (loaded.order.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This order changed. Reload before assessing eligibility.');
        const quote = this.quote(loaded.order);
        const period = periodOf(quote.feasibilityAssessment.assumptions);
        const profiles = await tx.artisanProfile.findMany({
          where: {
            skills: {
              some: { craftSkillId: loaded.order.rfq.craftSkillId, craftSkill: { isActive: true } },
            },
          },
          include: {
            user: { select: { status: true, emailVerified: true } },
            skills: {
              where: { craftSkillId: loaded.order.rfq.craftSkillId },
              select: { id: true },
            },
            authorizations: {
              where: { purpose: 'PARTICIPATION', withdrawnAt: null, policy: { active: true } },
              select: { id: true },
              take: 1,
            },
            managements: {
              where: { endedAt: null },
              include: { organization: { select: { name: true } } },
              take: 1,
            },
          },
          orderBy: { id: 'asc' },
          take: 81,
        });
        const truncated = profiles.length > 80;
        const selected = profiles.slice(0, 80);
        const linked = selected.flatMap((profile) => (profile.userId ? [profile.userId] : []));
        const [consents, declarations] = await Promise.all([
          tx.consentRecord.findMany({
            where: {
              userId: { in: linked },
              purpose: 'artisan.profile',
              decision: true,
              withdrawnAt: null,
            },
            select: { userId: true },
          }),
          tx.capacityDeclaration.findMany({
            where: {
              artisanProfileId: { in: selected.map((profile) => profile.id) },
              craftSkillId: loaded.order.rfq.craftSkillId,
              supersededAt: null,
            },
          }),
        ]);
        const consented = new Set(consents.map((row) => row.userId));
        const version = (
          await tx.eligibilityAssessment.aggregate({
            where: { orderId },
            _max: { version: true },
          })
        )._max.version;
        const nextVersion = (version ?? 0) + 1;
        const counts = { ELIGIBLE: 0, INELIGIBLE: 0, NEEDS_REVIEW: 0 };
        for (const profile of selected) {
          const own = declarations.filter((row) => row.artisanProfileId === profile.id);
          const exactPieces = period
            ? own.filter((row) => row.unitType === 'PIECES' && samePeriod(row, period))
            : [];
          const exactOther = period
            ? own.filter((row) => row.unitType !== 'PIECES' && samePeriod(row, period))
            : [];
          const otherPieces = period
            ? own.filter(
                (row) =>
                  row.unitType === 'PIECES' && overlaps(row, period) && !samePeriod(row, period),
              )
            : [];
          let projection: Awaited<ReturnType<typeof projectCapacity>> | null = null;
          if (exactPieces[0]) projection = await projectCapacity(tx, exactPieces[0]);
          const result = C.assessCandidate({
            craftMatch: profile.skills.length > 0,
            participantActive: profile.participantStatus === 'ACTIVE',
            availabilityAvailable: profile.availabilityStatus === 'AVAILABLE',
            accountLinked: Boolean(profile.userId),
            accountActive: Boolean(profile.user?.status === 'ACTIVE' && profile.user.emailVerified),
            participationAuthorized: profile.userId
              ? consented.has(profile.userId)
              : profile.authorizations.length > 0,
            periodKnown: Boolean(period),
            periodCompatible:
              exactPieces.length > 0 || exactOther.length > 0 || otherPieces.length === 0,
            declarationPresent: exactPieces.length > 0 || exactOther.length > 0,
            unitCompatible: exactPieces.length > 0 && exactOther.length === 0,
            availabilityKnown: projection
              ? projection.availabilityKnown || projection.constraints.length > 0
              : false,
            remaining: projection?.remaining ?? null,
            capacityConstraints: projection?.constraints ?? [],
            restrictionsReviewed: input.restrictionsReviewed,
            equipmentRequired: input.equipment ?? null,
            equipmentHeld: input.equipment
              ? profile.equipment.some(
                  (item) => item.toLowerCase() === input.equipment?.toLowerCase(),
                )
              : true,
            feasibilityFeasible: quote.feasibilityAssessment.result === 'FEASIBLE',
          });
          if (input.restrictionsReviewed && input.restrictionSource) {
            const attested = result.reasons.find(
              (reason) => reason.code === 'PRODUCT_RESTRICTIONS_ATTESTED',
            );
            if (attested)
              attested.detail = `Operator attestation (${input.restrictionSource}): no further product restriction is recorded. This does not waive capacity, consent or participation.`;
          }
          counts[result.decision] += 1;
          await tx.eligibilityAssessment.create({
            data: {
              orderId,
              version: nextVersion,
              artisanProfileId: profile.id,
              decision: result.decision,
              reasons: json(result.reasons),
              unknowns: json(result.unknown),
              knownRemaining:
                projection?.availabilityKnown || projection?.constraints.length
                  ? projection.remaining
                  : null,
              unitType: exactPieces.length
                ? 'PIECES'
                : exactOther.length
                  ? exactOther[0].unitType
                  : null,
              periodFrom: period?.from,
              periodTo: period?.to,
              authorId: actor.id,
            },
          });
        }
        await tx.commercialOrder.update({
          where: { id: orderId },
          data: { version: { increment: 1 } },
        });
        await audit(tx, actor, {
          action: 'production.eligibility.assessed',
          targetType: 'CommercialOrder',
          targetId: orderId,
          organizationId: loaded.order.rfq.operatorOrganizationId,
          after: {
            version: nextVersion,
            eligible: counts.ELIGIBLE,
            ineligible: counts.INELIGIBLE,
            needsReview: counts.NEEDS_REVIEW,
            truncated,
            provenance: 'SYNTHETIC',
          },
        });
        return { ...(await this.present(tx, loaded.order)), truncated };
      });
    });
  }
  async createOffer(
    actor: Actor,
    orderId: string,
    input: {
      version: number;
      eligibilityId: string;
      quantity: number;
      expiresAt: string;
      materials: string;
      reworkTerms: string;
      paymentConditions: string;
      collectionArrangement: string;
      instructions: string;
    },
    key?: string,
    transaction?: Db,
  ) {
    const run = async (tx: Db) => {
      const loaded = await this.gate(tx, actor, orderId);
      if (!loaded.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
      return this.command(tx, actor, orderId, 'offer.prepare', key, input, async () => {
        const quote = this.ready(loaded.order);
        if (loaded.order.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This order changed. Reload before preparing an offer.');
        const row = await this.prepare(tx, actor, loaded.order, quote, input, false);
        await tx.commercialOrder.update({
          where: { id: orderId },
          data: { version: { increment: 1 } },
        });
        return row;
      });
    };
    return transaction ? run(transaction) : iamTransaction(this.db, actor, run);
  }
  async issue(
    actor: Actor,
    offerId: string,
    input: { version: number },
    key?: string,
    transaction?: Db,
  ) {
    const run = async (tx: Db) => {
      const offer = await tx.commercialOffer.findUnique({
        where: { id: offerId },
        include: offerInclude,
      });
      if (!offer) fail(404, 'NOT_FOUND', 'Offer not found.');
      const loaded = await this.gate(tx, actor, offer.orderId);
      if (!loaded.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
      return this.command(tx, actor, offerId, 'offer.issue', key, input, async () => {
        const quote = this.ready(loaded.order);
        if (offer.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This offer changed. Reload before issuing it.');
        if (offer.status !== 'PREPARED')
          fail(409, 'INVALID_TRANSITION', 'Only a prepared offer can be issued.');
        const current = await this.prepare(
          tx,
          actor,
          loaded.order,
          quote,
          {
            eligibilityId: offer.eligibilityAssessmentId ?? '',
            quantity: offer.quantity,
            expiresAt: offer.expiresAt.toISOString(),
            materials: offer.materials,
            reworkTerms: offer.reworkTerms,
            paymentConditions: offer.paymentConditions,
            collectionArrangement: offer.collectionArrangement ?? '',
            instructions: offer.instructions ?? '',
          },
          true,
          offer,
        );
        if (
          current.unitPayTnd !== C.formatTnd(offer.unitPayMillimes) ||
          current.estimatedHours !== offer.estimatedHours
        )
          fail(
            409,
            'TERMS_STALE',
            'Approved compensation or effort changed. Prepare a new offer instead of changing this one.',
          );
        C.transitionOffer('PREPARED', 'OFFERED', ['PRODUCTION_MANAGER'], {
          now: Date.now(),
          expiresAt: offer.expiresAt.getTime(),
        });
        const issued = await tx.commercialOffer.update({
          where: { id: offer.id },
          data: { status: 'OFFERED', version: { increment: 1 } },
          include: offerInclude,
        });
        await audit(tx, actor, {
          action: 'production.offer.issued',
          targetType: 'CommercialOffer',
          targetId: offer.id,
          organizationId: loaded.order.rfq.operatorOrganizationId,
          after: {
            status: 'OFFERED',
            quantity: offer.quantity,
            unitPayTnd: C.formatTnd(offer.unitPayMillimes),
            provenance: 'SYNTHETIC',
          },
        });
        return this.offerView(issued);
      });
    };
    return transaction ? run(transaction) : iamTransaction(this.db, actor, run);
  }
  /** Reissue reviewed counter terms inside the caller's transaction; acceptance remains offerAction. */
  async reissueCounter(tx: Db, actor: Actor, offerId: string, quantity: number, deadline: Date) {
    const original = await tx.commercialOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!original) fail(404, 'NOT_FOUND', 'Offer not found.');
    const loaded = await this.gate(tx, actor, original.orderId);
    if (!loaded.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
    if (original.status !== 'OFFERED' || original.expiresAt <= new Date())
      fail(409, 'OFFER_NOT_OPEN', 'Only a current issued offer can be replaced.');
    const declaration = await tx.capacityDeclaration.findUniqueOrThrow({
      where: { id: original.capacityDeclarationId },
    });
    if (
      deadline <= new Date() ||
      deadline < declaration.effectiveFrom ||
      deadline >= declaration.effectiveTo
    )
      fail(
        409,
        'DEADLINE_OUTSIDE_CAPACITY',
        'Reassess capacity for a deadline outside the agreed production period.',
      );
    const quote = this.ready(loaded.order);
    // Replaced offers no longer reserve; the new offer is created in the same transaction.
    await tx.commercialOffer.update({
      where: { id: offerId },
      data: { status: 'REPLACED', version: { increment: 1 } },
    });
    loaded.order.offers = loaded.order.offers.filter((offer) => offer.id !== offerId);
    const prepared = await this.prepare(
      tx,
      actor,
      loaded.order,
      quote,
      {
        eligibilityId: original.eligibilityAssessmentId ?? '',
        quantity,
        expiresAt: new Date(
          Math.min(original.expiresAt.getTime(), deadline.getTime() - 86400000),
        ).toISOString(),
        materials: original.materials,
        reworkTerms: original.reworkTerms,
        paymentConditions: original.paymentConditions,
        collectionArrangement: original.collectionArrangement ?? '',
        instructions: original.instructions ?? '',
        deadline: deadline.toISOString(),
      },
      false,
    );
    if (!('id' in prepared))
      fail(409, 'OFFER_PREPARATION_FAILED', 'Revised terms were not prepared.');
    const revised = await tx.commercialOffer.update({
      where: { id: prepared.id },
      data: {
        status: 'OFFERED',
        version: { increment: 1 },
        deliveryDeadline: deadline,
      },
    });
    await audit(tx, actor, {
      action: 'production.offer.reissued',
      targetType: 'CommercialOffer',
      targetId: revised.id,
      organizationId: loaded.order.rfq.operatorOrganizationId,
      before: {
        offerId: original.id,
        quantity: original.quantity,
        termsSha256: original.termsSha256,
      },
      after: {
        replacesOfferId: original.id,
        quantity,
        deadline: deadline.toISOString(),
        termsSha256: revised.termsSha256,
        createsAgreement: false,
      },
    });
    return revised;
  }
  async assisted(
    actor: Actor,
    offerId: string,
    input: { version: number; decision: 'ACCEPT' | 'DECLINE'; evidenceReference: string },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const offer = await this.visibleOffer(tx, actor, offerId);
      return this.command(tx, actor, offerId, 'offer.assisted', key, input, async () => {
        if (offer.version !== input.version)
          fail(409, 'VERSION_CONFLICT', 'This offer changed. Reload it before recording a report.');
        if (offer.artisanProfile.userId)
          fail(
            409,
            'ARTISAN_ACCOUNT_REQUIRED',
            'This artisan has an account and must accept or decline personally.',
          );
        if (offer.status !== 'OFFERED' || offer.expiresAt <= new Date())
          fail(409, 'OFFER_NOT_OPEN', 'Only a current issued offer can be reported.');
        if (await tx.assistedOfferDecision.findUnique({ where: { offerId } }))
          fail(409, 'DECISION_EXISTS', 'A report is already recorded for this offer.');
        const recorded = await tx.assistedOfferDecision.create({
          data: {
            offerId,
            artisanProfileId: offer.artisanProfileId,
            reportedDecision: input.decision,
            method: 'IN_PERSON_REPORTED',
            evidenceReference: input.evidenceReference,
            verificationStatus: 'PENDING_UNAPPROVED_METHOD',
            recordedById: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'production.assisted_decision.recorded',
          targetType: 'AssistedOfferDecision',
          targetId: recorded.id,
          organizationId: offer.associationOrganizationId ?? undefined,
          after: {
            reportedDecision: input.decision,
            verificationStatus: 'PENDING_UNAPPROVED_METHOD',
            offerStatus: offer.status,
            provenance: 'SYNTHETIC',
          },
        });
        const fresh = await tx.commercialOffer.findUniqueOrThrow({
          where: { id: offerId },
          include: offerInclude,
        });
        return this.offerView(fresh);
      });
    });
  }
  async verify(actor: Actor, offerId: string, decisionId: string) {
    await iamTransaction(this.db, actor, async (tx) => {
      const decision = await tx.assistedOfferDecision.findFirst({
        where: { id: decisionId, offerId },
        include: { offer: { include: offerInclude } },
      });
      if (!decision) fail(404, 'NOT_FOUND', 'Decision not found.');
      await this.visibleOffer(tx, actor, offerId);
      await audit(tx, actor, {
        action: 'production.verification.blocked',
        targetType: 'AssistedOfferDecision',
        targetId: decision.id,
        organizationId: decision.offer.associationOrganizationId ?? undefined,
        after: { verificationStatus: 'PENDING_UNAPPROVED_METHOD', provenance: 'SYNTHETIC' },
      });
    });
    fail(
      409,
      'VERIFICATION_UNAPPROVED',
      'No approved verification method exists. A coordinator report is not artisan acceptance.',
    );
  }
  async assigned(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const orgIds = await this.coordinatorOrganizations(tx, actor);
      if (!orgIds.length) fail(403, 'FORBIDDEN', 'Assigned association offer access is required.');
      const assignments = await tx.artisanAssignment.findMany({
        where: { coordinatorId: actor.id, endedAt: null, organizationId: { in: orgIds } },
        select: { artisanProfileId: true },
      });
      const offers = await tx.commercialOffer.findMany({
        where: {
          artisanProfileId: { in: assignments.map((row) => row.artisanProfileId) },
          status: { in: ['PREPARED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED'] },
        },
        include: offerInclude,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        verificationPolicy: 'PENDING_UNAPPROVED_METHOD' as const,
        offers: offers.map((offer) => this.offerView(offer)),
      };
    });
  }
  private async prepare(
    tx: Db,
    actor: Actor,
    order: LoadedOrder,
    quote: LoadedOrder['acceptance'] & {
      quote: NonNullable<NonNullable<LoadedOrder['acceptance']>['quote']>;
    },
    input: {
      deadline?: string;
      eligibilityId: string;
      quantity: number;
      expiresAt: string;
      materials: string;
      reworkTerms: string;
      paymentConditions: string;
      collectionArrangement: string;
      instructions: string;
    },
    issuing: boolean,
    existing?: LoadedOffer,
  ) {
    const acceptedQuote = quote.quote;
    const catalogue = order.productSpecificationRevision;
    if (catalogue && (catalogue.status !== 'APPROVED' || catalogue.supersededById))
      fail(
        409,
        'SPECIFICATION_REAPPROVAL_REQUIRED',
        'Review and approve the exact bound specification before issuing new work.',
      );
    const catalogueSnapshot = catalogue
      ? JSON.stringify({
          id: catalogue.id,
          revision: catalogue.revisionNumber,
          description: catalogue.description,
          dimensions: catalogue.dimensions,
          unit: catalogue.unit,
          materials: catalogue.materials,
          instructions: catalogue.instructions,
          instructionLanguage: catalogue.instructionLanguage,
          tolerances: catalogue.tolerances,
          qualityCriteria: catalogue.qualityCriteria,
          referenceImages: catalogue.referenceImages,
        })
      : null;

    const assessment = await tx.eligibilityAssessment.findFirst({
      where: { id: input.eligibilityId, orderId: order.id },
    });
    if (!assessment) fail(404, 'NOT_FOUND', 'Choose an eligibility result for this order.');
    const latest = await tx.eligibilityAssessment.findFirst({
      where: { orderId: order.id, artisanProfileId: assessment.artisanProfileId },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });
    if (!latest || latest.id !== assessment.id || assessment.decision !== 'ELIGIBLE')
      fail(409, 'ELIGIBILITY_REQUIRED', 'Only the latest eligible assessment can be offered.');
    const expiresAt = new Date(input.expiresAt);
    if (!(expiresAt > new Date() && expiresAt < order.rfq.deliveryAt))
      fail(409, 'INVALID_EXPIRY', 'Offer expiry must be in the future and before delivery.');
    if (!assessment.periodFrom || !assessment.periodTo)
      fail(409, 'PERIOD_UNKNOWN', 'The eligible assessment has no production period.');
    const declaration = await tx.capacityDeclaration.findFirst({
      where: {
        artisanProfileId: assessment.artisanProfileId,
        craftSkillId: order.rfq.craftSkillId,
        unitType: 'PIECES',
        supersededAt: null,
        effectiveFrom: assessment.periodFrom,
        effectiveTo: assessment.periodTo,
      },
      orderBy: { version: 'desc' },
    });
    if (!declaration)
      fail(
        409,
        'CAPACITY_UNAVAILABLE',
        'The matching piece-capacity declaration is no longer current.',
      );
    this.allocation(order, input.quantity, existing?.id);
    const summary = await projectCapacity(tx, declaration);
    if (
      !summary.availabilityKnown ||
      summary.constraints.length > 0 ||
      C.capacityHundredths(summary.remaining) < BigInt(input.quantity) * 100n
    )
      fail(
        409,
        'CAPACITY_EXCEEDED',
        'This offer exceeds known remaining capacity for this production period.',
      );
    const pay = laborUnit(
      acceptedQuote.costEstimate?.components,
      input.quantity,
      order.rfq.quantity,
    );
    const effort = effortRange(
      acceptedQuote.feasibilityAssessment?.effortMin ?? null,
      acceptedQuote.feasibilityAssessment?.effortMax ?? null,
      input.quantity,
      order.rfq.quantity,
    );
    const management = await tx.artisanManagement.findFirst({
      where: { artisanProfileId: assessment.artisanProfileId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    const profile = await tx.artisanProfile.findUniqueOrThrow({
      where: { id: assessment.artisanProfileId },
    });
    // Prepare and issue both revalidate current state in this transaction. Ranking produced the
    // assessment and it may already be stale by the time an offer is written; issuing re-runs
    // prepare, so a change between preparation and issue cannot slip through on the stored terms.
    await requireCurrentEligibility(tx, {
      artisanProfileId: assessment.artisanProfileId,
      userId: profile.userId,
      orderId: order.id,
      craftSkillId: order.rfq.craftSkillId,
      capacityDeclarationId: declaration.id,
      quantity: input.quantity,
      periodFrom: assessment.periodFrom,
      periodTo: assessment.periodTo,
    });
    const terms = {
      orderId: order.id,
      quoteId: acceptedQuote.id,
      costVersion: acceptedQuote.costEstimate?.version ?? 0,
      feasibilityVersion: acceptedQuote.feasibilityAssessment?.version ?? 0,
      artisanProfileId: assessment.artisanProfileId,
      quantity: input.quantity,
      unit: 'PIECES',
      unitPayTnd: C.formatTnd(pay.unit),
      totalPayTnd: C.formatTnd(C.payableForUnits(pay.unit, input.quantity)),
      estimatedHours: effort,
      effectiveFrom: assessment.periodFrom.toISOString(),
      effectiveTo: assessment.periodTo.toISOString(),
      deadline: input.deadline ?? order.rfq.deliveryAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      materials: input.materials,
      reworkTerms: input.reworkTerms,
      paymentConditions: input.paymentConditions,
      collectionArrangement: input.collectionArrangement,
      instructions: input.instructions,
      compensationMethod: pay.method,
      specification: catalogue?.description ?? order.rfq.specification,
      catalogueRevisionId: catalogue?.id ?? null,
      catalogueRevisionDigest: catalogueSnapshot
        ? createHash('sha256').update(catalogueSnapshot).digest('hex')
        : null,
    };
    if (issuing)
      return {
        unitPayTnd: terms.unitPayTnd,
        totalPayTnd: terms.totalPayTnd,
        estimatedHours: effort,
      };
    const created = await tx.commercialOffer.create({
      data: {
        orderId: order.id,
        capacityDeclarationId: declaration.id,
        artisanProfileId: assessment.artisanProfileId,
        quantity: input.quantity,
        unitPayMillimes: pay.unit,
        estimatedHours: effort,
        expiresAt,
        deliveryDeadline: new Date(input.deadline ?? order.rfq.deliveryAt.toISOString()),
        materials: input.materials,
        reworkTerms: input.reworkTerms,
        paymentConditions: input.paymentConditions,
        status: 'PREPARED',
        quoteId: acceptedQuote.id,
        eligibilityAssessmentId: assessment.id,
        compensationMethod: pay.method,
        collectionArrangement: input.collectionArrangement,
        instructions: input.instructions,
        termsSha256: commercialTermsHash(terms),
        associationOrganizationId: management?.organizationId,
      },
      include: offerInclude,
    });
    await audit(tx, actor, {
      action: 'production.offer.prepared',
      targetType: 'CommercialOffer',
      targetId: created.id,
      organizationId: order.rfq.operatorOrganizationId,
      after: {
        status: 'PREPARED',
        quantity: input.quantity,
        unitPayTnd: terms.unitPayTnd,
        artisanProfileId: profile.id,
        provenance: 'SYNTHETIC',
      },
    });
    return this.offerView(created);
  }
  private allocation(order: LoadedOrder, quantity: number, ignoreId?: string) {
    const now = new Date();
    let reserved = 0;
    let accepted = 0;
    for (const offer of order.offers) {
      if (offer.id === ignoreId) continue;
      if (offer.status === 'ACCEPTED') accepted += offer.quantity;
      else if (['PLANNED', 'OFFERED'].includes(offer.status) && offer.expiresAt > now)
        reserved += offer.quantity;
    }
    C.reconcileFulfillment({
      requested: order.rfq.quantity,
      reserved: reserved + quantity,
      allocated: accepted,
      produced: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      delivered: 0,
    });
  }
  private async present(tx: Db, order: LoadedOrder): Promise<C.ProductionWorkspace> {
    const latest = await tx.eligibilityAssessment.aggregate({
      where: { orderId: order.id },
      _max: { version: true },
    });
    const [assessments, offers, skilled] = await Promise.all([
      tx.eligibilityAssessment.findMany({
        where: { orderId: order.id, version: latest._max.version ?? 0 },
        include: {
          artisanProfile: {
            include: {
              managements: {
                where: { endedAt: null },
                include: { organization: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
        orderBy: { artisanProfile: { displayName: 'asc' } },
      }),
      tx.commercialOffer.findMany({
        where: { orderId: order.id },
        include: offerInclude,
        orderBy: { createdAt: 'desc' },
      }),
      tx.artisanProfile.count({
        where: { skills: { some: { craftSkillId: order.rfq.craftSkillId } } },
      }),
    ]);
    const now = new Date();
    const quantity = (status: (offer: LoadedOffer) => boolean) =>
      offers.filter(status).reduce((total, offer) => total + offer.quantity, 0);
    const prepared = quantity((offer) => offer.status === 'PREPARED');
    const reserved = quantity(
      (offer) => ['PLANNED', 'OFFERED'].includes(offer.status) && offer.expiresAt > now,
    );
    const accepted = quantity((offer) => offer.status === 'ACCEPTED');
    const current = await tx.commercialOrder.findUniqueOrThrow({ where: { id: order.id } });
    return {
      summary: {
        required: order.rfq.quantity,
        prepared,
        reserved,
        accepted,
        uncovered: Math.max(0, order.rfq.quantity - reserved - accepted),
        declined: offers.filter((offer) => offer.status === 'DECLINED').length,
        expired: offers.filter(
          (offer) =>
            offer.status === 'EXPIRED' ||
            (['PLANNED', 'OFFERED'].includes(offer.status) && offer.expiresAt <= now),
        ).length,
        orderVersion: current.version,
        craftSkillId: order.rfq.craftSkillId,
        warnings: [
          'Eligibility is not a production commitment.',
          'Buyer acceptance of a quotation is not agreement by the artisan to do the work.',
          ...(prepared ? ['Prepared offers do not reserve capacity.'] : []),
          ...(order.rfq.quantity - reserved - accepted > 0
            ? ['Some of the order quantity is still uncovered.']
            : []),
        ],
      },
      assessments: assessments.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        version: row.version,
        artisanProfileId: row.artisanProfileId,
        displayName: row.artisanProfile.displayName,
        associationName: row.artisanProfile.managements[0]?.organization.name ?? null,
        accountLinked: Boolean(row.artisanProfile.userId),
        decision: row.decision as C.EligibilityDecision,
        reasons: findings(row.reasons),
        unknown: strings(row.unknowns),
        knownRemaining: row.knownRemaining?.toFixed(2) ?? null,
        unitType: row.unitType === 'HOURS' || row.unitType === 'PIECES' ? row.unitType : null,
        periodFrom: row.periodFrom?.toISOString() ?? null,
        periodTo: row.periodTo?.toISOString() ?? null,
        assessedAt: row.createdAt.toISOString(),
      })),
      offers: offers.map((offer) => this.offerView(offer)),
      truncated: skilled > assessments.length && assessments.length >= 80,
      verificationPolicy: 'PENDING_UNAPPROVED_METHOD',
    };
  }
  private offerView(offer: LoadedOffer): C.ProductionOfferView {
    const assisted = offer.assistedDecision;
    return {
      id: offer.id,
      orderId: offer.orderId,
      artisanProfileId: offer.artisanProfileId,
      displayName: offer.artisanProfile.displayName,
      associationName: offer.association?.name ?? null,
      quantity: offer.quantity,
      unitPayTnd: C.formatTnd(offer.unitPayMillimes),
      totalPayTnd: C.formatTnd(C.payableForUnits(offer.unitPayMillimes, offer.quantity)),
      compensationMethod: offer.compensationMethod,
      estimatedHours: offer.estimatedHours,
      expiresAt: offer.expiresAt.toISOString(),
      materials: offer.materials,
      reworkTerms: offer.reworkTerms,
      paymentConditions: offer.paymentConditions,
      collectionArrangement: offer.collectionArrangement,
      instructions: offer.instructions,
      specification: offer.order.productSpecificationRevision
        ? `${offer.order.productSpecificationRevision.description} [Approved specification ${offer.order.productSpecificationRevision.id}, revision ${offer.order.productSpecificationRevision.revisionNumber}]`
        : offer.order.rfq.specification,
      deliveryAt: (offer.deliveryDeadline ?? offer.order.rfq.deliveryAt).toISOString(),
      status: offer.status,
      version: offer.version,
      termsSha256: offer.termsSha256,
      preferredLanguage: offer.artisanProfile.preferredLanguage,
      assisted: assisted
        ? {
            id: assisted.id,
            reportedDecision: assisted.reportedDecision as 'ACCEPT' | 'DECLINE',
            method: 'IN_PERSON_REPORTED',
            verificationStatus: 'PENDING_UNAPPROVED_METHOD',
            recordedById: assisted.recordedById,
            evidenceReference: assisted.evidenceReference,
            createdAt: assisted.createdAt.toISOString(),
          }
        : null,
      decisionState: decisionState(offer),
    };
  }
  private ready(order: LoadedOrder) {
    const acceptance = order.acceptance;
    const quote = acceptance?.quote;
    const feasibility = quote?.feasibilityAssessment;
    const cost = quote?.costEstimate;
    if (
      !order.rfq.procurementManaged ||
      order.rfq.status !== 'ACCEPTED' ||
      !acceptance ||
      !quote?.termsSha256 ||
      !cost ||
      !feasibility
    )
      fail(
        409,
        'PRODUCTION_NOT_READY',
        'Production offers require an accepted versioned quotation with feasibility and costing.',
      );
    return {
      ...acceptance,
      quote: {
        ...quote,
        termsSha256: quote.termsSha256,
        costEstimate: cost,
        feasibilityAssessment: feasibility,
      },
    };
  }
  private quote(order: LoadedOrder) {
    return this.ready(order).quote;
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
        member.organization.type === 'INTERNAL',
    );
    const permitted = Boolean(
      internal && C.permissionsForMembership(internal).includes('operator.production.manage'),
    );
    const assigned = permitted
      ? await tx.operatorAssignment.findFirst({
          where: {
            operatorId: actor.id,
            organizationId: order.rfq.buyerOrganizationId,
            revokedAt: null,
          },
        })
      : null;
    return { order, operator: Boolean(assigned) };
  }
  private async visibleOffer(tx: Db, actor: Actor, offerId: string) {
    const offer = await tx.commercialOffer.findUnique({
      where: { id: offerId },
      include: offerInclude,
    });
    if (!offer) fail(404, 'NOT_FOUND', 'Offer not found.');
    const orgIds = await this.coordinatorOrganizations(tx, actor);
    const assignment = orgIds.length
      ? await tx.artisanAssignment.findFirst({
          where: {
            artisanProfileId: offer.artisanProfileId,
            coordinatorId: actor.id,
            endedAt: null,
            organizationId: { in: orgIds },
          },
        })
      : null;
    const managed = assignment
      ? await tx.artisanManagement.findFirst({
          where: {
            artisanProfileId: offer.artisanProfileId,
            organizationId: assignment.organizationId,
            endedAt: null,
          },
        })
      : null;
    if (!assignment || !managed) fail(404, 'NOT_FOUND', 'Offer not found.');
    return offer;
  }
  private async coordinatorOrganizations(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: {
          approvalStatus: 'APPROVED',
          type: { in: ['ASSOCIATION', 'PARTNER_COOPERATIVE'] },
        },
      },
      include: { roles: true, permissionGrants: true },
    });
    return members
      .filter((member) =>
        C.permissionsForMembership(member).includes('association.offer.recordDecision'),
      )
      .map((member) => member.organizationId);
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
      { actorId: actor.id, resourceId: id, operation: `production.${operation}`, key },
      json(input),
      fn,
    );
  }
}
function laborUnit(
  components: Prisma.JsonValue | undefined,
  quantity: number,
  orderQuantity: number,
) {
  const lines = Array.isArray(components) ? components : [];
  const labor = lines.find(
    (line): line is { category: string; basis?: string; rateTnd?: string; amountTnd?: string } =>
      line !== null &&
      typeof line === 'object' &&
      !Array.isArray(line) &&
      'category' in line &&
      line.category === 'ARTISAN_LABOR',
  );
  if (!labor?.basis || !labor.rateTnd)
    fail(409, 'COMPENSATION_UNAVAILABLE', 'The approved cost has no artisan labor rate.');
  try {
    if (labor.basis === 'VARIABLE') {
      const unit = C.parseTnd(labor.rateTnd);
      if (unit <= 0n)
        fail(409, 'COMPENSATION_UNAVAILABLE', 'Artisan labor must be a positive rate.');
      C.payableForUnits(unit, quantity);
      return { unit, method: 'VARIABLE_UNIT_RATE_FROM_APPROVED_COST' };
    }
    const unit = C.prorateTnd(
      C.parseTnd(labor.amountTnd ?? labor.rateTnd),
      1n,
      BigInt(orderQuantity),
    );
    if (unit <= 0n) fail(409, 'COMPENSATION_UNAVAILABLE', 'Prorated artisan labor is zero.');
    C.payableForUnits(unit, quantity);
    return { unit, method: 'FIXED_LABOR_PRORATED_FROM_APPROVED_COST' };
  } catch (error) {
    if (error instanceof C.CommerceRuleError) throw error;
    fail(
      409,
      'COMPENSATION_UNAVAILABLE',
      'Artisan compensation could not be read from the approved cost.',
    );
  }
}
function effortRange(
  min: Prisma.Decimal | null,
  max: Prisma.Decimal | null,
  quantity: number,
  orderQuantity: number,
) {
  const low = scaleHours(min, quantity, orderQuantity);
  const high = scaleHours(max, quantity, orderQuantity);
  if (!low || !high)
    fail(
      409,
      'EFFORT_UNKNOWN',
      'Record approved effort before issuing work an artisan can understand.',
    );
  return `${low}-${high}`;
}
function scaleHours(value: Prisma.Decimal | null, quantity: number, orderQuantity: number) {
  if (!value || orderQuantity <= 0) return null;
  const hundredths = BigInt(value.toFixed(2).replace('.', ''));
  const scaled = hundredths * BigInt(quantity);
  const denominator = BigInt(orderQuantity);
  const rounded = scaled / denominator + (2n * (scaled % denominator) >= denominator ? 1n : 0n);
  return `${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
}
function periodOf(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const from =
    'effectiveFrom' in value && typeof value.effectiveFrom === 'string'
      ? value.effectiveFrom
      : null;
  const to =
    'effectiveTo' in value && typeof value.effectiveTo === 'string' ? value.effectiveTo : null;
  if (!from || !to || !(new Date(to) > new Date(from))) return null;
  return { from: new Date(from), to: new Date(to) };
}
function samePeriod(
  row: { effectiveFrom: Date; effectiveTo: Date },
  period: { from: Date; to: Date },
) {
  return (
    row.effectiveFrom.getTime() === period.from.getTime() &&
    row.effectiveTo.getTime() === period.to.getTime()
  );
}
function overlaps(
  row: { effectiveFrom: Date; effectiveTo: Date },
  period: { from: Date; to: Date },
) {
  return row.effectiveFrom < period.to && row.effectiveTo > period.from;
}
function decisionState(offer: LoadedOffer) {
  if (offer.status === 'ACCEPTED') return 'ACCEPTED_BY_ARTISAN';
  if (offer.status === 'DECLINED') return 'DECLINED';
  if (
    offer.status === 'EXPIRED' ||
    (['PLANNED', 'OFFERED', 'PREPARED'].includes(offer.status) && offer.expiresAt <= new Date())
  )
    return 'EXPIRED';
  if (offer.assistedDecision) return 'REPORTED_PENDING_VERIFICATION';
  if (offer.status === 'PREPARED') return 'PREPARED';
  return 'AWAITING_ARTISAN';
}
function findings(value: Prisma.JsonValue): C.EligibilityFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const code = 'code' in item && typeof item.code === 'string' ? item.code : '';
    const detail = 'detail' in item && typeof item.detail === 'string' ? item.detail : '';
    return code ? [{ code, detail }] : [];
  });
}
function strings(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
