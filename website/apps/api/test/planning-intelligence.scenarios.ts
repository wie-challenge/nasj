import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { IntelligenceWorkspaceView, PlanningWorkspaceView } from '@nasj/contracts';
type Result = { status: number; body: unknown };
type Identity = {
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<Result>;
  };
  me: { user: { id: string } };
};
type Context = {
  db: PrismaService;
  operator: Identity;
  buyer: Identity;
  artisan: Identity;
  stranger: Identity;
  orderId: string;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  send(who: Identity, path: string, body: unknown, key?: string): Promise<Result>;
};
export async function runPlanningCompletionScenarios(c: Context) {
  const { db, operator, buyer, stranger, orderId, send, check } = c;
  const path = `/api/v1/procurement/orders/${orderId}`;
  await check(
    'planning persists reproducible weighted inputs and concurrent drafts remain nonbinding',
    async () => {
      const loaded = await operator.client.request(`${path}/planning`);
      assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
      const view = loaded.body as PlanningWorkspaceView;
      const candidate = view.candidates.find(
        (row) => row.decision === 'ELIGIBLE' && row.allocatablePieces && row.score !== null,
      );
      assert.ok(candidate);
      assert.equal(
        candidate.score,
        Math.round(candidate.scoreComponents.reduce((sum, row) => sum + row.contribution, 0) * 10) /
          10,
      );
      const order = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
      const beforeOffers = await db.commercialOffer.count({ where: { orderId } });
      const input = {
        version: order.version,
        requiredQuantity: view.requiredQuantity,
        materialAssumptions: {
          readiness: 'READY',
          reference: 'SYNTHETIC: operator material receipt scenario, no real stock claim.',
        },
        lines: [{ artisanProfileId: candidate.artisanProfileId, quantity: 10 }],
      };
      const key = randomUUID();
      const duplicate = await Promise.all([
        send(operator, `${path}/allocation-plans`, input, key),
        send(operator, `${path}/allocation-plans`, input, key),
      ]);
      assert.deepEqual(
        duplicate.map((row) => row.status),
        [201, 201],
      );
      const first = duplicate[0].body as { id: string; version: number };
      assert.equal((duplicate[1].body as { id: string }).id, first.id);
      assert.equal(await db.commercialOffer.count({ where: { orderId } }), beforeOffers);
      const snapshot = await db.recommendationSnapshot.findFirstOrThrow({
        where: { orderId },
        include: { policy: true },
      });
      assert.ok(JSON.stringify(snapshot.suggestion).includes('CAPACITY_COVERAGE'));
      assert.ok(JSON.stringify(snapshot.candidates).includes('scoreComponents'));
      assert.ok(JSON.stringify(snapshot.policy.inputs).includes('weights'));
      const reviewed = await send(
        operator,
        `/api/v1/procurement/allocation-plans/${first.id}/review`,
        { version: first.version, confirm: true },
      );
      assert.equal(reviewed.status, 201, JSON.stringify(reviewed.body));
      assert.equal(await db.commercialBatch.count({ where: { orderId } }), 0);
      const inaccessible = await buyer.client.request(`${path}/planning`);
      assert.equal(inaccessible.status, 403);
      assert.equal((await stranger.client.request(`${path}/planning`)).status, 404);
      assert.equal(await db.allocationPlan.count({ where: { orderId } }), 1);
    },
  );
  await check(
    'planning refuses unknown materials at review and overrides never exceed hard capacity',
    async () => {
      const view = (await operator.client.request(`${path}/planning`))
        .body as PlanningWorkspaceView;
      const candidate = view.candidates.find(
        (row) => row.decision === 'ELIGIBLE' && row.allocatablePieces,
      );
      assert.ok(candidate);
      const unknown = await send(operator, `${path}/allocation-plans`, {
        version: view.orderVersion,
        requiredQuantity: view.requiredQuantity,
        lines: [{ artisanProfileId: candidate.artisanProfileId, quantity: 5 }],
      });
      assert.equal(unknown.status, 201, JSON.stringify(unknown.body));
      const draft = unknown.body as { id: string; version: number };
      const review = await send(
        operator,
        `/api/v1/procurement/allocation-plans/${draft.id}/review`,
        { version: draft.version, confirm: true },
      );
      assert.equal(review.status, 409);
      assert.match(JSON.stringify(review.body), /MATERIAL_READINESS_UNKNOWN/);
      const before = await db.allocationPlanItem.findMany({ where: { planId: draft.id } });
      const override = await send(operator, '/api/v1/procurement/allocation-overrides', {
        planId: draft.id,
        version: draft.version,
        artisanProfileId: candidate.artisanProfileId,
        quantity: (candidate.allocatablePieces ?? 0) + 1,
        reason: 'Synthetic attempted hard capacity bypass.',
      });
      assert.equal(override.status, 409);
      assert.deepEqual(
        await db.allocationPlanItem.findMany({ where: { planId: draft.id } }),
        before,
      );
      assert.equal(
        (
          await buyer.client.request(
            `${path}/planning/audit?purpose=Review%20synthetic%20allocation`,
          )
        ).status,
        403,
      );
      const auditView = await operator.client.request(
        `${path}/planning/audit?purpose=Review%20synthetic%20allocation`,
      );
      assert.equal(auditView.status, 200);
      assert.equal(
        await db.auditEvent.count({
          where: { action: 'planning.audit.reviewed', targetId: orderId },
        }),
        1,
      );
    },
  );
  await check(
    'pricing effort range and exact recalculation stay advisory with source disclosure',
    async () => {
      const body = {
        quantity: 100,
        artisanUnitTnd: '3.001',
        materialsUnitTnd: '2.001',
        qualityUnitTnd: '0.100',
        packagingUnitTnd: '0.200',
        transportFixedTnd: '10.001',
        overheadFixedTnd: '20.002',
        contingencyPercent: 0,
        effortMinutesPerPiece: 20,
        effortRange: { min: 15, max: 30 },
        assumptionSource: 'ILLUSTRATIVE: synthetic editable inputs.',
      };
      const before = await db.procurementQuote.findMany({
        where: { rfq: { order: { id: orderId } } },
      });
      const response = await send(operator, `${path}/pricing-suggestion`, body);
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal((response.body as { totalCostTnd: string }).totalCostTnd, '560.203');
      assert.deepEqual((response.body as { effortRange: unknown }).effortRange, {
        min: 15,
        max: 30,
      });
      assert.deepEqual(
        await db.procurementQuote.findMany({ where: { rfq: { order: { id: orderId } } } }),
        before,
      );
      const original = await db.commercialOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { rfq: true },
      });
      const target = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: original.rfq.buyerOrganizationId,
          operatorOrganizationId: original.rfq.operatorOrganizationId,
          craftSkillId: original.rfq.craftSkillId,
          title: 'Synthetic fresh pricing handoff request',
          designRequirements: original.rfq.designRequirements,
          specification: original.rfq.specification,
          quantity: 100,
          deliveryAt: original.rfq.deliveryAt,
          deliveryLocation: original.rfq.deliveryLocation,
          status: 'UNDER_REVIEW',
          procurementManaged: true,
        },
      });
      const feasibility = await db.feasibilityAssessment.create({
        data: {
          rfqId: target.id,
          version: 1,
          rfqVersion: 1,
          result: 'NEEDS_REVIEW',
          unitType: 'PIECES',
          requestedQuantity: '100.00',
          constraints: [],
          explanation: 'Synthetic request feasibility for cost review only.',
          assumptions: { provenance: 'SYNTHETIC' },
          authorId: operator.me.user.id,
        },
      });
      const handoff = {
        assumptions: body,
        targetRfqId: target.id,
        targetVersion: target.version,
        feasibilityId: feasibility.id,
        approveForCosting: true,
        reviewReference:
          'Synthetic quotation operator explicitly approved assumptions for cost preparation.',
      };
      assert.equal((await send(buyer, `${path}/pricing-handoff`, handoff)).status, 403);
      assert.equal(await db.costEstimate.count({ where: { rfqId: target.id } }), 0);
      const key = randomUUID();
      const result = await send(operator, `${path}/pricing-handoff`, handoff, key);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(
        (result.body as { requiresAuthorizedQuoteIssue: boolean }).requiresAuthorizedQuoteIssue,
        true,
      );
      assert.equal((await send(operator, `${path}/pricing-handoff`, handoff, key)).status, 201);
      assert.equal(await db.costEstimate.count({ where: { rfqId: target.id } }), 1);
      assert.equal(await db.procurementQuote.count({ where: { rfqId: target.id } }), 0);
      assert.equal(
        (await db.costEstimate.findFirstOrThrow({ where: { rfqId: target.id } })).subtotalMillimes,
        560203n,
      );
      assert.equal(
        (
          await send(operator, `${path}/pricing-handoff`, {
            ...handoff,
            targetRfqId: original.rfq.id,
            targetVersion: original.rfq.version,
          })
        ).status,
        409,
      );
      assert.deepEqual(
        await db.procurementQuote.findMany({ where: { rfq: { order: { id: orderId } } } }),
        before,
      );
    },
  );
}

