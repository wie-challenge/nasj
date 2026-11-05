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

const batchInclude = {
  offer: { include: { assistedDecision: true } },
  artisanProfile: true,
  release: { include: { requirements: true } },
  preparationItems: true,
  progressEvents: { orderBy: { recordedAt: 'asc' as const } },
  qualityAttempts: { orderBy: { attempt: 'asc' as const } },
  order: {
    include: {
      rfq: { include: { craftSkill: true } },
      acceptance: { include: { quote: { include: { feasibilityAssessment: true } } } },
    },
  },
} satisfies Prisma.CommercialBatchInclude;
type LoadedBatch = Prisma.CommercialBatchGetPayload<{ include: typeof batchInclude }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const blockerText: Record<string, string> = {
  OFFER_NOT_ACCEPTED: 'Only a batch from an accepted artisan offer can be released.',
  ASSISTED_DECISION_UNVERIFIED:
    'A coordinator report is not artisan acceptance, so this work cannot be released.',
  PARTICIPATION_INACTIVE: 'The artisan participation record is not active.',
  SPECIFICATION_UNAPPROVED: 'The accepted specification version has no approved sample.',
  MISSING_BILL_OF_MATERIALS: 'This specification version has no material requirements.',
  MATERIAL_READINESS_UNKNOWN:
    'Material availability is unknown. A feasibility note is not physical stock.',
  FUNDING_UNCONFIRMED: 'Quotation acceptance is not payment. Live funding is not confirmed.',
  CHECKLIST_MISSING: 'This specification version has no inspection checklist.',
};

