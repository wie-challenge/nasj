import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import { seedCommerceFixture } from './commerce.fixture.js';

type Result = { status: number; body: unknown };
type Identity = {
  me: { user: { id: string } };
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<Result>;
  };
};
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
export async function runProductAuthorityScenarios({ db, register, check }: Harness) {
  const [buyer, operator, artisan, quality, outsider] = await Promise.all(
    ['buyer', 'operator', 'artisan', 'quality', 'outsider'].map((role) =>
      register(`product-authority-${role}@example.com`, `Synthetic product ${role}`),
    ),
  );
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: outsider.me.user.id,
    },
    'product-authority',
  );
  const operatorMember = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: fixture.operatorOrganizationId,
        userId: operator.me.user.id,
      },
    },
  });
  await db.membershipRole.createMany({
    data: ['NASJ_OPERATOR', 'PRODUCT_DESIGNER'].map((role) => ({
      membershipId: operatorMember.id,
      role: role as 'NASJ_OPERATOR' | 'PRODUCT_DESIGNER',
      assignedByUserId: operator.me.user.id,
    })),
  });
  await db.operatorAssignment.create({
    data: {
      operatorId: operator.me.user.id,
      organizationId: fixture.buyerOrganizationId,
      assignedById: operator.me.user.id,
    },
  });
  async function command(who: Identity, path: string, body: unknown, key: string = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(`/api/v1/catalog${path}`, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function ok<T = { id: string; revisionId: string; status: string; termsSha256: string }>(
    who: Identity,
    path: string,
    body: unknown,
    key?: string,
  ) {
    const r = await command(who, path, body, key);
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.body as T;
  }
  const revision = {
    revisionNumber: 1,
    description: 'Synthetic cotton runner approved reference',
    dimensions: '130 x 30 cm',
    unit: 'cm',
    materials: [
      { materialCode: 'cotton', name: 'Cotton cloth', quantity: '1.500', unit: 'METERS' },
    ],
    instructions: 'Measure, weave, inspect against the approved sample.',
    tolerances: 'Dimensions +/- 1 cm',
    qualityCriteria: 'Dimensions and trim match the buyer approved sample.',
    referenceImages: [],
  };
  let product = { id: '', revisionId: '' };
  await check(
    'E20 design owner approval is scoped, stale decisions roll back, and approved content is immutable',
    async () => {
      assert.equal(
        (
          await command(buyer, '/specifications', {
            productCode: 'AUTH-TEST',
            name: 'Synthetic runner',
            craftSkillId: 'weaving',
            revision,
          })
        ).status,
        403,
      );
      product = await ok(operator, '/specifications', {
        productCode: 'AUTH-TEST',
        name: 'Synthetic runner',
        craftSkillId: 'weaving',
        revision,
      });
      assert.equal(
        (
          await command(operator, `/specification-revisions/${product.revisionId}/decision`, {
            version: 1,
            decision: 'APPROVED',
            comments: '',
          })
        ).status,
        409,
      );
      await ok(operator, `/specification-revisions/${product.revisionId}/submit`, { version: 1 });
      assert.equal(
        (
          await command(operator, `/specification-revisions/${product.revisionId}/decision`, {
            version: 2,
            decision: 'APPROVED',
            comments: '',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(outsider, `/specification-revisions/${product.revisionId}/decision`, {
            version: 1,
            decision: 'APPROVED',
            comments: '',
          })
        ).status,
        403,
      );
      await ok(operator, `/specification-revisions/${product.revisionId}/decision`, {
        version: 1,
        decision: 'APPROVED',
        comments: 'Synthetic evidence reviewed.',
      });
      await assert.rejects(
        db.productSpecificationRevision.update({
          where: { id: product.revisionId },
          data: { qualityCriteria: 'unauthorized replacement' },
        }),
      );
      assert.equal(
        (
          await db.productSpecificationRevision.findUniqueOrThrow({
            where: { id: product.revisionId },
          })
        ).qualityCriteria,
        revision.qualityCriteria,
      );
    },
  );
  const terms = {
    compensationTnd: '45.001',
    compensationBasis: 'PER_SAMPLE',
    materialCostTnd: '12.003',
    reimburseMaterials: true,
    workTerms: 'Paid on sample completion, regardless of buyer acceptance or bulk award.',
    evidenceReference: 'Synthetic written sample agreement',
  };
  const work = {
    actualRecordedMinutes: 95,
    actualMaterialCostTnd: '12.003',
    actualMaterialUsage: 'Synthetic 1.500 meters of cotton used.',
    timeEvidence: 'SYNTHETIC',
    evidenceReference: 'Synthetic sample completion and material-use record',
  };
  const sampleRequest = () => ({
    revisionId: product.revisionId,
    buyerOrganizationId: fixture.buyerOrganizationId,
    operatorOrganizationId: fixture.operatorOrganizationId,
    sampleQuantity: 1,
    responsibleArtisanProfileId: fixture.artisanProfileId,
    workTerms: terms.workTerms,
    materialResponsibility: 'Artisan provides cotton; agreed material cost is reimbursable.',
    plannedCompletion: fixture.deliveryAt,
  });
  let rejectedSample = '',
    approvedSample = '';
  await check(
    'E20 paid sample work requires its own artisan acceptance of the exact issued terms',
    async () => {
      rejectedSample = (await ok(buyer, '/samples', sampleRequest())).id;
      assert.equal((await command(buyer, `/samples/${rejectedSample}/terms`, terms)).status, 403);
      const issued = await ok(operator, `/samples/${rejectedSample}/terms`, terms);
      assert.equal(
        (
          await command(operator, `/samples/${rejectedSample}/accept`, {
            termsSha256: issued.termsSha256,
          })
        ).status,
        403,
      );
      assert.equal((await command(artisan, `/samples/${rejectedSample}/work`, work)).status, 409);
      assert.equal(
        (
          await command(artisan, `/samples/${rejectedSample}/accept`, {
            termsSha256: '0'.repeat(64),
          })
        ).status,
        409,
      );
      assert.equal(
        (await db.productSampleRequest.findUniqueOrThrow({ where: { id: rejectedSample } }))
          .acceptedAt,
        null,
      );
      await ok(artisan, `/samples/${rejectedSample}/accept`, { termsSha256: issued.termsSha256 });
      assert.equal(
        (
          await command(operator, `/samples/${rejectedSample}/terms`, {
            ...terms,
            compensationTnd: '1.000',
          })
        ).status,
        409,
      );
      assert.equal((await command(operator, `/samples/${rejectedSample}/work`, work)).status, 403);
    },
  );
  await check(
    'E20 completion recognizes one exact sample obligation in the finance ledger without bulk or buyer approval',
    async () => {
      const key = randomUUID();
      const responses = await Promise.all([
        command(artisan, `/samples/${rejectedSample}/work`, work, key),
        command(artisan, `/samples/${rejectedSample}/work`, work, key),
      ]);
      assert.deepEqual(
        responses.map((r) => r.status),
        [201, 201],
      );
      const payable = await db.artisanPayable.findUniqueOrThrow({
        where: { sampleRequestId: rejectedSample },
      });
      assert.equal(payable.amountMillimes, 57004n);
      assert.equal(payable.status, 'RECOGNIZED');
      assert.equal(payable.orderId, null);
      assert.equal(payable.batchId, null);
      assert.equal(
        await db.samplePayable.count({ where: { sampleRequestId: rejectedSample } }),
        0,
        'No competing ledger entry is created.',
      );
      assert.equal(
        await db.artisanPayable.count({ where: { sampleRequestId: rejectedSample } }),
        1,
      );
      assert.equal((await command(outsider, `/samples/${rejectedSample}/work`, work)).status, 404);
    },
  );
  await check(
    'E20 quality rejection preserves the earned sample obligation and cannot be relabelled buyer approval',
    async () => {
      const evalInput = {
        decision: 'REJECTED',
        criteria: 'Forged criteria cannot replace the approved version.',
        comments: 'Synthetic trim failed.',
        evidenceReference: 'Synthetic inspection record',
      };
      assert.equal(
        (await command(buyer, `/samples/${rejectedSample}/evaluations`, evalInput)).status,
        403,
      );
      await ok(quality, `/samples/${rejectedSample}/evaluations`, evalInput);
      const sample = await db.productSampleRequest.findUniqueOrThrow({
        where: { id: rejectedSample },
      });
      assert.equal(sample.status, 'REJECTED');
      const evaluation = await db.sampleEvaluation.findFirstOrThrow({
        where: { sampleRequestId: rejectedSample },
      });
      assert.equal(evaluation.criteria, revision.qualityCriteria);
      assert.equal(
        (
          await command(buyer, `/samples/${rejectedSample}/approval`, {
            decision: 'APPROVED',
            comments: '',
            evidenceReference: 'Forged shortcut',
          })
        ).status,
        409,
      );
      assert.equal(
        (await db.artisanPayable.findUniqueOrThrow({ where: { sampleRequestId: rejectedSample } }))
          .amountMillimes,
        57004n,
      );
      assert.equal(
        await db.buyerSampleApproval.count({ where: { sampleRequestId: rejectedSample } }),
        0,
      );
    },
  );
  let approvalId = '';
  await check(
    'E20 buyer signoff has immutable exact revision lineage and cross-buyer attempts leave no decision',
    async () => {
      approvedSample = (await ok(buyer, '/samples', sampleRequest())).id;
      const issued = await ok(operator, `/samples/${approvedSample}/terms`, terms);
      await ok(artisan, `/samples/${approvedSample}/accept`, { termsSha256: issued.termsSha256 });
      await ok(artisan, `/samples/${approvedSample}/work`, work);
      await ok(quality, `/samples/${approvedSample}/evaluations`, {
        decision: 'APPROVED',
        criteria: revision.qualityCriteria,
        comments: '',
        evidenceReference: 'Synthetic inspection pass',
      });
      const approval = {
        decision: 'APPROVED',
        comments: 'Exact synthetic sample approved.',
        evidenceReference: 'Synthetic buyer decision evidence',
      };
      assert.equal(
        (await command(outsider, `/samples/${approvedSample}/approval`, approval)).status,
        403,
      );
      assert.equal(
        await db.buyerSampleApproval.count({ where: { sampleRequestId: approvedSample } }),
        0,
      );
      const key = randomUUID();
      const decisions = await Promise.all([
        command(buyer, `/samples/${approvedSample}/approval`, approval, key),
        command(buyer, `/samples/${approvedSample}/approval`, approval, key),
      ]);
      assert.deepEqual(
        decisions.map((x) => x.status),
        [201, 201],
      );
      approvalId = (decisions[0].body as { id: string }).id;
      const saved = await db.buyerSampleApproval.findUniqueOrThrow({ where: { id: approvalId } });
      assert.equal(saved.actorId, buyer.me.user.id);
      assert.equal(saved.specificationRevisionId, product.revisionId);
      await assert.rejects(
        db.buyerSampleApproval.update({
          where: { id: approvalId },
          data: { comments: 'Silent rewrite' },
        }),
      );
      assert.equal(
        await db.buyerSampleApproval.count({ where: { sampleRequestId: approvedSample } }),
        1,
      );
    },
  );
  let boundOrderId = '',
    boundBatchId = '',
    boundRevisionId = '';
  async function executionCommand(
    who: Identity,
    path: string,
    body: unknown,
    key: string = randomUUID(),
  ) {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(`/api/v1/procurement${path}`, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  await check(
    'E20 one buyer approval projects into the release authority and pins downstream inspection criteria',
    async () => {
      const rfq = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: fixture.buyerOrganizationId,
          operatorOrganizationId: fixture.operatorOrganizationId,
          craftSkillId: 'weaving',
          title: 'Synthetic catalogue-bound procurement order',
          specification: revision.description,
          designRequirements: revision.instructions,
          quantity: 3,
          deliveryAt: new Date(fixture.deliveryAt),
          deliveryLocation: 'Synthetic Tunis',
          status: 'ACCEPTED',
          procurementManaged: true,
          order: { create: { status: 'APPROVED' } },
        },
        include: { order: true },
      });
      boundOrderId = rfq.order!.id;
      const procurementRevision = await db.procurementRevision.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          authorId: buyer.me.user.id,
          reason: 'Synthetic accepted fixture reference',
          snapshot: { quantity: 3, specification: revision.description },
        },
      });
      boundRevisionId = procurementRevision.id;
      await db.specificationMaterialLine.create({
        data: {
          revisionId: procurementRevision.id,
          materialCode: 'legacy-cotton',
          name: 'Originally accepted cotton',
          unit: 'METERS',
          perItemMilli: 1000,
        },
      });
      await db.inspectionCriterion.create({
        data: {
          revisionId: procurementRevision.id,
          code: 'LEGACY',
          description: 'Originally accepted immutable standard',
          expected: 'Legacy standard',
          required: true,
        },
      });
      const quote = await db.procurementQuote.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          revisionId: procurementRevision.id,
          authorId: operator.me.user.id,
          totalMillimes: 200000n,
          expiresAt: new Date(fixture.quoteExpiresAt),
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      await db.procurementAcceptance.create({
        data: {
          quoteId: quote.id,
          orderId: boundOrderId,
          actorId: buyer.me.user.id,
          snapshot: { provenance: 'SYNTHETIC', quantity: 3 },
        },
      });
      const bind = { catalogueRevisionId: product.revisionId };
      assert.equal((await command(operator, `/orders/${boundOrderId}/binding`, bind)).status, 403);
      assert.equal((await command(outsider, `/orders/${boundOrderId}/binding`, bind)).status, 403);
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: boundOrderId } }))
          .productSpecificationRevisionId,
        null,
      );
      const binding = await ok<{ procurementRevisionId: string }>(
        buyer,
        `/orders/${boundOrderId}/binding`,
        bind,
      );
      boundRevisionId = binding.procurementRevisionId;
      assert.notEqual(boundRevisionId, procurementRevision.id);
      assert.equal(
        await db.specificationMaterialLine.count({ where: { revisionId: procurementRevision.id } }),
        1,
      );
      assert.equal(
        (
          await db.inspectionCriterion.findFirstOrThrow({
            where: { revisionId: procurementRevision.id },
          })
        ).description,
        'Originally accepted immutable standard',
      );
      const projection = await db.procurementSample.findFirstOrThrow({
        where: { revisionId: boundRevisionId },
        include: { decision: true },
      });
      assert.equal(projection.catalogueApprovalId, approvalId);
      const finances = await operator.client.request(
        `/api/v1/finance/orders/${boundOrderId}/analysis`,
      );
      assert.equal(finances.status, 200, JSON.stringify(finances.body));
      const obligations = (finances.body as { obligations: { sampleRequestId: string | null }[] })
        .obligations;
      assert.ok(obligations.some((p) => p.sampleRequestId === approvedSample));
      assert.ok(!obligations.some((p) => p.sampleRequestId === rejectedSample));
      const closure = await operator.client.request(
        `/api/v1/finance/orders/${boundOrderId}/closure`,
      );
      assert.equal(closure.status, 200);
      assert.ok(
        (closure.body as { blockers: string[] }).blockers.includes('ARTISAN_PAYABLES_OUTSTANDING'),
      );

      assert.equal(projection.decision!.actorId, buyer.me.user.id);
      assert.equal(projection.criteria, revision.qualityCriteria);
      const criterion = await db.inspectionCriterion.findFirstOrThrow({
        where: { revisionId: boundRevisionId },
      });
      const displayed = await operator.client.request(
        `/api/v1/procurement/orders/${boundOrderId}/execution`,
      );
      assert.equal(displayed.status, 200);
      assert.ok(
        (displayed.body as { criteria: { id: string }[] }).criteria.some(
          (row) => row.id === criterion.id,
        ),
      );
      assert.equal(criterion.description, revision.qualityCriteria);
      assert.equal(criterion.tolerance, revision.tolerances);
      // Seed an already-consented batch here; the existing offer suite separately proves consent/reservation.
      const offer = await db.commercialOffer.create({
        data: {
          orderId: boundOrderId,
          capacityDeclarationId: fixture.capacityDeclarationId,
          artisanProfileId: fixture.artisanProfileId,
          quantity: 3,
          unitPayMillimes: 10000n,
          estimatedHours: 'Synthetic measured range unavailable',
          expiresAt: new Date(fixture.offerExpiresAt),
          materials: 'Operator supplies cotton',
          reworkTerms: 'Agreed fixture',
          paymentConditions: 'Synthetic only',
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          decidedByUserId: artisan.me.user.id,
          batch: { create: { orderId: boundOrderId, artisanProfileId: fixture.artisanProfileId } },
        },
        include: { batch: true },
      });
      boundBatchId = offer.batch!.id;
      const release = {
        version: 1,
        fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
      };
      assert.equal(
        (await executionCommand(buyer, `/batches/${boundBatchId}/release`, release)).status,
        404,
      );
      assert.equal(await db.batchRelease.count({ where: { batchId: boundBatchId } }), 0);
      const result = await executionCommand(operator, `/batches/${boundBatchId}/release`, release);
      assert.equal(result.status, 201, JSON.stringify(result));
      const saved = await db.batchRelease.findUniqueOrThrow({ where: { batchId: boundBatchId } });
      assert.equal(saved.sampleId, projection.id);
      assert.equal(saved.revisionId, boundRevisionId);
      const instructions = await artisan.client.request(
        `/api/v1/procurement/batches/${boundBatchId}/instructions`,
      );
      assert.equal(instructions.status, 200);
      const view = instructions.body as {
        catalogueRevisionId: string;
        instructions: string;
        qualityCriteria: { description: string }[];
      };
      assert.equal(view.catalogueRevisionId, product.revisionId);
      assert.equal(view.instructions, revision.instructions);
      assert.equal(view.qualityCriteria[0].description, revision.qualityCriteria);
      assert.equal((await command(buyer, `/orders/${boundOrderId}/binding`, bind)).status, 409);
      assert.equal(await db.forecastSnapshot.count({ where: { batchId: boundBatchId } }), 1);
    },
  );
  await check(
    'E20 inspection persists the approved sample criteria and unauthorized inspection creates no result',
    async () => {
      let batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: boundBatchId } });
      for (const [path, body] of [
        ['start', { version: batch.version }],
        [
          'progress',
          { version: batch.version + 1, produced: 3, occurredAt: new Date().toISOString() },
        ],
        ['submit', { version: batch.version + 2 }],
      ] as const) {
        const result = await executionCommand(artisan, `/batches/${boundBatchId}/${path}`, body);
        assert.equal(result.status, 201, JSON.stringify(result));
      }
      batch = await db.commercialBatch.findUniqueOrThrow({ where: { id: boundBatchId } });
      const criterion = await db.inspectionCriterion.findFirstOrThrow({
        where: { revisionId: boundRevisionId },
      });
      const inspection = {
        version: batch.version,
        approved: 3,
        rejected: 0,
        pending: 0,
        results: [
          {
            criterionId: criterion.id,
            outcome: 'PASS',
            note: 'Synthetic inspection against exact buyer sample',
          },
        ],
      };
      assert.equal(
        (await executionCommand(artisan, `/batches/${boundBatchId}/inspections`, inspection))
          .status,
        403,
      );
      assert.equal(
        await db.qualityInspectionAttempt.count({ where: { batchId: boundBatchId } }),
        0,
      );
      const result = await executionCommand(
        operator,
        `/batches/${boundBatchId}/inspections`,
        inspection,
      );
      assert.equal(result.status, 201, JSON.stringify(result));
      assert.equal(
        await db.inspectionCriterionResult.count({ where: { criterionId: criterion.id } }),
        1,
      );
    },
  );
  await check(
    'E20 revision amendments preserve v1 and cannot reuse its sample acceptance for v2',
    async () => {
      const v2 = await ok(operator, `/specifications/${product.id}/revisions`, {
        ...revision,
        revisionNumber: 2,
        dimensions: '140 x 30 cm',
      });
      const draft = await db.productSpecificationRevision.findUniqueOrThrow({
        where: { id: v2.id },
      });
      assert.equal(draft.status, 'DRAFT');
      const old = await db.productSpecificationRevision.findUniqueOrThrow({
        where: { id: product.revisionId },
      });
      assert.equal(old.dimensions, revision.dimensions);
      assert.equal(old.status, 'APPROVED');
      assert.equal(
        await db.buyerSampleApproval.count({ where: { specificationRevisionId: v2.id } }),
        0,
      );
      assert.equal(
        (await command(buyer, '/samples', { ...sampleRequest(), revisionId: v2.id })).status,
        409,
      );
      assert.equal((await outsider.client.request('/api/v1/catalog')).status, 200);
      const workspace = await outsider.client.request('/api/v1/catalog');
      assert.ok(!JSON.stringify(workspace.body).includes(approvalId));
      assert.ok(!JSON.stringify(workspace.body).includes('45.001'));
    },
  );
}