export async function runIntelligenceCompletionScenarios(c: Context & { batchId: string }) {
  const { db, operator, buyer, artisan, stranger, batchId, send, check } = c;
  const root = `/api/v1/intelligence/batches/${batchId}`;
  await check(
    'observed production time requires artisan consent, rejects duplicates and retains correction history',
    async () => {
      assert.equal((await artisan.client.request(`${root}/earnings`)).status, 200);
      const end = new Date(Date.now() - 60000);
      const start = new Date(end.getTime() - 3600000);
      const input = {
        consented: true,
        periodFrom: start.toISOString(),
        periodTo: end.toISOString(),
        observedMinutes: 30,
        observedUnits: 40,
        unitContext: 'SYNTHETIC: ten-piece weaving task',
        evidence: 'SYNTHETIC',
        provenance: 'Synthetic observed-time fixture, no physical time study.',
      };
      assert.equal((await send(operator, `${root}/time-records`, input)).status, 403);
      assert.equal((await send(stranger, `${root}/time-records`, input)).status, 404);
      assert.equal(
        (await send(artisan, `${root}/time-records`, { ...input, consented: false })).status,
        400,
      );
      assert.equal(
        (await send(artisan, `${root}/time-records`, { ...input, observedMinutes: 0 })).status,
        400,
      );
      assert.equal(
        (await send(artisan, `${root}/time-records`, { ...input, observedMinutes: -1 })).status,
        400,
      );
      assert.equal(await db.productionTimeRecord.count({ where: { batchId } }), 0);
      const key = randomUUID();
      const results = await Promise.all([
        send(artisan, `${root}/time-records`, input, key),
        send(artisan, `${root}/time-records`, input, key),
      ]);
      assert.deepEqual(
        results.map((row) => row.status),
        [201, 201],
      );
      const first = results[0].body as { id: string };
      assert.equal((results[1].body as { id: string }).id, first.id);
      assert.equal((await send(artisan, `${root}/time-records`, input)).status, 409);
      const correction = await send(artisan, `${root}/time-records`, {
        ...input,
        observedMinutes: 45,
        correctionOfId: first.id,
      });
      assert.equal(correction.status, 201, JSON.stringify(correction.body));
      assert.equal(await db.productionTimeRecord.count({ where: { batchId } }), 2);
      assert.equal(
        (await db.productionTimeRecord.findUniqueOrThrow({ where: { id: first.id } }))
          .observedMinutes,
        30,
      );
      await assert.rejects(
        db.productionTimeRecord.update({ where: { id: first.id }, data: { observedMinutes: 31 } }),
      );
      const report = await artisan.client.request(`${root}/earnings`);
      assert.equal(
        (report.body as { estimate: { observedMinutes: number } }).estimate.observedMinutes,
        45,
      );
      // Full agreed pay must never be divided by only the known half of the batch time.
      const correctedId = (correction.body as { id: string }).id;
      const partial = await send(artisan, `${root}/time-records`, {
        ...input,
        observedMinutes: 30,
        observedUnits: 20,
        correctionOfId: correctedId,
      });
      assert.equal(partial.status, 201, JSON.stringify(partial.body));
      type Earnings = {
        estimate: {
          status: string;
          hourlyTnd: string | null;
          observedMinutes: number | null;
          policyVersion: number;
        };
        compensation: { agreed: string; verifiedPaid: string; verifiedAvailable: boolean };
        evidenceClasses: string[];
      };
      const partialReport = await artisan.client.request(`${root}/earnings`);
      assert.equal(partialReport.status, 200);
      assert.equal((partialReport.body as Earnings).estimate.status, 'UNAVAILABLE');
      const nextInput = {
        ...input,
        periodFrom: new Date(start.getTime() - 7200000).toISOString(),
        periodTo: new Date(start.getTime() - 3600000).toISOString(),
        observedUnits: 20,
        observedMinutes: null,
      };
      const unknown = await send(artisan, `${root}/time-records`, nextInput);
      assert.equal(unknown.status, 201, JSON.stringify(unknown.body));
      const unknownReport = await artisan.client.request(`${root}/earnings`);
      assert.equal(unknownReport.status, 200);
      assert.equal((unknownReport.body as Earnings).estimate.status, 'UNAVAILABLE');
      assert.equal((unknownReport.body as Earnings).estimate.hourlyTnd, null);
      assert.equal((unknownReport.body as Earnings).estimate.observedMinutes, null);
      assert.equal(
        (unknownReport.body as Earnings).compensation.agreed,
        (report.body as Earnings).compensation.agreed,
      );
      const completedTime = await send(artisan, `${root}/time-records`, {
        ...nextInput,
        observedMinutes: 30,
        correctionOfId: (unknown.body as { id: string }).id,
      });
      assert.equal(completedTime.status, 201, JSON.stringify(completedTime.body));
      const completeReport = await artisan.client.request(`${root}/earnings`);
      assert.equal(completeReport.status, 200);
      const complete = completeReport.body as Earnings;
      assert.equal(complete.estimate.status, 'AVAILABLE');
      assert.equal(complete.estimate.observedMinutes, 60);
      assert.equal(complete.estimate.hourlyTnd, complete.compensation.agreed);
      assert.equal(complete.estimate.policyVersion, 2);
      assert.deepEqual(complete.evidenceClasses, ['SYNTHETIC']);
      assert.equal(complete.compensation.verifiedPaid, '0.000');
      assert.equal(complete.compensation.verifiedAvailable, false);
      assert.equal((await buyer.client.request(`${root}/earnings`)).status, 404);
      assert.equal((await stranger.client.request(`${root}/earnings`)).status, 404);
    },
  );
  await check(
    'forecast snapshots are immutable, versioned and scoped; no completion means no accuracy',
    async () => {
      const input = {
        forecastedFor: '2027-11-19T08:00:00.000Z',
        assumptions: 'SYNTHETIC: explicit supported planning assumptions for comparison fixture.',
        evidence: 'SYNTHETIC',
      };
      assert.equal((await send(buyer, `${root}/forecasts`, input)).status, 404);
      const key = randomUUID();
      const saved = await send(operator, `${root}/forecasts`, input, key);
      assert.equal(saved.status, 201, JSON.stringify(saved.body));
      const row = saved.body as { id: string };
      assert.equal((await send(operator, `${root}/forecasts`, input, key)).status, 201);
      assert.equal(await db.forecastSnapshot.count({ where: { batchId } }), 1);
      await assert.rejects(
        db.forecastSnapshot.update({ where: { id: row.id }, data: { forecastedFor: new Date() } }),
      );
      const view = await operator.client.request('/api/v1/intelligence');
      assert.equal(view.status, 200, JSON.stringify(view.body));
      assert.equal(
        (
          await send(operator, `/api/v1/intelligence/batches/${batchId}/forecasts`, {
            forecastedFor: new Date(Date.now() + 86400000).toISOString(),
            assumptions: 'SYNTHETIC cannot become a genuine observed forecast.',
            evidence: 'OBSERVED',
          })
        ).status,
        409,
      );
      const data = view.body as IntelligenceWorkspaceView;
      assert.equal(
        data.forecasts.find((item) => item.batchId === batchId)?.comparison.status,
        'NOT_COMPLETED',
      );
      assert.equal(
        data.batches.find((item) => item.batchId === batchId)?.interventionOwner,
        'PRODUCTION_MANAGER',
      );
      assert.equal(
        data.fairness.suppressed,
        data.fairness.cohort > 0 && data.fairness.cohort < data.fairness.minimumCohort,
      );
      if (data.fairness.suppressed) assert.equal(data.fairness.rows.length, 0);
      assert.match(data.fairness.note, /eligible participants/);
      assert.equal((await buyer.client.request('/api/v1/intelligence')).status, 403);
    },
  );
}