@Injectable()
export class ProductionExecutionService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async execution(actor: Actor, orderId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor, orderId);
      if (!access.operator && !access.buyer)
        fail(403, 'FORBIDDEN', 'Production visibility requires an assigned operator or the buyer.');
      return this.present(tx, orderId, access.operator);
    });
  }
  async mine(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await tx.artisanProfile.findUnique({ where: { userId: actor.id } });
      if (!profile) return { items: [] };
      const rows = await tx.commercialBatch.findMany({
        where: { artisanProfileId: profile.id, order: { rfq: { procurementManaged: true } } },
        include: batchInclude,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return { items: await Promise.all(rows.map((row) => this.instruction(tx, row, true))) };
    });
  }
  async assigned(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const orgs = await this.coordinatorOrgs(tx, actor);
      if (!orgs.length) return { items: [] };
      const assignments = await tx.artisanAssignment.findMany({
        where: { coordinatorId: actor.id, endedAt: null, organizationId: { in: orgs } },
        select: { artisanProfileId: true, organizationId: true },
      });
      const managed = await tx.artisanManagement.findMany({
        where: {
          endedAt: null,
          organizationId: { in: assignments.map((row) => row.organizationId) },
          artisanProfileId: { in: assignments.map((row) => row.artisanProfileId) },
        },
        select: { artisanProfileId: true },
      });
      const ids = new Set(managed.map((row) => row.artisanProfileId));
      const rows = await tx.commercialBatch.findMany({
        where: {
          artisanProfileId: { in: [...ids] },
          order: { rfq: { procurementManaged: true } },
        },
        include: batchInclude,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return { items: await Promise.all(rows.map((row) => this.instruction(tx, row, true))) };
    });
  }
  async saveMaterials(actor: Actor, orderId: string, input: C.MaterialLinesInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.operator(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'materials.define', key, input, async () => {
        const revisionId = this.revisionId(access.order);
        if (revisionId !== input.revisionId)
          fail(
            409,
            'SPECIFICATION_MISMATCH',
            'Materials must use the accepted specification version.',
          );
        const existing = await tx.specificationMaterialLine.count({ where: { revisionId } });
        if (existing)
          fail(409, 'BOM_LOCKED', 'Material requirements for this version are already recorded.');
        const codes = new Set(input.lines.map((line) => line.materialCode));
        if (codes.size !== input.lines.length)
          fail(409, 'DUPLICATE_MATERIAL', 'Each material code can be recorded once.');
        await tx.specificationMaterialLine.createMany({
          data: input.lines.map((line) => ({ ...line, revisionId })),
        });
        await this.ledger(
          tx,
          actor,
          access.order.id,
          null,
          null,
          'MATERIAL_REQUIREMENTS_RECORDED',
          'OPERATOR',
          input.lines.length,
          revisionId,
        );
        return { revisionId, lines: input.lines.length };
      });
    });
  }
  async saveCriteria(
    actor: Actor,
    orderId: string,
    input: C.InspectionCriteriaInput,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.operator(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'criteria.define', key, input, async () => {
        const revisionId = this.revisionId(access.order);
        if (revisionId !== input.revisionId)
          fail(
            409,
            'SPECIFICATION_MISMATCH',
            'Criteria must use the accepted specification version.',
          );
        if (await tx.inspectionCriterion.count({ where: { revisionId } }))
          fail(
            409,
            'CRITERIA_LOCKED',
            'Inspection criteria for this version are already recorded.',
          );
        const codes = new Set(input.criteria.map((row) => row.code));
        if (codes.size !== input.criteria.length)
          fail(409, 'DUPLICATE_CRITERION', 'Each criterion code can be recorded once.');
        await tx.inspectionCriterion.createMany({
          data: input.criteria.map((row) => ({ ...row, revisionId, version: 1 })),
        });
        await this.ledger(
          tx,
          actor,
          access.order.id,
          null,
          null,
          'CRITERIA_RECORDED',
          'OPERATOR',
          input.criteria.length,
          revisionId,
        );
        return { revisionId, criteria: input.criteria.length };
      });
    });
  }
  async release(actor: Actor, batchId: string, input: C.BatchReleaseInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      if (loaded.role !== 'operator' || !loaded.access.operator)
        fail(403, 'FORBIDDEN', 'An assigned production operator releases accepted work.');
      return this.command(tx, actor, batchId, 'batch.release', key, input, async () => {
        const batch = loaded.batch;
        this.version(batch.version, input.version);
        if (batch.release) fail(409, 'ALREADY_RELEASED', 'This batch is already released.');
        const order = batch.order;
        if (!order.rfq.procurementManaged || order.status !== 'APPROVED')
          fail(
            409,
            'ORDER_NOT_READY',
            'Procurement release applies to an approved commercial order.',
          );
        const reasons = await this.blockers(tx, batch);
        // One specification authority. When the accepted order revision pins a catalogue revision,
        // that catalogue revision must still be the current approved one. Orders that predate the
        // binding keep their previously accepted immutable version and are not retro-fitted.
        const catalogueSample = await this.assertCatalogueRevisionCurrent(tx, order.id);
        if (batch.offer.status !== 'ACCEPTED') reasons.unshift('OFFER_NOT_ACCEPTED');
        if (!input.materialAttestation) reasons.push('MATERIAL_READINESS_UNKNOWN');
        const funding = C.fundingDecision(order.provenance, input.fundingAttestation);
        if (funding === 'FUNDING_UNCONFIRMED') reasons.push('FUNDING_UNCONFIRMED');
        if (reasons.length) fail(409, reasons[0], blockerText[reasons[0]] ?? reasons[0]);
        const revisionId = this.revisionId(order);
        const sample = catalogueSample ?? (await this.sample(tx, revisionId));
        const lines = await tx.specificationMaterialLine.findMany({ where: { revisionId } });
        C.transitionBatch(batch.status as C.BatchState, 'MATERIAL_READY', ['PRODUCTION_MANAGER'], {
          assigned: batch.offer.quantity,
          produced: batch.produced,
          approved: batch.approved,
          pending: batch.pending,
        });
        const release = await tx.batchRelease.create({
          data: {
            batchId,
            actorId: actor.id,
            revisionId,
            sampleId: sample.id,
            fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
            materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
          },
        });
        await tx.batchMaterialRequirement.createMany({
          data: lines.map((line) => ({
            batchId,
            releaseId: release.id,
            materialCode: line.materialCode,
            name: line.name,
            unit: line.unit,
            perItemMilli: line.perItemMilli,
            wastageBps: line.wastageBps,
            batchQuantity: batch.offer.quantity,
            requiredMilli: C.requiredMilli(
              line.perItemMilli,
              batch.offer.quantity,
              line.wastageBps,
            ),
            readiness: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
          })),
        });
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: { status: 'MATERIAL_READY', revisionId, version: { increment: 1 } },
        });
        await tx.forecastSnapshot.create({
          data: {
            batchId,
            ruleVersion: C.RISK_POLICY_VERSION,
            forecastedFor: batch.offer.deliveryDeadline ?? order.rfq.deliveryAt,
            createdById: actor.id,
            evidence: 'SYNTHETIC',
            assumptions: {
              source: 'Approved deadline baseline, not a throughput prediction',
              forecastVersion: (await tx.forecastSnapshot.count({ where: { batchId } })) + 1,
              releaseId: release.id,
            },
          },
        });
        await this.ledger(
          tx,
          actor,
          order.id,
          batchId,
          batch.artisanProfileId,
          'BATCH_RELEASED',
          'OPERATOR',
          batch.offer.quantity,
          'Synthetic demo release. Not payment and not physical receipt.',
        );
        return {
          batchId,
          version: saved.version,
          status: saved.status,
          commercialStatus: order.status,
        };
      });
    });
  }
  async instructions(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      return this.instruction(
        tx,
        loaded.batch,
        loaded.role !== 'operator' || loaded.access.operator,
      );
    });
  }
  async materials(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      return { items: await this.materialsFor(tx, loaded.batch) };
    });
  }
  async progressList(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      return {
        mode: 'CUMULATIVE' as const,
        items: loaded.batch.progressEvents.map((row) => ({
          id: row.id,
          kind: row.kind,
          source: row.source,
          cumulative: row.cumulative,
          previousCumulative: row.previousCumulative,
          delta: row.delta,
          note: row.note,
          occurredAt: row.occurredAt.toISOString(),
          recordedAt: row.recordedAt.toISOString(),
        })),
      };
    });
  }
  async events(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.visible(tx, actor, batchId);
      const rows = await tx.productionLedgerEvent.findMany({
        where: { batchId },
        orderBy: { recordedAt: 'asc' },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          source: row.source,
          quantity: row.quantity,
          reason: row.reason,
          occurredAt: row.occurredAt.toISOString(),
          recordedAt: row.recordedAt.toISOString(),
        })),
      };
    });
  }
  async start(actor: Actor, batchId: string, input: { version: number }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.worker(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.start', key, input, async () => {
        this.version(loaded.batch.version, input.version);
        await this.assertMaterialReadiness(tx, batchId);
        this.move(loaded.batch, 'IN_PROGRESS');
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: { status: 'IN_PROGRESS', version: { increment: 1 } },
        });
        await this.ledger(
          tx,
          actor,
          loaded.batch.orderId,
          batchId,
          loaded.batch.artisanProfileId,
          'BATCH_STARTED',
          loaded.source,
          null,
          '',
        );
        return { batchId, version: saved.version, status: saved.status, source: loaded.source };
      });
    });
  }
  async report(actor: Actor, batchId: string, input: C.ProgressReportInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.worker(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.progress', key, input, async () => {
        const batch = loaded.batch;
        this.version(batch.version, input.version);
        if (batch.status !== 'IN_PROGRESS')
          fail(409, 'INVALID_TRANSITION', 'Report progress only while production is in progress.');
        await this.assertMaterialReadiness(tx, batchId);
        C.validateProgress(batch.offer.quantity, batch.produced, input.produced);
        const when = this.when(input.occurredAt);
        await tx.productionProgressEvent.create({
          data: {
            batchId,
            artisanProfileId: batch.artisanProfileId,
            actorId: actor.id,
            associationOrganizationId: loaded.organizationId,
            kind: 'REPORT',
            mode: 'CUMULATIVE',
            source: loaded.source,
            cumulative: input.produced,
            previousCumulative: batch.produced,
            delta: input.produced - batch.produced,
            note: input.note ?? '',
            permissionUsed: loaded.permission,
            occurredAt: when,
          },
        });
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: { produced: input.produced, version: { increment: 1 } },
        });
        await this.ledger(
          tx,
          actor,
          batch.orderId,
          batchId,
          batch.artisanProfileId,
          'PROGRESS_REPORTED',
          loaded.source,
          input.produced,
          '',
        );
        return { batchId, version: saved.version, produced: saved.produced, source: loaded.source };
      });
    });
  }
  async correct(actor: Actor, batchId: string, input: C.ProgressCorrectionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      if (loaded.role === 'operator' && !loaded.access.operator)
        fail(403, 'FORBIDDEN', 'A production operator records a correction.');
      const source =
        loaded.role === 'artisan'
          ? 'ARTISAN'
          : loaded.role === 'coordinator'
            ? 'COORDINATOR'
            : 'OPERATOR';
      if (source === 'OPERATOR') {
        return this.command(tx, actor, batchId, 'batch.correct', key, input, () =>
          this.writeCorrection(
            tx,
            actor,
            loaded.batch,
            input,
            'OPERATOR',
            null,
            'operator.production.manage',
          ),
        );
      }
      const worker = await this.worker(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.correct', key, input, () =>
        this.writeCorrection(
          tx,
          actor,
          worker.batch,
          input,
          worker.source,
          worker.organizationId,
          worker.permission,
        ),
      );
    });
  }
  async flag(
    actor: Actor,
    batchId: string,
    input: { eventId: string; reason: string },
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      const source =
        loaded.role === 'artisan'
          ? 'ARTISAN'
          : loaded.role === 'coordinator'
            ? 'COORDINATOR'
            : 'OPERATOR';
      return this.command(tx, actor, batchId, 'batch.flag', key, input, async () => {
        const prior = loaded.batch.progressEvents.find((row) => row.id === input.eventId);
        if (!prior) fail(404, 'NOT_FOUND', 'Progress event not found.');
        const row = await tx.productionProgressEvent.create({
          data: {
            batchId,
            artisanProfileId: loaded.batch.artisanProfileId,
            actorId: actor.id,
            kind: 'FLAG',
            mode: 'CUMULATIVE',
            source,
            cumulative: loaded.batch.produced,
            previousCumulative: loaded.batch.produced,
            delta: 0,
            priorEventId: prior.id,
            note: input.reason,
            permissionUsed:
              source === 'COORDINATOR' ? 'association.production.update' : 'production.review',
            occurredAt: new Date(),
          },
        });
        await this.ledger(
          tx,
          actor,
          loaded.batch.orderId,
          batchId,
          loaded.batch.artisanProfileId,
          'PROGRESS_FLAGGED',
          source === 'OPERATOR' ? 'OPERATOR' : source,
          null,
          input.reason,
        );
        return { id: row.id, produced: loaded.batch.produced };
      });
    });
  }
  async submit(actor: Actor, batchId: string, input: { version: number }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.worker(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.submit', key, input, async () => {
        const batch = loaded.batch;
        this.version(batch.version, input.version);
        this.move(batch, 'SUBMITTED');
        const pending = batch.produced - batch.approved - batch.rejected;
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: {
            status: 'SUBMITTED',
            submitted: batch.produced,
            pending,
            version: { increment: 1 },
          },
        });
        await this.ledger(
          tx,
          actor,
          batch.orderId,
          batchId,
          batch.artisanProfileId,
          'SUBMITTED_FOR_INSPECTION',
          loaded.source,
          batch.produced,
          '',
        );
        return {
          batchId,
          version: saved.version,
          status: saved.status,
          submitted: saved.submitted,
        };
      });
    });
  }
  async inspections(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.visible(tx, actor, batchId);
      return {
        items: loaded.batch.qualityAttempts.map((row) => ({
          id: row.id,
          attempt: row.attempt,
          kind: row.kind,
          approved: row.approved,
          rejected: row.rejected,
          pending: row.pending,
          scope: row.scopeQuantity,
          defectReason: row.defectReason,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    });
  }
  async inspect(actor: Actor, batchId: string, input: C.ExecutionInspectionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.inspector(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.inspect', key, input, async () => {
        const batch = loaded.batch;
        this.version(batch.version, input.version);
        if (batch.status !== 'SUBMITTED')
          fail(409, 'INVALID_TRANSITION', 'Submit reported pieces before inspection.');
        if (batch.qualityAttempts.length)
          fail(409, 'INSPECTION_EXISTS', 'This submission already has an inspection.');
        C.assertInspectionTotals(batch.submitted, input.approved, input.rejected, input.pending);
        if (input.rejected > 0 && input.defectReason.trim().length < 2)
          C.requireRule(false, 'QUALITY_REQUIRED', 'Explain rejected pieces.');
        const criteria = await this.criteria(tx, batch);
        this.checkResults(criteria, input.results, input.rejected, input.pending);
        const status = this.qualityStatus(batch, input.approved, input.pending, input.rejected);
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: {
            status,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            version: { increment: 1 },
          },
        });
        const attempt = await tx.qualityInspectionAttempt.create({
          data: {
            batchId,
            attempt: 1,
            kind: 'INITIAL',
            inspectorId: actor.id,
            scopeQuantity: batch.submitted,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            defectReason: input.defectReason,
            results: {
              create: input.results.map((row) => ({
                criterionId: row.criterionId,
                outcome: row.outcome,
                note: row.note,
              })),
            },
          },
        });
        await tx.commercialInspection.create({
          data: {
            batchId,
            batchVersion: saved.version,
            inspectorId: actor.id,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            submitted: batch.submitted,
            defectReason: input.defectReason,
          },
        });
        await this.ledger(
          tx,
          actor,
          batch.orderId,
          batchId,
          batch.artisanProfileId,
          status === 'APPROVED' ? 'QUALITY_APPROVED' : 'INSPECTION_RECORDED',
          'OPERATOR',
          input.approved,
          input.defectReason,
        );
        return {
          batchId,
          attemptId: attempt.id,
          version: saved.version,
          status,
          approved: input.approved,
          rejected: input.rejected,
          pending: input.pending,
        };
      });
    });
  }
  async reinspect(actor: Actor, batchId: string, input: C.ReinspectionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const loaded = await this.inspector(tx, actor, batchId);
      return this.command(tx, actor, batchId, 'batch.reinspect', key, input, async () => {
        const batch = loaded.batch;
        this.version(batch.version, input.version);
        if (batch.status !== 'INSPECTION')
          fail(409, 'INVALID_TRANSITION', 'Reinspection follows an open inspection.');
        const prior = batch.qualityAttempts.at(-1);
        if (!prior)
          fail(409, 'INSPECTION_REQUIRED', 'Record the first inspection before reinspection.');
        const net = C.netAfterReinspection(
          {
            approved: batch.approved,
            rejected: batch.rejected,
            pending: batch.pending,
            submitted: batch.submitted,
          },
          input,
        );
        if (input.rejected > 0 && input.defectReason.trim().length < 2)
          C.requireRule(false, 'QUALITY_REQUIRED', 'Explain pieces that remain rejected.');
        const criteria = await this.criteria(tx, batch);
        this.checkResults(criteria, input.results, input.rejected, input.pending);
        const status = this.qualityStatus(batch, net.approved, net.pending, net.rejected);
        const saved = await tx.commercialBatch.update({
          where: { id: batchId },
          data: {
            status,
            approved: net.approved,
            rejected: net.rejected,
            pending: net.pending,
            version: { increment: 1 },
          },
        });
        const attempt = await tx.qualityInspectionAttempt.create({
          data: {
            batchId,
            attempt: prior.attempt + 1,
            kind: 'REINSPECTION',
            priorAttemptId: prior.id,
            inspectorId: actor.id,
            scopeQuantity: input.scope,
            approved: input.approved,
            rejected: input.rejected,
            pending: input.pending,
            defectReason: input.defectReason,
            results: {
              create: input.results.map((row) => ({
                criterionId: row.criterionId,
                outcome: row.outcome,
                note: row.note,
              })),
            },
          },
        });
        await tx.commercialInspection.create({
          data: {
            batchId,
            batchVersion: saved.version,
            inspectorId: actor.id,
            approved: net.approved,
            rejected: net.rejected,
            pending: net.pending,
            submitted: batch.submitted,
            defectReason: input.defectReason,
          },
        });
        await this.ledger(
          tx,
          actor,
          batch.orderId,
          batchId,
          batch.artisanProfileId,
          'REINSPECTION_RECORDED',
          'OPERATOR',
          net.approved,
          'Reinspection does not create new manufactured pieces.',
        );
        return {
          batchId,
          attemptId: attempt.id,
          version: saved.version,
          status,
          ...net,
          produced: batch.produced,
        };
      });
    });
  }
  async consolidate(actor: Actor, orderId: string, input: C.ConsolidationInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.operator(tx, actor, orderId);
      return this.command(tx, actor, orderId, 'order.consolidate', key, input, async () => {
        const wanted = new Map<string, number>();
        for (const item of input.items)
          wanted.set(item.batchId, (wanted.get(item.batchId) ?? 0) + item.quantity);
        const batches = await tx.commercialBatch.findMany({
          where: { orderId, id: { in: [...wanted.keys()] } },
          include: { preparationItems: true, offer: true },
        });
        if (batches.length !== wanted.size) fail(404, 'NOT_FOUND', 'Batch not found.');
        const revisionIds = new Set(batches.map((row) => row.revisionId));
        if (revisionIds.size !== 1 || [...revisionIds][0] === null)
          fail(
            409,
            'SPECIFICATION_MISMATCH',
            'Consolidation uses released batches of one specification version.',
          );
        let total = 0;
        for (const batch of batches) {
          const used = batch.preparationItems.reduce((sum, item) => sum + item.quantity, 0);
          const available = batch.approved - used;
          const quantity = wanted.get(batch.id) ?? 0;
          if (quantity > available)
            fail(
              409,
              'EXCESS_CONSOLIDATION',
              'Only quality-approved pieces that are not already prepared can be consolidated.',
            );
          total += quantity;
        }
        const row = await tx.shipmentPreparation.create({
          data: {
            orderId,
            actorId: actor.id,
            items: {
              create: [...wanted].map(([batchId, quantity]) => ({ batchId, quantity })),
            },
          },
        });
        const order = await tx.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
        await this.ledger(
          tx,
          actor,
          orderId,
          null,
          null,
          'CONSOLIDATION_PREPARED',
          'OPERATOR',
          total,
          'Prepared for shipment. Not shipped or delivered.',
        );
        return {
          id: row.id,
          quantity: total,
          status: 'PREPARED' as const,
          commercialStatus: order.status,
          delivered: order.delivered,
        };
      });
    });
  }
  private async writeCorrection(
    tx: Db,
    actor: Actor,
    batch: LoadedBatch,
    input: C.ProgressCorrectionInput,
    source: 'ARTISAN' | 'COORDINATOR' | 'OPERATOR',
    organizationId: string | null,
    permission: string,
  ) {
    this.version(batch.version, input.version);
    if (batch.status !== 'IN_PROGRESS')
      fail(409, 'INVALID_TRANSITION', 'Correct progress only while production is in progress.');
    const prior = batch.progressEvents.find((row) => row.id === input.eventId);
    if (!prior || (prior.kind !== 'REPORT' && prior.kind !== 'CORRECTION'))
      fail(404, 'NOT_FOUND', 'Progress event not found.');
    C.quantity(input.produced);
    C.requireRule(
      input.produced <= batch.offer.quantity,
      'EXCESS_PRODUCTION',
      'A correction cannot exceed the accepted quantity.',
    );
    await tx.productionProgressEvent.create({
      data: {
        batchId: batch.id,
        artisanProfileId: batch.artisanProfileId,
        actorId: actor.id,
        associationOrganizationId: organizationId,
        kind: 'CORRECTION',
        mode: 'CUMULATIVE',
        source,
        cumulative: input.produced,
        previousCumulative: batch.produced,
        delta: input.produced - batch.produced,
        priorEventId: prior.id,
        note: input.reason,
        permissionUsed: permission,
        occurredAt: this.when(input.occurredAt),
      },
    });
    const saved = await tx.commercialBatch.update({
      where: { id: batch.id },
      data: { produced: input.produced, version: { increment: 1 } },
    });
    await this.ledger(
      tx,
      actor,
      batch.orderId,
      batch.id,
      batch.artisanProfileId,
      'PROGRESS_CORRECTED',
      source,
      input.produced,
      input.reason,
    );
    return { batchId: batch.id, version: saved.version, produced: saved.produced };
  }
  private move(batch: LoadedBatch, next: C.BatchState) {
    C.transitionBatch(batch.status as C.BatchState, next, ['ARTISAN'], {
      assigned: batch.offer.quantity,
      produced: batch.produced,
      approved: batch.approved,
      pending: batch.pending,
    });
  }
  private qualityStatus(batch: LoadedBatch, approved: number, pending: number, rejected: number) {
    if (batch.status === 'SUBMITTED')
      C.transitionBatch(batch.status, 'INSPECTION', ['QUALITY_INSPECTOR'], {
        assigned: batch.offer.quantity,
        produced: batch.produced,
        approved: batch.approved,
        pending: batch.pending,
      });
    if (approved === batch.offer.quantity && pending === 0 && rejected === 0) {
      C.transitionBatch('INSPECTION', 'APPROVED', ['QUALITY_INSPECTOR'], {
        assigned: batch.offer.quantity,
        produced: batch.produced,
        approved,
        pending,
      });
      return 'APPROVED' as const;
    }
    return batch.status === 'SUBMITTED' ? ('INSPECTION' as const) : ('INSPECTION' as const);
  }
  private checkResults(
    criteria: { id: string; required: boolean; evidenceRequired: boolean }[],
    results: { criterionId: string; outcome: string; note: string }[],
    rejected: number,
    pending: number,
  ) {
    if (!criteria.length) fail(409, 'CHECKLIST_MISSING', blockerText.CHECKLIST_MISSING);
    const byId = new Map(criteria.map((row) => [row.id, row]));
    const seen = new Set<string>();
    for (const result of results) {
      const criterion = byId.get(result.criterionId);
      if (!criterion || seen.has(result.criterionId))
        fail(
          409,
          'CHECKLIST_MISMATCH',
          'Inspection results must use this specification checklist once.',
        );
      seen.add(result.criterionId);
      if (result.outcome === 'NOT_APPLICABLE' && criterion.required)
        fail(409, 'CHECKLIST_MISMATCH', 'A required criterion cannot be skipped.');
      if (criterion.evidenceRequired && result.note.trim().length < 2)
        fail(
          409,
          'EVIDENCE_REQUIRED',
          'This criterion needs a written evidence reference. Photographs are not stored.',
        );
    }
    if (criteria.some((row) => row.required && !seen.has(row.id)))
      fail(409, 'CHECKLIST_MISMATCH', 'Record every required criterion.');
    if (results.some((row) => row.outcome === 'FAIL') && rejected + pending === 0)
      fail(409, 'DEFECT_UNACCOUNTED', 'A failed criterion must remain rejected or pending.');
  }
  private async criteria(tx: Db, batch: LoadedBatch) {
    const revisionId =
      batch.revisionId ??
      batch.order.catalogueProcurementRevisionId ??
      batch.order.acceptance?.quote.revisionId;
    if (!revisionId) return [];
    return tx.inspectionCriterion.findMany({ where: { revisionId } });
  }
  private async present(tx: Db, orderId: string, operator: boolean) {
    const loaded = await tx.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        rfq: true,
        batches: {
          include: {
            offer: { include: { assistedDecision: true } },
            preparationItems: true,
            release: true,
            artisanProfile: true,
          },
        },
        shipmentPreparations: { include: { items: true } },
      },
    });
    const revision = await tx.procurementAcceptance.findUnique({
      where: { orderId: loaded.id },
      include: { quote: true },
    });
    const revisionId = loaded.catalogueProcurementRevisionId ?? revision?.quote.revisionId ?? null;
    const effectiveRevision = revisionId
      ? await tx.procurementRevision.findUnique({
          where: { id: revisionId },
          select: { version: true },
        })
      : null;
    const lines = revisionId
      ? await tx.specificationMaterialLine.findMany({ where: { revisionId } })
      : [];
    const criteria = revisionId
      ? await tx.inspectionCriterion.findMany({ where: { revisionId } })
      : [];
    const sample = revisionId
      ? await tx.procurementSample.findFirst({
          where: { revisionId, decision: { decision: 'APPROVED' } },
        })
      : null;
    const batches = loaded.batches.map((batch) => {
      const consolidated = batch.preparationItems.reduce((sum, item) => sum + item.quantity, 0);
      const blockers = this.staticBlockers(batch, Boolean(sample), lines.length > 0);
      return {
        id: batch.id,
        artisanName: operator ? batch.artisanProfile.displayName : null,
        status: batch.status,
        version: batch.version,
        quantity: batch.offer.quantity,
        produced: batch.produced,
        submitted: batch.submitted,
        approved: batch.approved,
        rejected: batch.rejected,
        pending: batch.pending,
        consolidated,
        shippable: Math.max(0, batch.approved - consolidated),
        blockers,
      };
    });
    const sum = (pick: (batch: (typeof batches)[number]) => number) =>
      batches.reduce((total, batch) => total + pick(batch), 0);
    const shipments = await tx.shipment.findMany({
      where: { orderId: loaded.id },
      include: { items: true, deliveryReport: true, buyerConfirmation: true },
    });
    const shipped = shipments.reduce(
      (total, row) =>
        total +
        (C.countsAsShipped(row.status)
          ? row.items.reduce((sumItems, item) => sumItems + item.quantity, 0)
          : 0),
      0,
    );
    const delivered = shipments.reduce(
      (total, row) =>
        total +
        (row.deliveryReport &&
        row.status !== 'IN_TRANSIT' &&
        row.status !== 'PICKUP_SCHEDULED' &&
        row.status !== 'COLLECTED'
          ? row.deliveryReport.quantity
          : 0),
      0,
    );
    const buyerAccepted = shipments.reduce(
      (total, row) => total + (row.buyerConfirmation?.accepted ?? 0),
      0,
    );
    const summary: C.ExecutionSummary = {
      orderId: loaded.id,
      commercialStatus: loaded.status,
      productionStage: C.productionStage({
        committed: sum((batch) => batch.quantity),
        released: loaded.batches.filter((batch) => batch.release).length,
        inProgress: loaded.batches.filter((batch) => batch.status === 'IN_PROGRESS').length,
        inQuality: loaded.batches.filter((batch) =>
          ['SUBMITTED', 'INSPECTION'].includes(batch.status),
        ).length,
        approved: sum((batch) => batch.approved),
        shippable: sum((batch) => batch.shippable),
      }),
      requested: loaded.rfq.quantity,
      committed: sum((batch) => batch.quantity),
      reported: sum((batch) => batch.produced),
      submitted: sum((batch) => batch.submitted),
      approved: sum((batch) => batch.approved),
      rejected: sum((batch) => batch.rejected),
      pendingInspection: sum((batch) => batch.pending),
      consolidated: sum((batch) => batch.consolidated),
      shippable: sum((batch) => batch.shippable),
      shipped,
      delivered,
      buyerAccepted,
      shipment: C.fulfillmentStage(shipments.map((row) => row.status)),
      provenance: 'SYNTHETIC',
      warnings: [
        'Reported production is not quality-approved production.',
        'A prepared consolidation is not a shipment or a delivery.',
        'Buyer quotation acceptance is not artisan acceptance or payment.',
      ],
    };
    const materials = lines.map((line) =>
      this.materialView(line, loaded.rfq.quantity, 'AVAILABILITY_UNKNOWN'),
    );
    return {
      summary,
      revisionId,
      specificationVersion: effectiveRevision?.version ?? null,
      materials: operator ? materials : [],
      criteria: operator
        ? criteria.map((row) => ({
            id: row.id,
            code: row.code,
            description: row.description,
            expected: row.expected,
            tolerance: row.tolerance,
            required: row.required,
          }))
        : [],
      batches: operator ? batches : [],
      preparations: loaded.shipmentPreparations.map((row) => ({
        id: row.id,
        quantity: row.items.reduce((total, item) => total + item.quantity, 0),
        createdAt: row.createdAt.toISOString(),
        status: 'PREPARED' as const,
        items: operator ? row.items.map((item) => ({ id: item.id, quantity: item.quantity })) : [],
      })),
      buyerView: !operator,
    };
  }
  private staticBlockers(
    batch: {
      status: string;
      offer: { status: string; assistedDecision: { verificationStatus: string } | null };
      artisanProfile: { participantStatus: string };
      release: { id: string } | null;
    },
    sampleApproved: boolean,
    hasMaterials: boolean,
  ) {
    if (batch.release) return [];
    const reasons: string[] = [];
    if (batch.offer.status !== 'ACCEPTED' || batch.status !== 'ACCEPTED')
      reasons.push('OFFER_NOT_ACCEPTED');
    if (batch.offer.assistedDecision?.verificationStatus === 'PENDING_UNAPPROVED_METHOD')
      reasons.push('ASSISTED_DECISION_UNVERIFIED');
    if (batch.artisanProfile.participantStatus !== 'ACTIVE') reasons.push('PARTICIPATION_INACTIVE');
    if (!sampleApproved) reasons.push('SPECIFICATION_UNAPPROVED');
    if (!hasMaterials) reasons.push('MISSING_BILL_OF_MATERIALS');
    reasons.push('MATERIAL_READINESS_UNKNOWN', 'FUNDING_UNCONFIRMED');
    return reasons;
  }
  private async blockers(tx: Db, batch: LoadedBatch) {
    const reasons: string[] = [];
    if (batch.offer.assistedDecision) reasons.push('ASSISTED_DECISION_UNVERIFIED');
    if (batch.artisanProfile.participantStatus !== 'ACTIVE') reasons.push('PARTICIPATION_INACTIVE');
    if (batch.status !== 'ACCEPTED') reasons.push('OFFER_NOT_ACCEPTED');
    const revisionId =
      batch.order.catalogueProcurementRevisionId ?? batch.order.acceptance?.quote.revisionId;
    const sample = revisionId ? await this.sampleOrNull(tx, revisionId) : null;
    if (!sample) reasons.push('SPECIFICATION_UNAPPROVED');
    const lines = revisionId
      ? await tx.specificationMaterialLine.count({ where: { revisionId } })
      : 0;
    if (!lines) reasons.push('MISSING_BILL_OF_MATERIALS');
    return reasons;
  }
  private async instruction(tx: Db, batch: LoadedBatch, pay: boolean): Promise<C.WorkInstruction> {
    const materials = await this.materialsFor(tx, batch);
    const criteria = await this.criteria(tx, batch);
    const assumptions = batch.order.acceptance?.quote.feasibilityAssessment?.assumptions;
    const period = periodOf(assumptions);
    const latest = [...batch.progressEvents]
      .reverse()
      .find((row) => row.kind === 'REPORT' || row.kind === 'CORRECTION');
    const catalogue = batch.order.productSpecificationRevisionId
      ? await tx.productSpecificationRevision.findUnique({
          where: { id: batch.order.productSpecificationRevisionId },
        })
      : null;
    const translations = (catalogue?.instructionTranslations ?? []) as {
      language: string;
      instructions: string;
      reviewReference: string;
    }[];
    const translated = translations.find(
      (t) => t.language === batch.artisanProfile.preferredLanguage,
    );
    const instructionLanguage = translated?.language ?? catalogue?.instructionLanguage ?? 'en';
    const references = (catalogue?.referenceImages ?? []) as {
      filename: string;
      caption: string;
      sha256: string;
    }[];
    const attachments = references.length
      ? await tx.procurementAttachment.findMany({
          where: {
            rfqId: batch.order.rfqId,
            removedAt: null,
            sha256: { in: references.map((r) => r.sha256) },
          },
        })
      : [];
    const images = references.map((reference) => {
      const attachment = attachments.find(
        (a) =>
          a.sha256 === reference.sha256 &&
          ['image/webp', 'image/png', 'image/jpeg'].includes(a.mime),
      );
      return {
        ...reference,
        dataUrl: attachment
          ? `data:${attachment.mime};base64,${Buffer.from(attachment.bytes).toString('base64')}`
          : null,
      };
    });
    return {
      batchId: batch.id,
      version: batch.version,
      status: batch.status,
      orderReference: batch.orderId,
      productTitle: batch.order.rfq.title,
      craft: batch.order.rfq.craftSkill.name,
      quantity: batch.offer.quantity,
      unit: 'PIECES',
      deadline: (batch.offer.deliveryDeadline ?? batch.order.rfq.deliveryAt).toISOString(),
      periodFrom: period.from,
      periodTo: period.to,
      specificationVersion:
        catalogue?.revisionNumber ?? batch.order.acceptance?.quote.version ?? null,
      catalogueRevisionId: catalogue?.id ?? null,
      instructionAmendment:
        catalogue && catalogue.revisionNumber > 1
          ? `Approved design revision v${catalogue.revisionNumber}; review measurements and criteria before work.`
          : null,
      translationNotice:
        instructionLanguage !== batch.artisanProfile.preferredLanguage
          ? `A reviewed ${batch.artisanProfile.preferredLanguage} translation is unavailable; original ${instructionLanguage} instructions are shown.`
          : null,
      specification: catalogue
        ? `${catalogue.description} Measurements: ${catalogue.dimensions} ${catalogue.unit}. Tolerances: ${catalogue.tolerances}`
        : batch.order.rfq.specification,
      materials,
      instructions:
        translated?.instructions ??
        catalogue?.instructions ??
        batch.offer.instructions ??
        batch.order.rfq.designRequirements,
      qualityCriteria: criteria.map((row) => ({
        id: row.id,
        code: row.code,
        description: row.description,
        expected: row.expected,
        tolerance: row.tolerance,
        required: row.required,
      })),
      images,
      compensationTnd: pay
        ? C.formatTnd(C.payableForUnits(batch.offer.unitPayMillimes, batch.offer.quantity))
        : null,
      supportContact: 'Assigned NASJ operator',
      preferredLanguage: batch.artisanProfile.preferredLanguage,
      termsLanguage: instructionLanguage,
      produced: batch.produced,
      submitted: batch.submitted,
      approved: batch.approved,
      rejected: batch.rejected,
      pending: batch.pending,
      progressSource:
        latest?.source === 'ARTISAN' ||
        latest?.source === 'COORDINATOR' ||
        latest?.source === 'OPERATOR'
          ? latest.source
          : null,
      flags: batch.progressEvents
        .filter((row) => row.kind === 'FLAG')
        .map((row) => ({ id: row.id, reason: row.note, recordedAt: row.recordedAt.toISOString() })),
    };
  }
  private async assertMaterialReadiness(tx: Db, batchId: string) {
    const requirements = await tx.materialReadiness.findMany({ where: { batchId } });
    if (
      requirements.some((row) =>
        [
          'RECEIPT_INCOMPLETE',
          'DISCREPANCY_BLOCKED',
          'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION',
        ].includes(row.readiness),
      )
    )
      fail(
        409,
        'MATERIAL_RECEIPT_BLOCKED',
        'Resolve material shortages, returns and stock verification before continuing production.',
      );
  }
  private async materialsFor(tx: Db, batch: LoadedBatch): Promise<C.ExecutionMaterial[]> {
    if (batch.release) {
      const rows = await tx.batchMaterialRequirement.findMany({ where: { batchId: batch.id } });
      const readiness = await tx.materialReadiness.findMany({ where: { batchId: batch.id } });
      return rows.map((row) => ({
        materialCode: row.materialCode,
        name: row.name,
        unit: unitOf(row.unit),
        perItem: C.formatMilli(row.perItemMilli),
        required: C.formatMilli(row.requiredMilli),
        wastageBps: row.wastageBps,
        readiness: (readiness.find((state) => state.requirementId === row.id)?.readiness ??
          row.readiness) as C.ExecutionMaterial['readiness'],
      }));
    }
    const revisionId =
      batch.order.catalogueProcurementRevisionId ?? batch.order.acceptance?.quote.revisionId;
    if (!revisionId) return [];
    const lines = await tx.specificationMaterialLine.findMany({ where: { revisionId } });
    return lines.map((line) =>
      this.materialView(line, batch.offer.quantity, 'AVAILABILITY_UNKNOWN'),
    );
  }
  private materialView(
    line: {
      materialCode: string;
      name: string;
      unit: string;
      perItemMilli: number;
      wastageBps: number;
    },
    pieces: number,
    readiness: C.ExecutionMaterial['readiness'],
  ): C.ExecutionMaterial {
    return {
      materialCode: line.materialCode,
      name: line.name,
      unit: unitOf(line.unit),
      perItem: C.formatMilli(line.perItemMilli),
      required: C.formatMilli(C.requiredMilli(line.perItemMilli, pieces, line.wastageBps)),
      wastageBps: line.wastageBps,
      readiness,
    };
  }
  private async sample(tx: Db, revisionId: string) {
    const row = await this.sampleOrNull(tx, revisionId);
    if (!row) fail(409, 'SPECIFICATION_UNAPPROVED', blockerText.SPECIFICATION_UNAPPROVED);
    return row;
  }
  private sampleOrNull(tx: Db, revisionId: string) {
    return tx.procurementSample.findFirst({
      where: { revisionId, decision: { decision: 'APPROVED' } },
      orderBy: { version: 'desc' },
    });
  }
  /**
   * A bound catalogue revision must be the current approved revision for its specification.
   * A superseded or non-approved revision blocks release. An unbound (legacy) order keeps the
   * catalogue out of its gate so existing accepted versions are never retro-fitted.
   */
  private async assertCatalogueRevisionCurrent(tx: Db, orderId: string) {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      select: {
        productSpecificationRevisionId: true,
        catalogueProcurementRevisionId: true,
        rfq: { select: { buyerOrganizationId: true } },
      },
    });
    const catalogueId = order?.productSpecificationRevisionId;
    if (!catalogueId) return;
    const catalogue = await tx.productSpecificationRevision.findUnique({
      where: { id: catalogueId },
      select: { status: true, supersededById: true, specificationId: true },
    });
    if (catalogue?.status !== 'APPROVED' || catalogue.supersededById)
      fail(
        409,
        'SPECIFICATION_SUPERSEDED',
        'The approved product specification for this order changed. Renew sample approval first.',
      );
    const approvedSample = await tx.buyerSampleApproval.findFirst({
      where: {
        specificationRevisionId: catalogueId,
        buyerOrganizationId: order!.rfq.buyerOrganizationId,
        decision: 'APPROVED',
        procurementProjections: {
          some: { revisionId: order!.catalogueProcurementRevisionId ?? '' },
        },
      },
      include: {
        procurementProjections: {
          where: { revisionId: order!.catalogueProcurementRevisionId ?? '' },
        },
      },
    });
    if (!approvedSample?.procurementProjections[0])
      fail(
        409,
        'SAMPLE_NOT_APPROVED',
        'The buying organization has not bound an approved sample of this specification revision.',
      );
    return approvedSample.procurementProjections[0];
  }
  private revisionId(order: {
    catalogueProcurementRevisionId?: string | null;
    acceptance: { quote: { revisionId: string } } | null;
  }) {
    const revisionId = order.catalogueProcurementRevisionId ?? order.acceptance?.quote.revisionId;
    if (!revisionId) fail(409, 'SPECIFICATION_UNAPPROVED', blockerText.SPECIFICATION_UNAPPROVED);
    return revisionId;
  }
  private async worker(tx: Db, actor: Actor, batchId: string) {
    const loaded = await this.visible(tx, actor, batchId);
    if (loaded.role === 'artisan')
      return {
        batch: loaded.batch,
        source: 'ARTISAN' as const,
        organizationId: null,
        permission: 'artisan.owner',
      };
    if (loaded.role === 'coordinator')
      return {
        batch: loaded.batch,
        source: 'COORDINATOR' as const,
        organizationId: loaded.organizationId,
        permission: 'association.production.update',
      };
    fail(
      403,
      'FORBIDDEN',
      'The artisan or an assigned coordinator records this production update.',
    );
  }
  private async inspector(tx: Db, actor: Actor, batchId: string) {
    const loaded = await this.visible(tx, actor, batchId);
    if (loaded.role !== 'operator' || !loaded.access.quality)
      fail(403, 'FORBIDDEN', 'An assigned operator with quality approval records inspection.');
    return loaded;
  }
  private async visible(tx: Db, actor: Actor, batchId: string) {
    const batch = await tx.commercialBatch.findUnique({
      where: { id: batchId },
      include: batchInclude,
    });
    if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
    if (batch.artisanProfile.userId === actor.id)
      return {
        batch,
        role: 'artisan' as const,
        organizationId: null,
        access: emptyAccess(batch.order),
      };
    const help = await this.assistant(tx, actor, batch.artisanProfileId);
    if (help)
      return {
        batch,
        role: 'coordinator' as const,
        organizationId: help,
        access: emptyAccess(batch.order),
      };
    const access = await this.access(tx, actor, batch.orderId);
    if (access.operator || access.quality)
      return { batch, role: 'operator' as const, organizationId: null, access };
    fail(404, 'NOT_FOUND', 'Batch not found.');
  }
  private async assistant(tx: Db, actor: Actor, artisanProfileId: string) {
    const orgs = await this.coordinatorOrgs(tx, actor);
    if (!orgs.length) return null;
    const assignment = await tx.artisanAssignment.findFirst({
      where: {
        artisanProfileId,
        coordinatorId: actor.id,
        endedAt: null,
        organizationId: { in: orgs },
      },
    });
    if (!assignment) return null;
    const management = await tx.artisanManagement.findFirst({
      where: { artisanProfileId, organizationId: assignment.organizationId, endedAt: null },
    });
    return management ? assignment.organizationId : null;
  }
  private async coordinatorOrgs(tx: Db, actor: Actor) {
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
        C.permissionsForMembership(member).includes('association.production.update'),
      )
      .map((member) => member.organizationId);
  }
  private async operator(tx: Db, actor: Actor, orderId: string) {
    const access = await this.access(tx, actor, orderId);
    if (!access.operator) fail(403, 'FORBIDDEN', 'An assigned production operator is required.');
    return access;
  }
  private async access(tx: Db, actor: Actor, orderId: string) {
    const order = await tx.commercialOrder.findUnique({
      where: { id: orderId },
      include: { rfq: true, acceptance: { include: { quote: true } }, batches: true },
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
    const buyer = members.some(
      (member) =>
        member.organizationId === order.rfq.buyerOrganizationId &&
        member.organization.type === 'BUYER_BUSINESS',
    );
    return {
      order,
      operator: Boolean(assigned && permissions.includes('operator.production.manage')),
      quality: Boolean(assigned && permissions.includes('operator.quality.approve')),
      buyer,
    };
  }
  private async ledger(
    tx: Db,
    actor: Actor,
    orderId: string,
    batchId: string | null,
    artisanProfileId: string | null,
    action: string,
    source: string,
    quantity: number | null,
    reason: string,
  ) {
    const now = new Date();
    await tx.productionLedgerEvent.create({
      data: {
        orderId,
        batchId,
        action,
        actorId: actor.id,
        artisanProfileId,
        source,
        quantity,
        reason,
        correlationId: randomUUID(),
        occurredAt: now,
      },
    });
    await audit(tx, actor, {
      action: `production.${action.toLowerCase()}`,
      targetType: batchId ? 'CommercialBatch' : 'CommercialOrder',
      targetId: batchId ?? orderId,
      after: { action, source, quantity, provenance: 'SYNTHETIC' },
    });
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
      { actorId: actor.id, resourceId: id, operation: `execution.${operation}`, key },
      json(input),
      fn,
    );
  }
  private version(actual: number, expected: number) {
    C.requireRule(
      actual === expected,
      'VERSION_CONFLICT',
      'This record changed. Reload before trying again.',
    );
  }
  private when(value: string) {
    const date = new Date(value);
    C.requireRule(!Number.isNaN(date.getTime()), 'INVALID_DATE', 'Use a valid occurrence time.');
    C.requireRule(
      date.getTime() <= Date.now() + 60_000,
      'INVALID_DATE',
      'The occurrence time cannot be in the future.',
    );
    return date;
  }
}
function emptyAccess(order: LoadedBatch['order']) {
  return { order, operator: false, quality: false, buyer: false };
}
function unitOf(value: string): C.MaterialUnit {
  if (value === 'METERS' || value === 'PIECES' || value === 'UNITS') return value;
  fail(500, 'INTERNAL_ERROR', 'Stored material unit is not supported.');
}
function periodOf(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { from: null, to: null };
  const row = value as { effectiveFrom?: unknown; effectiveTo?: unknown };
  return {
    from: typeof row.effectiveFrom === 'string' ? row.effectiveFrom : null,
    to: typeof row.effectiveTo === 'string' ? row.effectiveTo : null,
  };
}
