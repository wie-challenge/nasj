import {
  runPlanningCompletionScenarios,
  runIntelligenceCompletionScenarios,
  runIntelligenceLifecycleScenarios,
  runPlanningOfferLifecycleScenarios,
} from './planning-intelligence.scenarios.js';
import { runFinanceScenarios } from './finance.scenarios.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
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
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
const code = (result: Result) => (result.body as { code?: string }).code;
export async function runExecutionScenarios({ db, register, check }: Harness) {
  await check(
    'production release through buyer confirmation, traceability and simulated settlement stay isolated',
    async () => {
      const [buyer, operator, artisan, coordinator, stranger, finance, admin] = await Promise.all(
        ['buyer', 'operator', 'artisan', 'coordinator', 'stranger', 'finance', 'admin'].map(
          (role) => register(`execution-${role}@example.com`, `Synthetic execution ${role}`),
        ),
      );
      await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
      const organization = async (
        name: string,
        type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
        userId: string,
        role: 'BUYER' | 'NASJ_OPERATOR' | 'ASSOCIATION_COORDINATOR' | 'FINANCE_MANAGER',
      ) =>
        db.organization.create({
          data: {
            name,
            slug: name.toLowerCase().replaceAll(' ', '-'),
            type,
            approvalStatus: 'APPROVED',
            region: 'Sfax',
            description: 'Synthetic execution fixture',
            contactEmail: 'execution@example.com',
            representativeName: 'Synthetic representative',
            createdByUserId: userId,
            members: { create: { userId, roles: { create: { role, assignedByUserId: userId } } } },
          },
        });
      const [buyerOrg, operatorOrg, association, otherAssociation] = await Promise.all([
        organization('Execution buyer', 'BUYER_BUSINESS', buyer.me.user.id, 'BUYER'),
        organization('Execution operator', 'INTERNAL', operator.me.user.id, 'NASJ_OPERATOR'),
        organization(
          'Execution association',
          'ASSOCIATION',
          coordinator.me.user.id,
          'ASSOCIATION_COORDINATOR',
        ),
        organization(
          'Execution other association',
          'ASSOCIATION',
          stranger.me.user.id,
          'ASSOCIATION_COORDINATOR',
        ),
      ]);
      await db.organizationMember.create({
        data: {
          organizationId: operatorOrg.id,
          userId: finance.me.user.id,
          roles: { create: { role: 'FINANCE_MANAGER', assignedByUserId: operator.me.user.id } },
        },
      });
      await db.operatorAssignment.create({
        data: {
          operatorId: operator.me.user.id,
          organizationId: buyerOrg.id,
          assignedById: operator.me.user.id,
        },
      });
      const period = {
        effectiveFrom: new Date('2027-11-01T00:00:00+01:00'),
        effectiveTo: new Date('2027-11-08T00:00:00+01:00'),
      };
      const policy = await db.authorizationPolicy.create({
        data: {
          version: 'execution-synthetic',
          methods: ['SIGNED'],
          reviewReference: 'Synthetic reviewed method',
          reviewedById: operator.me.user.id,
        },
      });
      const linked = await db.artisanProfile.create({
        data: {
          displayName: 'Execution linked',
          region: 'Synthetic quarter',
          userId: artisan.me.user.id,
          equipment: [],
          skills: { create: { craftSkillId: 'weaving' } },
        },
      });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: linked.id,
          organizationId: association.id,
          recordedById: coordinator.me.user.id,
          reason: 'Synthetic execution management',
        },
      });
      await db.consentRecord.create({
        data: {
          userId: artisan.me.user.id,
          purpose: 'artisan.profile',
          decision: true,
          policyVersion: 'artisan-profile-v1',
          collectionContext: 'synthetic_execution',
        },
      });
      const accountless = await db.artisanProfile.create({
        data: {
          displayName: 'Execution accountless',
          region: 'Synthetic quarter',
          equipment: [],
          skills: { create: { craftSkillId: 'weaving' } },
        },
      });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: accountless.id,
          organizationId: association.id,
          recordedById: coordinator.me.user.id,
          reason: 'Synthetic execution management',
        },
      });
      await db.onboardingAuthorization.create({
        data: {
          artisanProfileId: accountless.id,
          policyId: policy.id,
          purpose: 'PARTICIPATION',
          method: 'SIGNED',
          occurredAt: new Date(),
          language: 'ar',
          evidenceReference: 'Synthetic participation confirmation',
          recordedById: coordinator.me.user.id,
        },
      });
      for (const profileId of [linked.id, accountless.id]) {
        await db.artisanAssignment.create({
          data: {
            artisanProfileId: profileId,
            coordinatorId: coordinator.me.user.id,
            organizationId: association.id,
            assignedById: coordinator.me.user.id,
            reason: 'Synthetic execution assignment',
          },
        });
        await db.capacityDeclaration.create({
          data: {
            artisanProfileId: profileId,
            craftSkillId: 'weaving',
            unitType: 'PIECES',
            quantity: 50,
            ...period,
            declaredByUserId: operator.me.user.id,
          },
        });
      }
      const rfq = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: buyerOrg.id,
          operatorOrganizationId: operatorOrg.id,
          craftSkillId: 'weaving',
          title: 'Synthetic execution runner',
          specification: 'Synthetic cotton runner, exact version one.',
          designRequirements: 'Synthetic border and dimensions.',
          quantity: 100,
          deliveryAt: new Date('2027-12-01T00:00:00+01:00'),
          deliveryLocation: 'Synthetic Tunis site',
          status: 'ACCEPTED',
          procurementManaged: true,
          order: { create: { status: 'APPROVED' } },
        },
        include: { order: true },
      });
      assert.ok(rfq.order);
      const orderId = rfq.order.id;
      const revision = await db.procurementRevision.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          authorId: operator.me.user.id,
          reason: 'Synthetic baseline specification',
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
          knownRemaining: '100.00',
          effortMin: '150.00',
          effortMax: '250.00',
          constraints: [],
          explanation: 'Synthetic feasible capacity. Materials are not stock.',
          assumptions: {
            effectiveFrom: period.effectiveFrom.toISOString(),
            effectiveTo: period.effectiveTo.toISOString(),
            unit: 'PIECES',
            provenance: 'SYNTHETIC',
            materialNote: 'Feasibility note is not physical receipt',
          },
          authorId: operator.me.user.id,
        },
      });
      const cost = await db.costEstimate.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          feasibilityAssessmentId: feasibility.id,
          quantity: 100,
          components: [
            {
              category: 'ARTISAN_LABOR',
              basis: 'VARIABLE',
              rateTnd: '3.000',
              amountTnd: '300.000',
            },
          ],
          subtotalMillimes: 300000n,
          marginMethod: 'NONE',
          marginBasisPoints: 0,
          sellingMillimes: 300000n,
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
          totalMillimes: 300000n,
          expiresAt: new Date('2027-11-20T00:00:00.000Z'),
          snapshot: { provenance: 'SYNTHETIC' },
          feasibilityAssessmentId: feasibility.id,
          costEstimateId: cost.id,
          termsSha256: 'cd'.repeat(32),
          acceptance: {
            create: {
              orderId,
              actorId: buyer.me.user.id,
              snapshot: {
                capacityReserved: false,
                artisanAccepted: false,
                legalStatus: 'DEMO_ONLY_NOT_A_BINDING_CONTRACT',
              },
            },
          },
        },
      });
      const root = '/api/v1/procurement';
      async function send(who: Identity, path: string, body: unknown, idempotency = randomUUID()) {
        const me = await who.client.request('/api/v1/me');
        assert.equal(me.status, 200);
        return who.client.request(path, 'POST', body, {
          'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
          'Idempotency-Key': idempotency,
        });
      }
      const assessed = await send(operator, `${root}/orders/${orderId}/eligibility-assessments`, {
        version: 1,
        restrictionsReviewed: true,
        restrictionSource: 'Synthetic product file',
      });
      assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
      const workspace = assessed.body as {
        summary: { orderVersion: number };
        assessments: { id: string; displayName: string; decision: string }[];
      };
      const linkedAssessment = workspace.assessments.find(
        (row) => row.displayName === 'Execution linked',
      );
      const accountlessAssessment = workspace.assessments.find(
        (row) => row.displayName === 'Execution accountless',
      );
      assert.equal(linkedAssessment?.decision, 'ELIGIBLE');
      assert.equal(accountlessAssessment?.decision, 'ELIGIBLE');
      await runPlanningCompletionScenarios({
        db,
        operator,
        buyer,
        artisan,
        stranger,
        orderId,
        send,
        check,
      });
      const offerBody = {
        version: workspace.summary.orderVersion,
        quantity: 40,
        expiresAt: '2027-11-20T09:00:00.000+01:00',
        materials: 'Operator supplies synthetic yarn',
        reworkTerms: 'Rework requires a new agreement',
        paymentConditions: 'Pay approved pieces independently of buyer delay',
        collectionArrangement: 'Collect at the synthetic workshop',
        instructions: 'Follow the accepted specification',
      };
      const prepared = await send(operator, `${root}/orders/${orderId}/offers`, {
        ...offerBody,
        eligibilityId: linkedAssessment!.id,
      });
      assert.equal(prepared.status, 201, JSON.stringify(prepared.body));
      const offer = prepared.body as { id: string; version: number; termsSha256: string };
      const issued = await send(operator, `${root}/offers/${offer.id}/issue`, {
        version: offer.version,
      });
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      const issuedOffer = issued.body as { version: number; termsSha256: string };
      const accepted = await send(artisan, `/api/v1/commerce/offers/${offer.id}/actions`, {
        next: 'ACCEPTED',
        reviewLanguage: 'en',
        sourceTermsLanguage: 'en',
        acknowledgeOriginalTerms: true,
        version: issuedOffer.version,
        termsSha256: issuedOffer.termsSha256,
      });
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
      const batch = await db.commercialBatch.findFirstOrThrow({ where: { offerId: offer.id } });
      await runIntelligenceCompletionScenarios({
        db,
        operator,
        buyer,
        artisan,
        stranger,
        orderId,
        batchId: batch.id,
        send,
        check,
      });
      const pendingOffer = await send(operator, `${root}/orders/${orderId}/offers`, {
        ...offerBody,
        version: (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).version,
        eligibilityId: accountlessAssessment!.id,
        quantity: 10,
      });
      assert.equal(pendingOffer.status, 201, JSON.stringify(pendingOffer.body));
      const pending = pendingOffer.body as { id: string; version: number };
      const pendingIssued = await send(operator, `${root}/offers/${pending.id}/issue`, {
        version: pending.version,
      });
      assert.equal(pendingIssued.status, 201, JSON.stringify(pendingIssued.body));
      const reported = await send(coordinator, `${root}/offers/${pending.id}/assisted-decisions`, {
        version: (pendingIssued.body as { version: number }).version,
        decision: 'ACCEPT',
        evidenceReference: 'Synthetic in-person note',
      });
      assert.equal(reported.status, 201, JSON.stringify(reported.body));
      const verified = await send(
        coordinator,
        `${root}/offers/${pending.id}/assisted-decisions/${(reported.body as { assisted: { id: string } }).assisted.id}/verify`,
        {},
      );
      assert.equal(verified.status, 409);
      assert.equal(code(verified), 'VERIFICATION_UNAPPROVED');
      assert.equal(await db.commercialBatch.count({ where: { offerId: pending.id } }), 0);
      const blockedRelease = await send(operator, `${root}/batches/${batch.id}/release`, {
        version: batch.version,
      });
      assert.equal(blockedRelease.status, 409);
      assert.equal(code(blockedRelease), 'SPECIFICATION_UNAPPROVED');
      const sample = await db.procurementSample.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          revisionId: revision.id,
          authorId: operator.me.user.id,
          evidenceReference: 'Synthetic sample board',
          criteria: 'Synthetic color and size check',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      await db.procurementSampleDecision.create({
        data: {
          sampleId: sample.id,
          actorId: buyer.me.user.id,
          decision: 'APPROVED',
          comments: 'Synthetic sample approval.',
        },
      });
      const missingMaterials = await send(operator, `${root}/batches/${batch.id}/release`, {
        version: batch.version,
        fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      });
      assert.equal(code(missingMaterials), 'MISSING_BILL_OF_MATERIALS');
      const hours = await send(operator, `${root}/orders/${orderId}/material-lines`, {
        revisionId: revision.id,
        lines: [
          { materialCode: 'yarn', name: 'Yarn', unit: 'HOURS', perItemMilli: 500, wastageBps: 0 },
        ],
      });
      assert.equal(hours.status, 400);
      const materials = await send(operator, `${root}/orders/${orderId}/material-lines`, {
        revisionId: revision.id,
        lines: [
          { materialCode: 'yarn', name: 'Yarn', unit: 'METERS', perItemMilli: 500, wastageBps: 0 },
          {
            materialCode: 'label',
            name: 'Label',
            unit: 'UNITS',
            perItemMilli: 2000,
            wastageBps: 0,
          },
        ],
      });
      assert.equal(materials.status, 201, JSON.stringify(materials.body));
      const unknownMaterial = await send(operator, `${root}/batches/${batch.id}/release`, {
        version: batch.version,
      });
      assert.equal(code(unknownMaterial), 'MATERIAL_READINESS_UNKNOWN');
      const unfunded = await send(operator, `${root}/batches/${batch.id}/release`, {
        version: batch.version,
        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      });
      assert.equal(code(unfunded), 'FUNDING_UNCONFIRMED');
      const releaseKey = randomUUID();
      const released = await send(
        operator,
        `${root}/batches/${batch.id}/release`,
        {
          version: batch.version,
          fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
          materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
        },
        releaseKey,
      );
      assert.equal(released.status, 201, JSON.stringify(released.body));
      assert.equal((released.body as { commercialStatus: string }).commercialStatus, 'APPROVED');
      const replayed = await send(
        operator,
        `${root}/batches/${batch.id}/release`,
        {
          version: batch.version,
          fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
          materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
        },
        releaseKey,
      );
      assert.equal(replayed.status, 201);
      assert.equal(await db.batchRelease.count({ where: { batchId: batch.id } }), 1);
      const duplicate = await send(operator, `${root}/batches/${batch.id}/release`, {
        version: (released.body as { version: number }).version,
        fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      });
      assert.equal(code(duplicate), 'ALREADY_RELEASED');
      const materialView = await operator.client.request(`${root}/batches/${batch.id}/materials`);
      const lines = (
        materialView.body as { items: { name: string; required: string; readiness: string }[] }
      ).items;
      assert.deepEqual(
        lines
          .map((line) => [line.name, line.required, line.readiness])
          .sort((left, right) => left[0].localeCompare(right[0])),
        [
          ['Label', '80.000', 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT'],
          ['Yarn', '20.000', 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT'],
        ],
      );
      const started = await send(artisan, `${root}/batches/${batch.id}/start`, {
        version: (released.body as { version: number }).version,
      });
      assert.equal(started.status, 201, JSON.stringify(started.body));
      const progressKey = randomUUID();
      const progress = {
        version: (started.body as { version: number }).version,
        produced: 20,
        occurredAt: '2026-10-01T09:00:00.000Z',
      };
      assert.equal(
        (await send(artisan, `${root}/batches/${batch.id}/progress`, progress, progressKey)).status,
        201,
      );
      assert.equal(
        (await send(artisan, `${root}/batches/${batch.id}/progress`, progress, progressKey)).status,
        201,
      );
      assert.equal(
        await db.productionProgressEvent.count({ where: { batchId: batch.id, kind: 'REPORT' } }),
        1,
      );
      await runIntelligenceLifecycleScenarios({
        db,
        operator,
        buyer,
        artisan,
        stranger,
        orderId,
        batchId: batch.id,
        send,
        check,
      });
      const assisted = await send(coordinator, `${root}/batches/${batch.id}/progress`, {
        version: (started.body as { version: number }).version + 1,
        produced: 30,
        occurredAt: '2026-10-02T09:00:00.000Z',
        note: 'Coordinator recorded the artisan count',
      });
      assert.equal(assisted.status, 201, JSON.stringify(assisted.body));
      assert.equal((assisted.body as { source: string }).source, 'COORDINATOR');
      const denied = await send(stranger, `${root}/batches/${batch.id}/progress`, {
        version: (assisted.body as { version: number }).version,
        produced: 35,
        occurredAt: '2026-10-02T10:00:00.000Z',
      });
      assert.equal(denied.status, 404);
      assert.equal(
        (await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } })).produced,
        30,
      );
      const reports = await db.productionProgressEvent.findMany({
        where: { batchId: batch.id, kind: 'REPORT' },
        orderBy: { recordedAt: 'asc' },
      });
      const flagged = await send(artisan, `${root}/batches/${batch.id}/progress-flags`, {
        eventId: reports[1].id,
        reason: 'The artisan disputes this count',
      });
      assert.equal(flagged.status, 201, JSON.stringify(flagged.body));
      const corrected = await send(operator, `${root}/batches/${batch.id}/progress-corrections`, {
        version: (assisted.body as { version: number }).version,
        eventId: reports[0].id,
        produced: 20,
        occurredAt: '2026-10-02T11:00:00.000Z',
        reason: 'Restore the artisan count',
      });
      assert.equal(corrected.status, 201, JSON.stringify(corrected.body));
      assert.equal(
        (await db.productionProgressEvent.findUniqueOrThrow({ where: { id: reports[0].id } }))
          .cumulative,
        20,
      );
      assert.equal((corrected.body as { produced: number }).produced, 20);
      const raced = await Promise.all([
        send(artisan, `${root}/batches/${batch.id}/progress`, {
          version: (corrected.body as { version: number }).version,
          produced: 30,
          occurredAt: '2026-10-03T09:00:00.000Z',
        }),
        send(artisan, `${root}/batches/${batch.id}/progress`, {
          version: (corrected.body as { version: number }).version,
          produced: 40,
          occurredAt: '2026-10-03T09:00:00.000Z',
        }),
      ]);
      assert.deepEqual(raced.map((row) => row.status).sort(), [201, 409]);
      const racedBatch = await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } });
      assert.ok(racedBatch.produced === 30 || racedBatch.produced === 40);
      assert.notEqual(racedBatch.produced, 70);
      const topped = await send(artisan, `${root}/batches/${batch.id}/progress`, {
        version: racedBatch.version,
        produced: 40,
        occurredAt: '2026-10-03T10:00:00.000Z',
      });
      assert.equal(topped.status, 201, JSON.stringify(topped.body));
      const current = await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } });
      assert.equal(current.produced, 40);
      const submitted = await send(artisan, `${root}/batches/${batch.id}/submit`, {
        version: current.version,
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      const earlyInspection = await send(operator, `${root}/batches/${batch.id}/inspections`, {
        version: (submitted.body as { version: number }).version,
        approved: 30,
        rejected: 8,
        pending: 2,
        defectReason: 'Synthetic stitch gap',
        results: [{ criterionId: 'missing-criterion', outcome: 'PASS', note: 'Synthetic' }],
      });
      assert.equal(code(earlyInspection), 'CHECKLIST_MISSING');
      const criteria = await send(operator, `${root}/orders/${orderId}/inspection-criteria`, {
        revisionId: revision.id,
        criteria: [
          {
            code: 'stitch',
            description: 'Stitch alignment',
            expected: 'Matches the approved sample',
            tolerance: '2 mm',
            required: true,
            evidenceRequired: false,
          },
        ],
      });
      assert.equal(criteria.status, 201, JSON.stringify(criteria.body));
      const criterion = await db.inspectionCriterion.findFirstOrThrow({
        where: { revisionId: revision.id },
      });
      const inspectionBody = {
        version: (submitted.body as { version: number }).version,
        approved: 30,
        rejected: 8,
        pending: 2,
        defectReason: 'Synthetic stitch gap',
        results: [
          { criterionId: criterion.id, outcome: 'FAIL', note: 'Synthetic gap on eight pieces' },
        ],
      };
      const inspections = await Promise.all([
        send(operator, `${root}/batches/${batch.id}/inspections`, inspectionBody),
        send(operator, `${root}/batches/${batch.id}/inspections`, inspectionBody),
      ]);
      assert.deepEqual(inspections.map((row) => row.status).sort(), [201, 409]);
      assert.equal(await db.qualityInspectionAttempt.count({ where: { batchId: batch.id } }), 1);
      assert.equal(
        (await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } })).approved,
        30,
      );
      const buyerInspection = await send(
        buyer,
        `${root}/batches/${batch.id}/inspections`,
        inspectionBody,
      );
      assert.equal(buyerInspection.status, 404);
      const open = await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } });
      const reinspected = await send(operator, `${root}/batches/${batch.id}/reinspections`, {
        version: open.version,
        scope: 8,
        approved: 5,
        rejected: 2,
        pending: 1,
        defectReason: 'Two pieces remain rejected',
        results: [{ criterionId: criterion.id, outcome: 'FAIL', note: 'Synthetic remaining gap' }],
      });
      assert.equal(reinspected.status, 201, JSON.stringify(reinspected.body));
      assert.deepEqual(
        {
          approved: (reinspected.body as { approved: number }).approved,
          rejected: (reinspected.body as { rejected: number }).rejected,
          pending: (reinspected.body as { pending: number }).pending,
          produced: (reinspected.body as { produced: number }).produced,
        },
        { approved: 35, rejected: 2, pending: 3, produced: 40 },
      );
      assert.equal(await db.qualityInspectionAttempt.count({ where: { batchId: batch.id } }), 2);
      const preparations = await Promise.all([
        send(operator, `${root}/orders/${orderId}/consolidations`, {
          items: [{ batchId: batch.id, quantity: 35 }],
        }),
        send(operator, `${root}/orders/${orderId}/consolidations`, {
          items: [{ batchId: batch.id, quantity: 35 }],
        }),
      ]);
      assert.deepEqual(preparations.map((row) => row.status).sort(), [201, 409]);
      assert.equal(code(preparations.find((row) => row.status === 409)!), 'EXCESS_CONSOLIDATION');
      const extra = await send(operator, `${root}/orders/${orderId}/consolidations`, {
        items: [{ batchId: batch.id, quantity: 1 }],
      });
      assert.equal(code(extra), 'EXCESS_CONSOLIDATION');
      const view = await operator.client.request(`${root}/orders/${orderId}/execution`);
      const summary = (
        view.body as {
          summary: {
            requested: number;
            committed: number;
            reported: number;
            approved: number;
            consolidated: number;
            shipped: number;
            commercialStatus: string;
          };
          batches: { artisanName: string | null }[];
        }
      ).summary;
      assert.equal(summary.commercialStatus, 'APPROVED');
      assert.equal(summary.requested, 100);
      assert.equal(summary.committed, 40);
      assert.equal(summary.reported, 40);
      assert.equal(summary.approved, 35);
      assert.equal(summary.consolidated, 35);
      assert.equal(summary.shipped, 0);
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).delivered,
        0,
      );
      const buyerView = await buyer.client.request(`${root}/orders/${orderId}/execution`);
      assert.equal(buyerView.status, 200);
      assert.equal(JSON.stringify(buyerView.body).includes('Execution linked'), false);
      assert.equal(
        (await buyer.client.request(`${root}/batches/${batch.id}/instructions`)).status,
        404,
      );
      assert.equal(
        (await finance.client.request(`${root}/orders/${orderId}/execution`)).status,
        403,
      );
      assert.equal((await admin.client.request(`${root}/orders/${orderId}/execution`)).status, 404);
      assert.equal(
        (await stranger.client.request(`${root}/orders/${orderId}/execution`)).status,
        404,
      );
      const preparationItem = await db.shipmentPreparationItem.findFirstOrThrow({
        where: { batchId: batch.id },
      });
      const acceptedOffer = await db.commercialOffer.findUniqueOrThrow({
        where: {
          id: (await db.commercialBatch.findUniqueOrThrow({ where: { id: batch.id } })).offerId,
        },
      });
      const shipmentBody = {
        items: [{ preparationItemId: preparationItem.id, quantity: 35 }],
        hub: 'Synthetic hub',
        windowStart: '2026-10-01T09:00:00.000Z',
        windowEnd: '2026-10-01T12:00:00.000Z',
        coordinatorId: coordinator.me.user.id,
      };
      assert.equal(
        code(
          await send(operator, `${root}/orders/${orderId}/shipments`, {
            ...shipmentBody,
            items: [{ preparationItemId: preparationItem.id, quantity: 36 }],
          }),
        ),
        'EXCESS_SHIPMENT',
      );
      const provisional = await send(operator, `${root}/orders/${orderId}/shipments`, {
        ...shipmentBody,
        items: [{ preparationItemId: preparationItem.id, quantity: 10 }],
      });
      assert.equal(provisional.status, 201, JSON.stringify(provisional.body));
      const provisionalId = (provisional.body as { id: string }).id;
      assert.equal(
        (await send(stranger, `${root}/shipments/${provisionalId}/cancel`, { version: 1 })).status,
        404,
      );
      const cancelled = await send(operator, `${root}/shipments/${provisionalId}/cancel`, {
        version: 1,
      });
      assert.equal((cancelled.body as { status: string }).status, 'CANCELLED');
      assert.equal(
        (
          await send(operator, `${root}/shipments/${provisionalId}/cancel`, {
            version: (cancelled.body as { version: number }).version,
          })
        ).status,
        409,
      );
      const racedShipments = await Promise.all([
        send(operator, `${root}/orders/${orderId}/shipments`, shipmentBody),
        send(operator, `${root}/orders/${orderId}/shipments`, shipmentBody),
      ]);
      assert.deepEqual(racedShipments.map((row) => row.status).sort(), [201, 409]);
      const shipmentId = (racedShipments.find((row) => row.status === 201)!.body as { id: string })
        .id;
      assert.equal(
        (await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).status,
        'PICKUP_SCHEDULED',
      );
      const collectedShort = await send(coordinator, `${root}/shipments/${shipmentId}/handovers`, {
        version: 1,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 30,
        occurredAt: '2026-10-03T11:00:00.000Z',
        note: 'Synthetic short collection',
      });
      assert.equal(collectedShort.status, 201, JSON.stringify(collectedShort.body));
      assert.equal(
        (
          await send(operator, `${root}/shipments/${shipmentId}/cancel`, {
            version: (collectedShort.body as { version: number }).version,
          })
        ).status,
        409,
      );
      assert.equal(
        (await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).status,
        'PICKUP_SCHEDULED',
      );
      // Partial collection consumes this leg's balance. A second full shipment would overdraw it.
      const overCollection = await send(coordinator, `${root}/shipments/${shipmentId}/handovers`, {
        version: (collectedShort.body as { version: number }).version,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 35,
        occurredAt: '2026-10-03T11:30:00.000Z',
      });
      assert.equal(overCollection.status, 409);
      const shortCollection = await db.custodyHandover.findFirstOrThrow({
        where: { shipmentId, eventType: 'COLLECTED_FROM_ASSOCIATION' },
      });
      const shortReceipt = await send(operator, `${root}/shipments/${shipmentId}/handovers`, {
        version: (collectedShort.body as { version: number }).version,
        eventType: 'RECEIVED_AT_HUB',
        quantity: 30,
        occurredAt: '2026-10-03T11:35:00.000Z',
        priorHandoverId: shortCollection.id,
      });
      assert.equal(shortReceipt.status, 409);
      const collected = await send(coordinator, `${root}/shipments/${shipmentId}/handovers`, {
        version: (collectedShort.body as { version: number }).version,
        eventType: 'COLLECTED_FROM_ASSOCIATION',
        quantity: 5,
        occurredAt: '2026-10-03T11:40:00.000Z',
        note: 'Remaining synthetic collection',
      });
      assert.equal(collected.status, 201, JSON.stringify(collected.body));
      const collection = await db.custodyHandover.findFirstOrThrow({
        where: { shipmentId, quantity: 5, eventType: 'COLLECTED_FROM_ASSOCIATION' },
      });
      assert.equal(
        (
          await send(stranger, `${root}/shipments/${shipmentId}/handovers`, {
            version: (collected.body as { version: number }).version,
            eventType: 'COLLECTED_FROM_ASSOCIATION',
            quantity: 35,
            occurredAt: '2026-10-03T11:40:00.000Z',
          })
        ).status,
        404,
      );
      const hub = await send(operator, `${root}/shipments/${shipmentId}/handovers`, {
        version: (collected.body as { version: number }).version,
        eventType: 'RECEIVED_AT_HUB',
        quantity: 35,
        occurredAt: '2026-10-03T12:00:00.000Z',
        priorHandoverId: collection.id,
      });
      assert.equal(hub.status, 201, JSON.stringify(hub.body));
      const dispatched = await send(operator, `${root}/shipments/${shipmentId}/handovers`, {
        version: (hub.body as { version: number }).version,
        eventType: 'HANDED_TO_TRANSPORT',
        quantity: 35,
        occurredAt: '2026-10-03T12:30:00.000Z',
        note: 'Synthetic transport',
      });
      assert.equal((dispatched.body as { status: string }).status, 'IN_TRANSIT');
      const delivery = await send(operator, `${root}/shipments/${shipmentId}/delivery-reports`, {
        version: (dispatched.body as { version: number }).version,
        quantity: 35,
        occurredAt: '2026-10-03T13:00:00.000Z',
      });
      assert.equal(delivery.status, 201, JSON.stringify(delivery.body));
      assert.equal(
        (
          await send(finance, `${root}/orders/${orderId}/payables/reconcile`, {
            milestone: 'BUYER_ACCEPTED_PIECE',
          })
        ).status,
        403,
      );
      assert.equal(await db.artisanPayable.count({ where: { orderId } }), 0);
      const financeMember = await db.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: operatorOrg.id, userId: finance.me.user.id },
        },
      });
      await db.membershipPermission.create({
        data: {
          membershipId: financeMember.id,
          permission: 'finance.payable.reconcile',
          grantedById: operator.me.user.id,
          reason: 'Synthetic scoped reconciliation authority',
        },
      });
      await db.operatorAssignment.create({
        data: {
          operatorId: finance.me.user.id,
          organizationId: buyerOrg.id,
          assignedById: operator.me.user.id,
        },
      });
      const held = await send(finance, `${root}/orders/${orderId}/payables/reconcile`, {
        milestone: 'BUYER_ACCEPTED_PIECE',
      });
      assert.equal((held.body as { status: string }).status, 'HELD_PENDING_REVIEW');
      const confirmations = await Promise.all(
        [0, 1].map(() =>
          send(buyer, `${root}/shipments/${shipmentId}/buyer-confirmations`, {
            version: (delivery.body as { version: number }).version,
            received: 30,
            accepted: 28,
            missing: 5,
            damaged: 2,
            occurredAt: '2026-10-03T14:00:00.000Z',
            note: 'Five pieces were not in the delivery and two were damaged',
          }),
        ),
      );
      assert.deepEqual(confirmations.map((r) => r.status).sort(), [201, 409]);
      const confirmed = confirmations.find((r) => r.status === 201)!;
      assert.equal((confirmed.body as { status: string; damaged: number }).status, 'DISCREPANCY');
      assert.equal((confirmed.body as { damaged: number }).damaged, 2);
      assert.equal(
        (
          await send(buyer, `${root}/shipments/${shipmentId}/buyer-confirmations`, {
            version: (confirmed.body as { version: number }).version,
            received: 30,
            accepted: 30,
            missing: 5,
            occurredAt: '2026-10-03T14:10:00.000Z',
          })
        ).status,
        409,
      );
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
        'APPROVED',
      );
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).delivered,
        28,
      );
      assert.equal(await db.syntheticPayment.count({ where: { orderId } }), 0);
      const recognized = await Promise.all([
        send(finance, `${root}/orders/${orderId}/payables/reconcile`, {
          milestone: 'BUYER_ACCEPTED_PIECE',
        }),
        send(finance, `${root}/orders/${orderId}/payables/reconcile`, {
          milestone: 'BUYER_ACCEPTED_PIECE',
        }),
      ]);
      assert.deepEqual(recognized.map((row) => row.status).sort(), [201, 201]);
      assert.equal(await db.artisanPayable.count({ where: { orderId } }), 1);
      assert.equal(
        (
          await db.buyerDeliveryConfirmation.findUniqueOrThrow({
            where: { shipmentId },
            include: { discrepancy: true },
          })
        ).discrepancy?.quantity,
        7,
      );
      assert.equal(
        (await db.artisanPayable.findFirstOrThrow({ where: { orderId } })).amountMillimes,
        acceptedOffer.unitPayMillimes * 28n,
      );
      assert.equal(
        code(
          await send(finance, `${root}/orders/${orderId}/payables/reconcile`, {
            milestone: 'QUALITY_APPROVED',
          }),
        ),
        'MILESTONE_UNSUPPORTED',
      );
      // A legacy logistics role reaches the managed-flow guard as well as finance roles.
      await db.organizationMember.update({
        where: {
          organizationId_userId: { organizationId: operatorOrg.id, userId: finance.me.user.id },
        },
        data: {
          roles: {
            create: {
              role: 'INVENTORY_LOGISTICS_COORDINATOR',
              assignedByUserId: operator.me.user.id,
            },
          },
        },
      });
      for (const next of ['DELIVERED', 'SETTLED', 'CLOSED']) {
        const current = await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } });
        const bypass = await send(finance, `/api/v1/commerce/orders/${orderId}/actions`, {
          next,
          version: current.version,
          ...(next === 'CLOSED'
            ? {
                materialsResolved: true,
                dispositionNote: 'Synthetic legacy closure bypass attempt',
              }
            : {}),
        });
        assert.equal(bypass.status, 409, JSON.stringify(bypass.body));
        assert.equal(code(bypass), 'MANAGED_FINANCIAL_WORKFLOW_REQUIRED');
      }
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).delivered,
        28,
      );
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status,
        'APPROVED',
      );
      await runFinanceScenarios(
        db,
        { operator, finance, artisan, buyer, admin, coordinator, stranger },
        orderId,
        batch.id,
      );
      assert.equal(
        (await coordinator.client.request(`${root}/artisans/${linked.id}/compensation`)).status,
        404,
      );
      const statement = await artisan.client.request(`${root}/my-compensation`);
      assert.equal(statement.status, 200);
      assert.notEqual(
        (
          statement.body as {
            items: { lines: { agreedTnd: string; earnedTnd: string; paidVerifiedTnd: string }[] }[];
          }
        ).items[0].lines[0].agreedTnd,
        (statement.body as { items: { lines: { earnedTnd: string }[] }[] }).items[0].lines[0]
          .earnedTnd,
      );
      assert.equal(
        (statement.body as { items: { lines: { paidVerifiedTnd: string }[] }[] }).items[0].lines[0]
          .paidVerifiedTnd,
        '0.000',
      );
      const accountlessStatement = await finance.client.request(
        `${root}/artisans/${accountless.id}/compensation`,
      );
      assert.equal(
        (accountlessStatement.body as { accountAccess: string }).accountAccess,
        'ACCOUNTLESS_STATEMENT_UNDELIVERED',
      );
      const buyerFinance = await buyer.client.request(
        `${root}/orders/${orderId}/financial-summary`,
      );
      assert.equal(JSON.stringify(buyerFinance.body).includes('agreedCompensationTnd'), false);
      const financeView = await finance.client.request(
        `${root}/orders/${orderId}/financial-summary`,
      );
      assert.equal(
        (financeView.body as { contributionStatus: string }).contributionStatus,
        'PLANNED',
      );
      assert.equal(JSON.stringify(financeView.body).includes('health'), false);
      const simulation = await send(operator, `${root}/orders/${orderId}/payment-simulations`, {
        side: 'ARTISAN',
        payableId: (await db.artisanPayable.findFirstOrThrow({ where: { orderId } })).id,
        dueAt: '2026-10-20T09:00:00.000Z',
      });
      assert.equal((simulation.body as { bankVerified: boolean }).bankVerified, false);
      const failed = await send(
        operator,
        `${root}/payment-simulations/${(simulation.body as { id: string }).id}/advance`,
        { next: 'SIMULATED_FAILED' },
      );
      assert.equal((failed.body as { status: string }).status, 'SIMULATED_FAILED');
      const retried = await send(operator, `${root}/orders/${orderId}/payment-simulations`, {
        side: 'ARTISAN',
        payableId: (await db.artisanPayable.findFirstOrThrow({ where: { orderId } })).id,
        dueAt: '2026-10-21T09:00:00.000Z',
        retryOf: (simulation.body as { id: string }).id,
      });
      const initiated = await send(
        operator,
        `${root}/payment-simulations/${(retried.body as { id: string }).id}/advance`,
        { next: 'SIMULATED_INITIATED' },
      );
      const settled = await send(
        operator,
        `${root}/payment-simulations/${(initiated.body as { id: string }).id}/advance`,
        { next: 'SIMULATED_SETTLED' },
      );
      assert.equal(
        (settled.body as { status: string; bankVerified: boolean }).status,
        'SIMULATED_SETTLED',
      );
      assert.equal((settled.body as { bankVerified: boolean }).bankVerified, false);
      assert.equal(await db.syntheticPayment.count({ where: { orderId } }), 0);
      const drafted = await send(operator, `${root}/orders/${orderId}/traceability`, {
        story: 'Handmade weaving following the approved sample and coarse regional origin.',
      });
      assert.equal(drafted.status, 201, JSON.stringify(drafted.body));
      assert.equal(
        (
          await send(
            coordinator,
            `${root}/traceability/${(drafted.body as { id: string }).id}/publish`,
            { reason: 'Synthetic publication' },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await send(
            operator,
            `${root}/traceability/${(drafted.body as { id: string }).id}/submit-review`,
            { reason: 'Synthetic review' },
          )
        ).status,
        201,
      );
      const published = await send(
        operator,
        `${root}/traceability/${(drafted.body as { id: string }).id}/publish`,
        { reason: 'Synthetic publication' },
      );
      assert.equal(published.status, 201, JSON.stringify(published.body));
      const token = (published.body as { publicPath: string }).publicPath.split('/').at(-1)!;
      const publicPage = await operator.client.request(`/api/v1/public/traceability/${token}`);
      assert.equal(publicPage.status, 200);
      assert.equal(JSON.stringify(publicPage.body).includes('Execution linked'), false);
      assert.equal(
        (publicPage.body as { content: { share: { availability: string; paid: boolean } } }).content
          .share.availability,
        'UNAVAILABLE_SMALL_GROUP',
      );
      assert.equal(
        (publicPage.body as { content: { share: { paid: boolean } } }).content.share.paid,
        false,
      );
      assert.equal(
        (await operator.client.request(`/api/v1/public/traceability/${orderId}`)).status,
        404,
      );
      assert.equal(
        (
          await send(
            operator,
            `${root}/traceability/${(drafted.body as { id: string }).id}/revoke`,
            { reason: 'Synthetic revocation' },
          )
        ).status,
        201,
      );
      const revoked = await operator.client.request(`/api/v1/public/traceability/${token}`);
      assert.equal((revoked.body as { status: string }).status, 'REVOKED');
      assert.equal(JSON.stringify(revoked.body).includes('Handmade'), false);
      const moved = await operator.client.request(`${root}/orders/${orderId}/execution`);
      assert.equal(
        (moved.body as { summary: { shipped: number; buyerAccepted: number } }).summary.shipped,
        35,
      );
      assert.equal(
        (moved.body as { summary: { buyerAccepted: number } }).summary.buyerAccepted,
        28,
      );
      const refreshed = await send(operator, `${root}/orders/${orderId}/eligibility-assessments`, {
        version: (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).version,
        restrictionsReviewed: true,
        restrictionSource: 'Synthetic product file',
      });
      const remaining = (
        refreshed.body as { assessments: { displayName: string; knownRemaining: string | null }[] }
      ).assessments.find((row) => row.displayName === 'Execution linked');
      assert.equal(remaining?.knownRemaining, '10.00');
      assert.equal(JSON.stringify(view.body).includes('health'), false);
      await runPlanningOfferLifecycleScenarios({
        db,
        operator,
        buyer,
        artisan,
        stranger,
        orderId,
        send,
        check,
      });
      await db.organizationMember.updateMany({
        where: { userId: operator.me.user.id },
        data: { status: 'SUSPENDED' },
      });
      assert.equal(
        (await operator.client.request(`${root}/orders/${orderId}/execution`)).status,
        404,
      );
      assert.equal(await db.batchRelease.count({ where: { batchId: batch.id } }), 1);
      assert.equal(otherAssociation.type, 'ASSOCIATION');
    },
  );
}