export async function runIntelligenceLifecycleScenarios(c: Context & { batchId: string }) {
  const { db, operator, buyer, artisan, stranger, orderId, batchId, send, check } = c;
  await check(
    'FPA-05 HTTP workspace reports a deadline passed six hours ago as overdue',
    async () => {
      const batch = await db.commercialBatch.findUniqueOrThrow({
        where: { id: batchId },
        include: { offer: true },
      });
      const deadline = new Date(Date.now() - 6 * 3600000);
      try {
        await db.commercialOffer.update({
          where: { id: batch.offer.id },
          data: { deliveryDeadline: deadline },
        });
        const response = await operator.client.request('/api/v1/intelligence');
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const workspace = response.body as IntelligenceWorkspaceView;
        const view = workspace.batches.find((row) => row.batchId === batchId);
        assert.ok(view, 'the scoped batch must be present');
        assert.ok((view.risk.remainingQuantity ?? 0) > 0);
        assert.equal(view.risk.state, 'OVERDUE');
        assert.equal(view.deadline, deadline.toISOString());
        assert.equal(view.risk.policyVersion, 3);
        assert.equal(workspace.riskPolicyVersion, 3);
        assert.ok(view.risk.reasons.some((row) => row.code === 'DEADLINE_PASSED'));
      } finally {
        await db.commercialOffer.update({
          where: { id: batch.offer.id },
          data: { deliveryDeadline: batch.offer.deliveryDeadline },
        });
      }
    },
  );
  await check(
    'risk alerts deduplicate under concurrent evaluation and require scoped acknowledgement and resolution',
    async () => {
      const exception = await db.productionException.create({
        data: {
          batchId,
          orderId,
          reporterId: artisan.me.user.id,
          reporterRole: 'ARTISAN',
          category: 'MATERIAL_SHORTAGE',
          severity: 'CRITICAL',
          description: 'SYNTHETIC: verified scenario shortage for alert lifecycle.',
        },
      });
      const evaluated = await Promise.all([
        send(operator, '/api/v1/intelligence/alerts/evaluate', {}),
        send(operator, '/api/v1/intelligence/alerts/evaluate', {}),
      ]);
      assert.deepEqual(
        evaluated.map((row) => row.status),
        [201, 201],
        JSON.stringify(evaluated),
      );
      const alerts = await db.batchAlert.findMany({ where: { batchId } });
      assert.equal(alerts.length, 1);
      const alert = alerts[0];
      assert.equal(alert.status, 'OPEN');
      assert.equal(alert.ownerRole, 'PRODUCTION_MANAGER');
      assert.equal(
        (
          await send(buyer, `/api/v1/intelligence/alerts/${alert.id}/decision`, {
            action: 'RESOLVE',
            reason: 'Synthetic unauthorized resolution attempt.',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await send(stranger, `/api/v1/intelligence/alerts/${alert.id}/decision`, {
            action: 'ACKNOWLEDGE',
            reason: 'Synthetic cross-organization acknowledgement attempt.',
          })
        ).status,
        404,
      );
      assert.equal(
        (await db.batchAlert.findUniqueOrThrow({ where: { id: alert.id } })).status,
        'OPEN',
      );
      const key = randomUUID();
      const body = {
        action: 'ACKNOWLEDGE',
        reason: 'Synthetic production manager reviewed shortage.',
      };
      assert.equal(
        (await send(operator, `/api/v1/intelligence/alerts/${alert.id}/decision`, body, key))
          .status,
        201,
      );
      assert.equal(
        (await send(operator, `/api/v1/intelligence/alerts/${alert.id}/decision`, body, key))
          .status,
        201,
      );
      await db.productionException.update({
        where: { id: exception.id },
        data: {
          status: 'RESOLVED',
          resolution: 'Synthetic scenario material availability restored.',
          resolvedAt: new Date(),
        },
      });
      assert.equal(
        (
          await send(operator, `/api/v1/intelligence/alerts/${alert.id}/decision`, {
            action: 'RESOLVE',
            reason: 'Synthetic corrective material intervention complete.',
          })
        ).status,
        201,
      );
      assert.equal(
        (await db.batchAlert.findUniqueOrThrow({ where: { id: alert.id } })).status,
        'RESOLVED',
      );
      assert.equal(
        await db.auditEvent.count({
          where: { targetId: alert.id, action: 'intelligence.alert.decided' },
        }),
        2,
      );
    },
  );
  await check(
    'ranking audit findings retain purpose, review owner and human corrective decision without penalties',
    async () => {
      const input = {
        orderId,
        purpose: 'Review synthetic offer exposure for the defined reporting month.',
        finding: 'Synthetic cohort is sparse; no systematic bias conclusion can be drawn.',
        correctiveDecision:
          'Collect further consented operational evidence and review allocation assumptions.',
      };
      assert.equal(
        (await send(buyer, '/api/v1/intelligence/ranking-audit/findings', input)).status,
        404,
      );
      const before = await db.artisanProfile.findMany({
        where: { commercialBatches: { some: { orderId } } },
      });
      const key = randomUUID();
      const result = await send(
        operator,
        '/api/v1/intelligence/ranking-audit/findings',
        input,
        key,
      );
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(
        (await send(operator, '/api/v1/intelligence/ranking-audit/findings', input, key)).status,
        201,
      );
      const recorded = await db.auditEvent.findMany({
        where: { action: 'intelligence.audit.finding', targetId: orderId },
      });
      assert.equal(recorded.length, 1);
      assert.equal(
        (recorded[0].after as { reviewOwnerId: string }).reviewOwnerId,
        operator.me.user.id,
      );
      assert.equal(
        (recorded[0].after as { automatedWorkerPenalty: boolean }).automatedWorkerPenalty,
        false,
      );
      assert.deepEqual(
        await db.artisanProfile.findMany({ where: { commercialBatches: { some: { orderId } } } }),
        before,
      );
    },
  );
  await check(
    'reporting periods are bounded and narrow association filters cannot reveal suppressed compensation',
    async () => {
      const actual = await operator.client.request('/api/v1/intelligence');
      assert.equal(actual.status, 200, JSON.stringify(actual.body));
      const view = actual.body as IntelligenceWorkspaceView;
      assert.equal(view.period.timezone, 'Africa/Tunis');
      assert.equal(view.compensation, null);
      assert.equal(view.producerShare.suppressed, true);
      const empty = await operator.client.request('/api/v1/intelligence?month=2000-01');
      assert.equal(empty.status, 200);
      assert.equal((empty.body as IntelligenceWorkspaceView).fulfillment.produced.value, null);
      const policy = await send(operator, '/api/v1/intelligence/reporting-policy/review', {
        minimumCohort: 1,
        reviewReference: 'Attempt to lower policy below the privacy floor.',
      });
      assert.equal(policy.status, 400);
      assert.equal(
        (
          await send(operator, '/api/v1/intelligence/reporting-policy/review', {
            minimumCohort: 10,
            reviewReference: 'Synthetic unauthorized policy review attempt.',
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'reviewed cohort policy requires platform governance and preserves its reviewer and version',
    async () => {
      await db.user.update({ where: { id: stranger.me.user.id }, data: { role: 'ADMIN' } });
      try {
        const input = {
          minimumCohort: 5,
          reviewReference:
            'SYNTHETIC engineering policy-review fixture; not production owner acceptance.',
        };
        const result = await send(stranger, '/api/v1/intelligence/reporting-policy/review', input);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        const stored = await db.reportingPolicy.findFirstOrThrow({
          where: { reviewedById: stranger.me.user.id },
          orderBy: { version: 'desc' },
        });
        assert.equal((stored.value as { minimumCohort: number }).minimumCohort, 5);
        assert.ok(stored.version > 1);
      } finally {
        await db.user.update({ where: { id: stranger.me.user.id }, data: { role: 'USER' } });
      }
    },
  );
}

export async function runPlanningOfferLifecycleScenarios(c: Context) {
  const { db, operator, buyer, stranger, orderId, send, check } = c;
  await check(
    'plan issuance is atomic and retry-safe; concurrent reallocation releases only declined/expired quantities',
    async () => {
      const source = await db.commercialOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          rfq: true,
          acceptance: {
            include: { quote: { include: { costEstimate: true, feasibilityAssessment: true } } },
          },
        },
      });
      assert.ok(source.acceptance?.quote.costEstimate);
      assert.ok(source.acceptance.quote.feasibilityAssessment);
      const template = source.acceptance.quote;
      const rfq = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: source.rfq.buyerOrganizationId,
          operatorOrganizationId: source.rfq.operatorOrganizationId,
          craftSkillId: source.rfq.craftSkillId,
          title: 'Synthetic plan offer lifecycle',
          specification: source.rfq.specification,
          designRequirements: source.rfq.designRequirements,
          quantity: 100,
          deliveryAt: source.rfq.deliveryAt,
          deliveryLocation: source.rfq.deliveryLocation,
          status: 'ACCEPTED',
          procurementManaged: true,
          order: { create: { status: 'APPROVED' } },
        },
        include: { order: true },
      });
      assert.ok(rfq.order);
      const targetOrder = rfq.order;
      const revision = await db.procurementRevision.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          authorId: operator.me.user.id,
          reason: 'Synthetic isolated planning lifecycle',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const feasibility = await db.feasibilityAssessment.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          rfqVersion: 1,
          result: 'FEASIBLE',
          unitType: 'PIECES',
          requestedQuantity: '100.00',
          knownRemaining: '300.00',
          effortMin: template.feasibilityAssessment!.effortMin,
          effortMax: template.feasibilityAssessment!.effortMax,
          constraints: [],
          explanation: 'Synthetic isolated planning capacity.',
          assumptions: template.feasibilityAssessment!
            .assumptions as import('@prisma/client').Prisma.InputJsonValue,
          authorId: operator.me.user.id,
        },
      });
      const cost = await db.costEstimate.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          feasibilityAssessmentId: feasibility.id,
          quantity: 100,
          components: template.costEstimate!
            .components as import('@prisma/client').Prisma.InputJsonValue,
          subtotalMillimes: template.costEstimate!.subtotalMillimes,
          marginMethod: 'NONE',
          marginBasisPoints: 0,
          sellingMillimes: template.costEstimate!.sellingMillimes,
          incomplete: false,
          status: 'APPROVED',
          authorId: operator.me.user.id,
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      await db.procurementQuote.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          revisionId: revision.id,
          authorId: operator.me.user.id,
          totalMillimes: template.totalMillimes,
          expiresAt: template.expiresAt,
          snapshot: { provenance: 'SYNTHETIC' },
          feasibilityAssessmentId: feasibility.id,
          costEstimateId: cost.id,
          termsSha256: 'ef'.repeat(32),
          acceptance: {
            create: {
              orderId: targetOrder.id,
              actorId: buyer.me.user.id,
              snapshot: { provenance: 'SYNTHETIC' },
            },
          },
        },
      });
      const management = await db.artisanManagement.findFirstOrThrow({
        where: { artisan: { userId: c.artisan.me.user.id }, endedAt: null },
      });
      const period = template.feasibilityAssessment!.assumptions as {
        effectiveFrom: string;
        effectiveTo: string;
      };
      const profiles: { id: string }[] = [];
      for (const identity of [stranger, buyer, operator]) {
        const profile = await db.artisanProfile.create({
          data: {
            userId: identity.me.user.id,
            displayName: `Synthetic isolated planner ${profiles.length}`,
            region: 'Synthetic Sfax',
            skills: { create: { craftSkillId: 'weaving' } },
            equipment: [],
          },
        });
        await db.consentRecord.create({
          data: {
            userId: identity.me.user.id,
            purpose: 'artisan.profile',
            decision: true,
            policyVersion: 'artisan-profile-v1',
            collectionContext: 'synthetic_planning_lifecycle',
          },
        });
        await db.artisanManagement.create({
          data: {
            artisanProfileId: profile.id,
            organizationId: management.organizationId,
            recordedById: operator.me.user.id,
            reason: 'Synthetic isolated planner registration',
          },
        });
        await db.capacityDeclaration.create({
          data: {
            artisanProfileId: profile.id,
            craftSkillId: 'weaving',
            unitType: 'PIECES',
            quantity: 100,
            effectiveFrom: new Date(period.effectiveFrom),
            effectiveTo: new Date(period.effectiveTo),
            declaredByUserId: identity.me.user.id,
          },
        });
        profiles.push(profile);
      }
      const root = `/api/v1/procurement/orders/${targetOrder.id}`;
      const assessed = await send(operator, `${root}/eligibility-assessments`, {
        version: targetOrder.version,
        restrictionsReviewed: true,
        restrictionSource: 'Synthetic isolated product restrictions.',
      });
      assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
      const create = await send(operator, `${root}/allocation-plans`, {
        version: (assessed.body as { summary: { orderVersion: number } }).summary.orderVersion,
        requiredQuantity: 100,
        materialAssumptions: {
          readiness: 'READY',
          reference: 'SYNTHETIC: planning materials assumption, not physical receipt.',
        },
        lines: profiles.map((row) => ({ artisanProfileId: row.id, quantity: 10 })),
      });
      assert.equal(create.status, 201, JSON.stringify(create.body));
      const draft = create.body as { id: string; version: number };
      const reviewed = await send(
        operator,
        `/api/v1/procurement/allocation-plans/${draft.id}/review`,
        { version: draft.version, confirm: true },
      );
      assert.equal(reviewed.status, 201, JSON.stringify(reviewed.body));
      const plan = reviewed.body as { id: string; version: number };
      const input = {
        version: plan.version,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      const key = randomUUID();
      const issued = await Promise.all([
        send(operator, `/api/v1/procurement/allocation-plans/${plan.id}/offers`, input, key),
        send(operator, `/api/v1/procurement/allocation-plans/${plan.id}/offers`, input, key),
      ]);
      assert.deepEqual(
        issued.map((row) => row.status),
        [201, 201],
        JSON.stringify(issued),
      );
      const offers = await db.commercialOffer.findMany({
        where: { orderId: targetOrder.id },
        orderBy: { artisanProfileId: 'asc' },
      });
      assert.equal(offers.length, 3);
      assert.ok(offers.every((row) => row.status === 'OFFERED'));
      assert.equal(await db.commercialBatch.count({ where: { orderId: targetOrder.id } }), 0);
      const accepted = offers.find((row) => row.artisanProfileId === profiles[0].id)!;
      const declined = offers.find((row) => row.artisanProfileId === profiles[1].id)!;
      const expired = offers.find((row) => row.artisanProfileId === profiles[2].id)!;
      assert.equal(
        (
          await send(stranger, `/api/v1/commerce/offers/${accepted.id}/actions`, {
            next: 'ACCEPTED',
            reviewLanguage: 'en',
            sourceTermsLanguage: 'en',
            acknowledgeOriginalTerms: true,
            version: accepted.version,
            termsSha256: accepted.termsSha256,
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await send(buyer, `/api/v1/commerce/offers/${declined.id}/actions`, {
            next: 'DECLINED',
            version: declined.version,
            termsSha256: declined.termsSha256,
          })
        ).status,
        201,
      );
      await db.commercialOffer.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 60000) },
      });
      const current = await db.allocationPlan.findUniqueOrThrow({ where: { id: plan.id } });
      const reallocation = {
        version: current.version,
        artisanProfileIds: profiles.map((row) => row.id),
      };
      const reallocated = await Promise.all([
        send(operator, `/api/v1/procurement/allocation-plans/${plan.id}/reallocate`, reallocation),
        send(operator, `/api/v1/procurement/allocation-plans/${plan.id}/reallocate`, reallocation),
      ]);
      assert.deepEqual(
        reallocated.map((row) => row.status).sort(),
        [201, 409],
        JSON.stringify(reallocated),
      );
      const rows = await db.allocationPlanItem.findMany({ where: { planId: plan.id } });
      assert.equal(
        rows.reduce((sum, row) => sum + row.releasedQuantity, 0),
        20,
      );
      assert.equal(rows.find((row) => row.offerId === accepted.id)?.state, 'ACCEPTED');
      assert.equal(rows.find((row) => row.offerId === accepted.id)?.releasedQuantity, 0);
      const outcome = reallocated.find((row) => row.status === 201)!.body as {
        replacementSources: { offerId: string }[];
        replacements: { reason: string; deliveryFeasibility: string }[];
      };
      assert.equal(outcome.replacementSources.length, 2);
      assert.ok(outcome.replacementSources.every((source) => source.offerId !== accepted.id));
      assert.equal(
        outcome.replacements.length,
        2,
        'Nonempty declined/expired candidates; accepted artisan excluded',
      );
      assert.ok(
        outcome.replacements.every(
          (candidate) =>
            candidate.reason.includes('no penalty') && candidate.deliveryFeasibility === 'UNKNOWN',
        ),
      );
      // FPA-06: reviewed operator assumptions are distinct from a declared period budget.
      // These are synthetic test assumptions, not approvals of real production rates.
      const assumptions = {
        version: (await db.commercialOrder.findUniqueOrThrow({ where: { id: targetOrder.id } }))
          .version,
        startDate: period.effectiveFrom,
        deadline: period.effectiveTo,
        reviewedAssumptions: {
          reference: 'SYNTHETIC operator review of throughput, materials and allowances.',
          leadTimeDays: 0,
          bufferDays: 0,
        },
        scenarios: [
          {
            name: 'Synthetic replacement rates',
            lines: [
              {
                artisanProfileId: profiles[1].id,
                quantity: 20,
                weeklyPieces: 100,
                committedPieces: 0,
                committedWeeks: 1,
                availableFrom: period.effectiveFrom,
                materialReadiness: 'READY',
              },
              {
                artisanProfileId: profiles[2].id,
                quantity: 20,
                weeklyPieces: 1,
                committedPieces: 0,
                committedWeeks: 1,
                availableFrom: period.effectiveFrom,
                materialReadiness: 'READY',
              },
            ],
          },
        ],
      };
      const simulated = await send(operator, `${root}/delivery-simulation`, assumptions);
      assert.equal(simulated.status, 201, JSON.stringify(simulated.body));
      type Candidate = {
        artisanProfileId: string;
        replacementForOfferIds: string[];
        deliveryFeasibility: string;
        knownRemaining: string;
        evidence: {
          sourceScenarioId: string | null;
          capacity: { reserved: string; committed: string };
          simulationInput: unknown;
        };
      };
      async function evaluate(ids = profiles.map((profile) => profile.id), key = randomUUID()) {
        const latest = await db.allocationPlan.findUniqueOrThrow({ where: { id: plan.id } });
        const response = await send(
          operator,
          `/api/v1/procurement/allocation-plans/${plan.id}/reallocate`,
          { version: latest.version, artisanProfileIds: ids },
          key,
        );
        assert.equal(response.status, 201, JSON.stringify(response.body));
        return response.body as { released: number; replacements: Candidate[] };
      }
      const evaluated = await evaluate();
      assert.equal(evaluated.replacements.length, 2);
      assert.equal(
        evaluated.replacements.find((row) => row.artisanProfileId === profiles[1].id)
          ?.deliveryFeasibility,
        'FEASIBLE',
      );
      assert.equal(
        evaluated.replacements.find((row) => row.artisanProfileId === profiles[2].id)
          ?.deliveryFeasibility,
        'INFEASIBLE',
      );
      assert.equal(evaluated.released, 0, 'Tentative quantity is released once');
      for (const candidate of evaluated.replacements)
        assert.deepEqual(
          candidate.replacementForOfferIds.slice().sort(),
          [declined.id, expired.id].sort(),
          'Recomputed feasibility remains linked to the original released offers',
        );
      assert.ok(evaluated.replacements.every((row) => row.evidence.sourceScenarioId));
      const savedOutcome = await db.commandOutcome.findFirstOrThrow({
        where: { resourceId: plan.id, operation: 'planning.plan.reallocate' },
        orderBy: { createdAt: 'desc' },
      });
      assert.deepEqual(
        (savedOutcome.result as { replacements: unknown }).replacements,
        evaluated.replacements,
        'Exact evaluation and dated input snapshot are persisted atomically',
      );
      await db.allocationPlan.update({
        where: { id: plan.id },
        data: {
          materialAssumptions: {
            readiness: 'UNKNOWN',
            reference: 'Synthetic material review expired.',
          },
        },
      });
      const unknownMaterials = await evaluate([profiles[1].id]);
      assert.equal(unknownMaterials.replacements.length, 1);
      assert.equal(
        unknownMaterials.replacements[0].deliveryFeasibility,
        'UNKNOWN',
        'Old READY simulation cannot override current unknown materials',
      );
      await db.allocationPlan.update({
        where: { id: plan.id },
        data: {
          materialAssumptions: { readiness: 'READY', reference: 'Synthetic materials rereviewed.' },
        },
      });
      assert.equal((await evaluate([])).replacements.length, 0);
      assert.equal(
        (await evaluate([profiles[0].id])).replacements.length,
        0,
        'Accepted work is busy and never proposed',
      );
      // Eligibility and consent are reread even though the reviewed scenario still exists.
      const assessment = await db.eligibilityAssessment.findFirstOrThrow({
        where: { orderId: targetOrder.id, artisanProfileId: profiles[1].id },
        orderBy: { version: 'desc' },
      });
      const { id: _assessmentId, createdAt: _assessmentCreatedAt, ...assessmentData } = assessment;
      await db.eligibilityAssessment.create({
        data: {
          ...assessmentData,
          reasons: assessment.reasons as import('@prisma/client').Prisma.InputJsonValue,
          unknowns: assessment.unknowns as import('@prisma/client').Prisma.InputJsonValue,
          version: assessment.version + 1,
          decision: 'INELIGIBLE',
        },
      });
      assert.equal((await evaluate([profiles[1].id])).replacements.length, 0);
      await db.eligibilityAssessment.create({
        data: {
          ...assessmentData,
          reasons: assessment.reasons as import('@prisma/client').Prisma.InputJsonValue,
          unknowns: assessment.unknowns as import('@prisma/client').Prisma.InputJsonValue,
          version: assessment.version + 2,
          decision: 'ELIGIBLE',
        },
      });
      await db.consentRecord.updateMany({
        where: { userId: buyer.me.user.id, purpose: 'artisan.profile' },
        data: { withdrawnAt: new Date() },
      });
      assert.equal((await evaluate([profiles[1].id])).replacements.length, 0);
      await db.consentRecord.updateMany({
        where: { userId: buyer.me.user.id, purpose: 'artisan.profile' },
        data: { withdrawnAt: null },
      });
      async function reviseCapacity(quantity: number) {
        const capacity = await db.capacityDeclaration.findFirstOrThrow({
          where: { artisanProfileId: profiles[1].id, supersededAt: null },
        });
        await db.capacityDeclaration.update({
          where: { id: capacity.id },
          data: { supersededAt: new Date() },
        });
        return db.capacityDeclaration.create({
          data: {
            artisanProfileId: capacity.artisanProfileId,
            craftSkillId: capacity.craftSkillId,
            unitType: capacity.unitType,
            quantity,
            effectiveFrom: capacity.effectiveFrom,
            effectiveTo: capacity.effectiveTo,
            declaredByUserId: capacity.declaredByUserId,
            previousDeclarationId: capacity.id,
            version: capacity.version + 1,
          },
        });
      }
      await reviseCapacity(100);
      const stale = await evaluate([profiles[1].id]);
      assert.equal(stale.replacements.length, 1);
      assert.equal(
        stale.replacements[0].deliveryFeasibility,
        'UNKNOWN',
        'Revised capacity needs fresh throughput review',
      );
      await reviseCapacity(5);
      const insufficient = await evaluate([profiles[1].id]);
      assert.equal(insufficient.replacements.length, 1);
      assert.equal(insufficient.replacements[0].deliveryFeasibility, 'INFEASIBLE');
      await reviseCapacity(100);
      const updated = await db.allocationPlan.findUniqueOrThrow({ where: { id: plan.id } });
      const again = await send(
        operator,
        `/api/v1/procurement/allocation-plans/${plan.id}/reallocate`,
        { ...reallocation, version: updated.version },
      );
      assert.equal(again.status, 201);
      assert.equal((again.body as { released: number }).released, 0);
      assert.equal(
        (again.body as { plan: { totals: { unallocated: number; accepted: number } } }).plan.totals
          .unallocated,
        90,
      );
      assert.equal(await db.commercialBatch.count({ where: { offerId: accepted.id } }), 1);
    },
  );
}
