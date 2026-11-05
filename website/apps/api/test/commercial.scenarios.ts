import { runCollaborationScenarios } from './collaboration.scenarios.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ProcurementDetail } from '@nasj/contracts';
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
  me: { user: { id: string }; csrfToken?: string };
};
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
const period = {
  effectiveFrom: new Date('2027-09-06T00:00:00+01:00'),
  effectiveTo: new Date('2027-09-13T00:00:00+01:00'),
};
const lines = [
  ['MATERIALS', 'VARIABLE', '2.000'],
  ['ARTISAN_LABOR', 'VARIABLE', '3.000'],
  ['QUALITY_ASSURANCE', 'FIXED', '30.000'],
  ['LOGISTICS', 'FIXED', '20.000'],
  ['OVERHEAD', 'FIXED', '50.000'],
  ['CONTINGENCY', 'FIXED', '0.000'],
] as const;
export async function runCommercialScenarios({ db, register, check }: Harness) {
  const [buyer, operator, outsider] = await Promise.all(
    ['buyer', 'operator', 'outsider'].map((role) =>
      register(`commercial-${role}@example.com`, `Synthetic commercial ${role}`),
    ),
  );
  const organization = async (
    name: string,
    type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
    userId: string,
    role: 'BUYER' | 'NASJ_OPERATOR' | 'ASSOCIATION_COORDINATOR',
  ) =>
    db.organization.create({
      data: {
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        type,
        approvalStatus: 'APPROVED',
        region: 'Sfax',
        description: 'Synthetic commercial fixture',
        contactEmail: 'commercial@example.com',
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        members: {
          create: {
            userId,
            roles: { create: { role, assignedByUserId: userId } },
            ...(role === 'BUYER'
              ? {
                  permissionGrants: {
                    create: {
                      permission: 'buyer.quotation.approve',
                      grantedById: userId,
                      reason: 'Synthetic approval authority',
                    },
                  },
                }
              : {}),
          },
        },
      },
    });
  const [buyerOrg, operatorOrg, association] = await Promise.all([
    organization('Commercial buyer', 'BUYER_BUSINESS', buyer.me.user.id, 'BUYER'),
    organization('Commercial operator', 'INTERNAL', operator.me.user.id, 'NASJ_OPERATOR'),
    organization(
      'Commercial association',
      'ASSOCIATION',
      operator.me.user.id,
      'ASSOCIATION_COORDINATOR',
    ),
  ]);
  await db.operatorAssignment.create({
    data: {
      operatorId: operator.me.user.id,
      organizationId: buyerOrg.id,
      assignedById: operator.me.user.id,
    },
  });
  const policy = await db.authorizationPolicy.create({
    data: {
      version: 'commercial-test-v1',
      methods: ['SIGNED'],
      reviewReference: 'Synthetic reviewed method',
      reviewedById: operator.me.user.id,
    },
  });
  const participant = async (name: string, quantity: number) => {
    const profile = await db.artisanProfile.create({
      data: {
        displayName: name,
        region: 'Synthetic quarter',
        contactPhone: '+21699000222',
        userId: null,
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    await db.artisanManagement.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: association.id,
        recordedById: operator.me.user.id,
        reason: 'Synthetic commercial management',
      },
    });
    await db.onboardingAuthorization.create({
      data: {
        artisanProfileId: profile.id,
        policyId: policy.id,
        purpose: 'PARTICIPATION',
        method: 'SIGNED',
        occurredAt: new Date(),
        language: 'fr',
        evidenceReference: 'Synthetic participation confirmation',
        recordedById: operator.me.user.id,
      },
    });
    const declaration = await db.capacityDeclaration.create({
      data: {
        artisanProfileId: profile.id,
        craftSkillId: 'weaving',
        unitType: 'PIECES',
        quantity,
        ...period,
        declaredByUserId: operator.me.user.id,
      },
    });
    return { profile, declaration };
  };
  const alpha = await participant('Hidden commercial alpha', 50);
  const beta = await participant('Hidden commercial beta', 50);
  const gamma = await participant('Hidden commercial gamma', 50);
  const offerRfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: buyerOrg.id,
      operatorOrganizationId: operatorOrg.id,
      craftSkillId: 'weaving',
      title: 'Synthetic consumed throughput',
      specification: 'Synthetic only',
      designRequirements: 'Synthetic only',
      quantity: 20,
      deliveryAt: new Date('2027-09-10T00:00:00+01:00'),
      deliveryLocation: 'Synthetic site',
      status: 'ACCEPTED',
      order: { create: { status: 'CLOSED' } },
    },
    include: { order: true },
  });
  await db.commercialOffer.create({
    data: {
      orderId: offerRfq.order!.id,
      artisanProfileId: alpha.profile.id,
      capacityDeclarationId: alpha.declaration.id,
      quantity: 20,
      unitPayMillimes: 1000n,
      estimatedHours: 'Synthetic range',
      expiresAt: new Date('2027-09-08T00:00:00Z'),
      materials: 'Synthetic only',
      reworkTerms: 'Synthetic only',
      paymentConditions: 'Simulated only',
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      batch: {
        create: {
          orderId: offerRfq.order!.id,
          artisanProfileId: alpha.profile.id,
          status: 'COMPLETED',
          produced: 20,
        },
      },
    },
  });
  const rfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: buyerOrg.id,
      operatorOrganizationId: operatorOrg.id,
      craftSkillId: 'weaving',
      title: 'Synthetic feasibility runner',
      specification: 'Synthetic cotton runner, exact version one.',
      designRequirements: 'Synthetic border and dimensions.',
      quantity: 100,
      deliveryAt: new Date('2027-10-01T00:00:00+01:00'),
      deliveryLocation: 'Synthetic Tunis site',
      status: 'UNDER_REVIEW',
      procurementManaged: true,
    },
  });
  const revision = await db.procurementRevision.create({
    data: {
      rfqId: rfq.id,
      version: rfq.version,
      authorId: operator.me.user.id,
      reason: 'Synthetic baseline specification',
      snapshot: { provenance: 'SYNTHETIC' },
    },
  });
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
      comments: 'Synthetic approval of this sample only.',
    },
  });
  const root = '/api/v1/procurement';
  async function post(who: Identity, path: string, body: unknown) {
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(root + path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': randomUUID(),
    });
  }
  const assessed = {
    version: 1,
    effectiveFrom: period.effectiveFrom.toISOString(),
    effectiveTo: period.effectiveTo.toISOString(),
    unit: 'PIECES',
    materialStatus: 'CONFIRMED_AVAILABLE',
    materialSource: 'Synthetic warehouse attestation',
    logisticsLeadDays: 3,
    calendarCleared: true,
    calendarSource: 'Synthetic reviewed calendar',
  };
  await check('commercial feasibility, costing and exact acceptance stay isolated', async () => {
    const unknownEffort = await post(operator, `/rfqs/${rfq.id}/feasibility-assessments`, {
      ...assessed,
      materialStatus: 'UNKNOWN',
      materialSource: undefined,
    });
    assert.equal(unknownEffort.status, 201, JSON.stringify(unknownEffort.body));
    assert.equal((unknownEffort.body as { result: string }).result, 'NEEDS_REVIEW');
    await post(operator, '/effort-assumptions', {
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      minPerUnit: '1.50',
      maxPerUnit: '2.50',
      source: 'Synthetic reviewed timing study',
    });
    const hours = await post(operator, `/rfqs/${rfq.id}/feasibility-assessments`, {
      ...assessed,
      unit: 'HOURS',
    });
    assert.equal((hours.body as { result: string }).result, 'NOT_FEASIBLE');
    const feasible = await post(operator, `/rfqs/${rfq.id}/feasibility-assessments`, assessed);
    assert.equal(feasible.status, 201, JSON.stringify(feasible.body));
    assert.equal((feasible.body as { result: string }).result, 'FEASIBLE');
    const detail = await operator.client.request(`${root}/rfqs/${rfq.id}`);
    const view = detail.body as ProcurementDetail;
    const latest = view.feasibility[0];
    assert.equal(latest.knownRemaining, '130.00');
    assert.equal(latest.effortMin, '150.00');
    assert.equal(latest.reservation, false);
    const legacy = await post(operator, `/rfqs/${rfq.id}/quotes`, {
      version: 1,
      totalTnd: '10.000',
      expiresAt: '2027-09-20T00:00:00.000Z',
      priceReview: 'Synthetic price note',
      capacityReview: 'Synthetic capacity note',
      materialsReview: 'Synthetic materials note',
      taxPolicyReference: 'Synthetic tax note',
      taxBasisPoints: 0,
    });
    assert.equal(legacy.status, 409);
    assert.equal((legacy.body as { code: string }).code, 'COSTED_QUOTATION_REQUIRED');
    assert.equal(await db.procurementQuote.count({ where: { rfqId: rfq.id } }), 0);
    assert.equal(JSON.stringify(detail.body).includes('+21699000222'), false);
    assert.equal(JSON.stringify(detail.body).includes('Hidden commercial'), false);
    const incomplete = await post(operator, `/rfqs/${rfq.id}/cost-estimates`, {
      version: 1,
      feasibilityId: latest.id,
      marginMethod: 'NONE',
      marginBasisPoints: 0,
      lines: lines
        .filter((line) => line[0] !== 'ARTISAN_LABOR')
        .map(([category, basis, rateTnd]) => ({
          category,
          basis,
          rateTnd,
        })),
    });
    assert.equal((incomplete.body as { incomplete: boolean }).incomplete, true);
    const priced = await post(operator, `/rfqs/${rfq.id}/cost-estimates`, {
      version: 1,
      feasibilityId: latest.id,
      marginMethod: 'MARKUP_ON_COST',
      marginBasisPoints: 1000,
      lines: lines.map(([category, basis, rateTnd]) => ({ category, basis, rateTnd })),
    });
    assert.equal(priced.status, 201, JSON.stringify(priced.body));
    assert.equal((priced.body as { sellingTnd: string }).sellingTnd, '660.000');
    const changed = await post(operator, `/rfqs/${rfq.id}/cost-estimates`, {
      version: 1,
      feasibilityId: latest.id,
      marginMethod: 'MARKUP_ON_COST',
      marginBasisPoints: 1000,
      lines: lines.map(([category, basis, rateTnd]) => ({
        category,
        basis,
        rateTnd: category === 'LOGISTICS' ? '40.000' : rateTnd,
      })),
    });
    const costs = (
      (await operator.client.request(`${root}/rfqs/${rfq.id}`)).body as ProcurementDetail
    ).costs;
    assert.equal(costs.find((cost) => cost.version === 2)?.subtotalTnd, '600.000');
    assert.equal(costs.find((cost) => cost.version === 3)?.subtotalTnd, '620.000');
    const issued = await post(operator, `/rfqs/${rfq.id}/costed-quotes`, {
      version: 1,
      costEstimateId: (priced.body as { id: string }).id,
      expiresAt: '2027-09-20T00:00:00.000Z',
      paymentTerms: 'Synthetic milestone, no live payment.',
      deliveryConditions: 'Synthetic collection at the stated site.',
    });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const quoteId = (issued.body as { id: string }).id;
    const hash = (issued.body as { termsSha256: string }).termsSha256;
    const buyerResponse = await buyer.client.request(`${root}/rfqs/${rfq.id}`);
    assert.equal(buyerResponse.status, 200, JSON.stringify(buyerResponse.body));
    const buyerView = buyerResponse.body as ProcurementDetail;
    assert.equal(JSON.stringify(buyerView).includes('ARTISAN_LABOR'), false);
    assert.equal(buyerView.costs.length, 0);
    assert.equal(buyerView.quotes[0].totalTnd, '660.000');
    assert.equal(buyerView.quotes[0].termsSha256, hash);
    assert.equal((await outsider.client.request(`${root}/rfqs/${rfq.id}`)).status, 404);
    const stale = await post(buyer, `/rfqs/${rfq.id}/accept`, {
      version: buyerView.rfq.version,
      quoteId,
      confirm: true,
      termsSha256: 'a'.repeat(64),
    });
    assert.equal(stale.status, 409);
    const accepted = await post(buyer, `/rfqs/${rfq.id}/accept`, {
      version: buyerView.rfq.version,
      quoteId,
      confirm: true,
      termsSha256: hash,
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    assert.equal(await db.commercialOffer.count({ where: { order: { rfqId: rfq.id } } }), 0);
    const repeat = await post(buyer, `/rfqs/${rfq.id}/accept`, {
      version: (accepted.body as { version: number }).version,
      quoteId,
      confirm: true,
      termsSha256: hash,
    });
    assert.equal(repeat.status, 409);
    assert.equal(await db.procurementAcceptance.count({ where: { quoteId } }), 1);
    assert.equal((changed.body as { version: number }).version, 3);
  });
  await check('production eligibility, offers and voluntary decisions stay isolated', async () => {
    const order = await db.commercialOrder.findUniqueOrThrow({ where: { rfqId: rfq.id } });
    const beforeEffort = await db.effortAssumption.count();
    const finance = await register('commercial-finance@example.com', 'Synthetic finance reader');
    await db.organizationMember.create({
      data: {
        organizationId: operatorOrg.id,
        userId: finance.me.user.id,
        roles: {
          create: { role: 'FINANCE_MANAGER', assignedByUserId: finance.me.user.id },
        },
      },
    });
    const deniedEffort = await post(finance, '/effort-assumptions', {
      craftSkillId: 'weaving',
      unitType: 'PIECES',
      minPerUnit: '1.00',
      maxPerUnit: '2.00',
      source: 'Synthetic finance attempt',
    });
    assert.equal(deniedEffort.status, 403);
    assert.equal(await db.effortAssumption.count(), beforeEffort);
    const [artisan, coordinator, admin] = await Promise.all([
      register('commercial-artisan@example.com', 'Synthetic deciding artisan'),
      register('commercial-coordinator@example.com', 'Synthetic recording coordinator'),
      register('commercial-admin@example.com', 'Synthetic platform admin'),
    ]);
    await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
    await db.artisanProfile.update({
      where: { id: beta.profile.id },
      data: { userId: artisan.me.user.id, preferredLanguage: 'fr' },
    });
    await db.consentRecord.create({
      data: {
        userId: artisan.me.user.id,
        purpose: 'artisan.profile',
        decision: true,
        policyVersion: 'artisan-profile-v1',
        collectionContext: 'synthetic_test_fixture',
      },
    });
    await db.organizationMember.create({
      data: {
        organizationId: association.id,
        userId: coordinator.me.user.id,
        roles: {
          create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinator.me.user.id },
        },
      },
    });
    await db.artisanAssignment.create({
      data: {
        artisanProfileId: gamma.profile.id,
        coordinatorId: coordinator.me.user.id,
        organizationId: association.id,
        assignedById: coordinator.me.user.id,
        reason: 'Synthetic assignment',
      },
    });
    const paused = await participant('Hidden commercial paused', 40);
    await db.artisanProfile.update({
      where: { id: paused.profile.id },
      data: { availabilityStatus: 'PAUSED' },
    });
    await db.artisanProfile.create({
      data: {
        displayName: 'Hidden commercial unauthorized',
        region: 'Synthetic quarter',
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    const hours = await participant('Hidden commercial hours', 40);
    await db.capacityDeclaration.update({
      where: { id: hours.declaration.id },
      data: { unitType: 'HOURS' },
    });
    const full = await participant('Hidden commercial full', 10);
    const consumed = await db.commercialOrder.create({
      data: {
        rfq: {
          create: {
            buyerOrganizationId: buyerOrg.id,
            operatorOrganizationId: operatorOrg.id,
            craftSkillId: 'weaving',
            title: 'Synthetic full capacity',
            specification: 'Synthetic only',
            designRequirements: 'Synthetic only',
            quantity: 10,
            deliveryAt: period.effectiveTo,
            deliveryLocation: 'Synthetic site',
            status: 'ACCEPTED',
          },
        },
        status: 'CLOSED',
      },
    });
    await db.commercialOffer.create({
      data: {
        orderId: consumed.id,
        artisanProfileId: full.profile.id,
        capacityDeclarationId: full.declaration.id,
        quantity: 10,
        unitPayMillimes: 1000n,
        estimatedHours: '1.00–1.00',
        expiresAt: period.effectiveFrom,
        materials: 'Synthetic only',
        reworkTerms: 'Synthetic only',
        paymentConditions: 'Simulated only',
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        batch: {
          create: {
            orderId: consumed.id,
            artisanProfileId: full.profile.id,
            status: 'COMPLETED',
            produced: 10,
          },
        },
      },
    });
    await db.artisanProfile.create({
      data: {
        displayName: 'Hidden commercial pottery',
        region: 'Synthetic quarter',
        equipment: [],
        skills: { create: { craftSkillId: 'pottery' } },
      },
    });
    const independent = await db.artisanProfile.create({
      data: {
        displayName: 'Hidden commercial independent',
        region: 'Synthetic quarter',
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    await db.onboardingAuthorization.create({
      data: {
        artisanProfileId: independent.id,
        policyId: policy.id,
        purpose: 'PARTICIPATION',
        method: 'SIGNED',
        occurredAt: new Date(),
        language: 'ar',
        evidenceReference: 'Synthetic independent confirmation',
        recordedById: operator.me.user.id,
      },
    });
    await db.capacityDeclaration.create({
      data: {
        artisanProfileId: independent.id,
        craftSkillId: 'weaving',
        unitType: 'PIECES',
        quantity: 50,
        ...period,
        declaredByUserId: operator.me.user.id,
      },
    });
    const production = `/orders/${order.id}`;
    const hidden = await post(outsider, `${production}/eligibility-assessments`, {
      version: 1,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic product file',
    });
    assert.equal(hidden.status, 404);
    const adminDenied = await post(admin, `${production}/eligibility-assessments`, {
      version: 1,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic product file',
    });
    assert.equal(adminDenied.status, 404);
    const buyerDenied = await post(buyer, `${production}/eligibility-assessments`, {
      version: 1,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic product file',
    });
    assert.equal(buyerDenied.status, 403);
    assert.equal(JSON.stringify(buyerDenied.body).includes('Hidden commercial'), false);
    assert.equal(await db.eligibilityAssessment.count({ where: { orderId: order.id } }), 0);
    const unreviewed = await post(operator, `${production}/eligibility-assessments`, {
      version: order.version,
      restrictionsReviewed: false,
    });
    assert.equal(unreviewed.status, 201, JSON.stringify(unreviewed.body));
    const unreviewedRows = (
      unreviewed.body as {
        assessments: { displayName: string; decision: string; unknown: string[] }[];
      }
    ).assessments;
    assert.equal(
      unreviewedRows.find((row) => row.displayName === 'Hidden commercial beta')?.decision,
      'NEEDS_REVIEW',
    );
    assert.equal(
      unreviewedRows
        .find((row) => row.displayName === 'Hidden commercial beta')
        ?.unknown.includes('PRODUCT_RESTRICTIONS_UNVERIFIED'),
      true,
    );
    const blockedOffer = await post(operator, `${production}/offers`, {
      version: (unreviewed.body as { summary: { orderVersion: number } }).summary.orderVersion,
      eligibilityId: (
        unreviewed.body as { assessments: { id: string; displayName: string }[] }
      ).assessments.find((row) => row.displayName === 'Hidden commercial beta')!.id,
      quantity: 10,
      expiresAt: '2027-09-20T00:00:00.000Z',
      materials: 'Synthetic yarn supplied by the operator',
      reworkTerms: 'Rework requires a new agreement',
      paymentConditions: 'Pay approved pieces independently of buyer delay',
      collectionArrangement: 'Collect at the synthetic workshop',
      instructions: 'Follow the accepted specification version',
    });
    assert.equal(blockedOffer.status, 409);
    const reviewed = await post(operator, `${production}/eligibility-assessments`, {
      version: (unreviewed.body as { summary: { orderVersion: number } }).summary.orderVersion,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic product file',
    });
    assert.equal(reviewed.status, 201, JSON.stringify(reviewed.body));
    const rows = (
      reviewed.body as {
        assessments: {
          id: string;
          displayName: string;
          decision: string;
          knownRemaining: string | null;
          reasons: { code: string }[];
          accountLinked: boolean;
        }[];
      }
    ).assessments;
    const row = (name: string) => rows.find((item) => item.displayName === name);
    assert.equal(row('Hidden commercial beta')?.decision, 'ELIGIBLE');
    assert.equal(row('Hidden commercial beta')?.accountLinked, true);
    assert.equal(row('Hidden commercial beta')?.knownRemaining, '50.00');
    assert.equal(row('Hidden commercial alpha')?.decision, 'ELIGIBLE');
    assert.equal(row('Hidden commercial alpha')?.knownRemaining, '30.00');
    assert.equal(row('Hidden commercial alpha')?.accountLinked, false);
    assert.equal(
      row('Hidden commercial alpha')?.reasons.some(
        (reason) => reason.code === 'ACCOUNTLESS_PARTICIPATION',
      ),
      true,
    );
    assert.equal(row('Hidden commercial independent')?.decision, 'ELIGIBLE');
    assert.equal(row('Hidden commercial paused')?.decision, 'INELIGIBLE');
    assert.equal(row('Hidden commercial unauthorized')?.decision, 'INELIGIBLE');
    assert.equal(row('Hidden commercial hours')?.decision, 'INELIGIBLE');
    assert.equal(
      row('Hidden commercial hours')?.reasons.some((reason) => reason.code === 'UNIT_INCOMPATIBLE'),
      true,
    );
    assert.equal(row('Hidden commercial full')?.decision, 'INELIGIBLE');
    assert.equal(row('Hidden commercial pottery'), undefined);
    assert.equal(JSON.stringify(reviewed.body).includes('+21699000222'), false);
    const version = (reviewed.body as { summary: { orderVersion: number } }).summary.orderVersion;
    const terms = {
      materials: 'Synthetic yarn supplied by the operator',
      reworkTerms: 'Rework requires a new agreement',
      paymentConditions: 'Pay approved pieces independently of buyer delay',
      collectionArrangement: 'Collect at the synthetic workshop',
      instructions: 'Follow the accepted specification version',
    };
    const orderVersion = async () =>
      (
        (await operator.client.request(`${root}/orders/${order.id}/production`)).body as {
          summary: { orderVersion: number };
        }
      ).summary.orderVersion;
    const draft = async (name: string, quantity: number, useVersion = version) =>
      post(operator, `${production}/offers`, {
        version: useVersion,
        eligibilityId: row(name)!.id,
        quantity,
        expiresAt: '2027-09-20T00:00:00.000Z',
        ...terms,
      });
    const firstRace = await draft('Hidden commercial independent', 30);
    const secondRace = await draft('Hidden commercial independent', 30, await orderVersion());
    assert.equal(firstRace.status, 201, JSON.stringify(firstRace.body));
    assert.equal(secondRace.status, 201, JSON.stringify(secondRace.body));
    const raced = await Promise.all(
      [firstRace, secondRace].map((item) =>
        post(operator, `/offers/${(item.body as { id: string }).id}/issue`, {
          version: (item.body as { version: number }).version,
        }),
      ),
    );
    assert.deepEqual(raced.map((item) => item.status).sort(), [201, 409]);
    const deniedRace = raced.find((item) => item.status === 409);
    assert.ok(deniedRace);
    assert.equal((deniedRace.body as { code: string }).code, 'CAPACITY_EXCEEDED');
    const betaDraft = await draft('Hidden commercial beta', 40, await orderVersion());
    assert.equal(betaDraft.status, 201, JSON.stringify(betaDraft.body));
    const betaOffer = betaDraft.body as {
      id: string;
      version: number;
      status: string;
      unitPayTnd: string;
      totalPayTnd: string;
      estimatedHours: string;
      termsSha256: string;
    };
    assert.equal(betaOffer.status, 'PREPARED');
    assert.equal(betaOffer.unitPayTnd, '3.000');
    assert.equal(betaOffer.totalPayTnd, '120.000');
    assert.equal(betaOffer.estimatedHours, '60.00-100.00');
    const remainingBeforeIssue = row('Hidden commercial beta')?.knownRemaining;
    assert.equal(remainingBeforeIssue, '50.00');
    const issued = await post(operator, `/offers/${betaOffer.id}/issue`, {
      version: betaOffer.version,
    });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    assert.equal((issued.body as { status: string }).status, 'OFFERED');
    const tooMuch = await draft('Hidden commercial beta', 20, await orderVersion());
    assert.equal(tooMuch.status, 409);
    assert.equal((tooMuch.body as { code: string }).code, 'CAPACITY_EXCEEDED');
    const overOrder = await draft('Hidden commercial gamma', 70, await orderVersion());
    assert.equal(overOrder.status, 409);
    assert.equal((overOrder.body as { code: string }).code, 'EXCESS_QUANTITY');
    const accept = await artisan.client.request(
      `/api/v1/commerce/offers/${betaOffer.id}/actions`,
      'POST',
      {
        next: 'ACCEPTED',
        version: (issued.body as { version: number }).version,
        termsSha256: 'b'.repeat(64),
      },
      {
        'X-CSRF-Token': ((await artisan.client.request('/api/v1/me')).body as { csrfToken: string })
          .csrfToken,
        'Idempotency-Key': randomUUID(),
      },
    );
    assert.equal(accept.status, 409);
    assert.equal((accept.body as { code: string }).code, 'STALE_TERMS');
    assert.equal(await db.commercialBatch.count({ where: { offerId: betaOffer.id } }), 0);

    // A French profile must not silently accept English commercial terms.
    for (const review of [
      {},
      { reviewLanguage: 'fr', sourceTermsLanguage: 'en', acknowledgeOriginalTerms: true },
    ]) {
      const denied = await artisan.client.request(
        `/api/v1/commerce/offers/${betaOffer.id}/actions`,
        'POST',
        {
          next: 'ACCEPTED',
          version: (issued.body as { version: number }).version,
          termsSha256: betaOffer.termsSha256,
          ...review,
        },
        {
          'X-CSRF-Token': (
            (await artisan.client.request('/api/v1/me')).body as { csrfToken: string }
          ).csrfToken,
          'Idempotency-Key': randomUUID(),
        },
      );
      assert.equal(denied.status, 409, JSON.stringify(denied.body));
      assert.equal((denied.body as { code: string }).code, 'SOURCE_TERMS_REVIEW_REQUIRED');
      assert.equal(await db.commercialBatch.count({ where: { offerId: betaOffer.id } }), 0);
      assert.equal(
        await db.auditEvent.count({
          where: { targetId: betaOffer.id, action: 'commerce.offer.accepted' },
        }),
        0,
      );
    }
    const acceptedOffer = await artisan.client.request(
      `/api/v1/commerce/offers/${betaOffer.id}/actions`,
      'POST',
      {
        next: 'ACCEPTED',
        version: (issued.body as { version: number }).version,
        termsSha256: betaOffer.termsSha256,
        reviewLanguage: 'en',
        sourceTermsLanguage: 'en',
        acknowledgeOriginalTerms: true,
      },
      {
        'X-CSRF-Token': ((await artisan.client.request('/api/v1/me')).body as { csrfToken: string })
          .csrfToken,
        'Idempotency-Key': randomUUID(),
      },
    );
    assert.equal(acceptedOffer.status, 201, JSON.stringify(acceptedOffer.body));
    const languageAudit = await db.auditEvent.findFirstOrThrow({
      where: { targetId: betaOffer.id, action: 'commerce.offer.accepted' },
    });
    assert.equal(
      (languageAudit.after as { reviewedTranslationAvailable: boolean })
        .reviewedTranslationAvailable,
      false,
    );
    assert.equal(
      (languageAudit.after as { termsSha256: string }).termsSha256,
      betaOffer.termsSha256,
    );
    assert.equal(await db.commercialBatch.count({ where: { offerId: betaOffer.id } }), 1);
    assert.equal(
      (await db.commercialOffer.findUniqueOrThrow({ where: { id: betaOffer.id } })).status,
      'ACCEPTED',
    );
    const impersonated = await coordinator.client.request(
      `/api/v1/commerce/offers/${betaOffer.id}/actions`,
      'POST',
      { next: 'ACCEPTED', version: 1, termsSha256: betaOffer.termsSha256 },
      {
        'X-CSRF-Token': (
          (await coordinator.client.request('/api/v1/me')).body as { csrfToken: string }
        ).csrfToken,
        'Idempotency-Key': randomUUID(),
      },
    );
    assert.equal(impersonated.status, 403);
    const current = (await operator.client.request(`${root}/orders/${order.id}/production`))
      .body as {
      summary: { orderVersion: number; accepted: number; reserved: number };
    };
    const gammaDraft = await post(operator, `${production}/offers`, {
      version: current.summary.orderVersion,
      eligibilityId: row('Hidden commercial gamma')!.id,
      quantity: 10,
      expiresAt: '2027-09-20T00:00:00.000Z',
      ...terms,
    });
    assert.equal(gammaDraft.status, 201, JSON.stringify(gammaDraft.body));
    const gammaOffer = gammaDraft.body as { id: string; version: number; termsSha256: string };
    const gammaIssued = await post(operator, `/offers/${gammaOffer.id}/issue`, {
      version: gammaOffer.version,
    });
    assert.equal(gammaIssued.status, 201, JSON.stringify(gammaIssued.body));
    const operatorReport = await post(operator, `/offers/${gammaOffer.id}/assisted-decisions`, {
      version: (gammaIssued.body as { version: number }).version,
      decision: 'ACCEPT',
      evidenceReference: 'Synthetic in-person note',
    });
    assert.equal(operatorReport.status, 404);
    const report = await post(coordinator, `/offers/${gammaOffer.id}/assisted-decisions`, {
      version: (gammaIssued.body as { version: number }).version,
      decision: 'ACCEPT',
      evidenceReference: 'Synthetic in-person note',
    });
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal((report.body as { status: string }).status, 'OFFERED');
    assert.equal(
      (report.body as { assisted: { verificationStatus: string } }).assisted.verificationStatus,
      'PENDING_UNAPPROVED_METHOD',
    );
    const duplicate = await post(coordinator, `/offers/${gammaOffer.id}/assisted-decisions`, {
      version: (gammaIssued.body as { version: number }).version,
      decision: 'ACCEPT',
      evidenceReference: 'Synthetic duplicate note',
    });
    assert.equal(duplicate.status, 409);
    const verify = await coordinator.client.request(
      `${root}/offers/${gammaOffer.id}/assisted-decisions/${(report.body as { assisted: { id: string } }).assisted.id}/verify`,
      'POST',
      {},
      {
        'X-CSRF-Token': (
          (await coordinator.client.request('/api/v1/me')).body as { csrfToken: string }
        ).csrfToken,
      },
    );
    assert.equal(verify.status, 409);
    assert.equal((verify.body as { code: string }).code, 'VERIFICATION_UNAPPROVED');
    assert.equal(
      (await db.commercialOffer.findUniqueOrThrow({ where: { id: gammaOffer.id } })).status,
      'OFFERED',
    );
    assert.equal(await db.commercialBatch.count({ where: { offerId: gammaOffer.id } }), 0);
    const linkedReport = await post(coordinator, `/offers/${betaOffer.id}/assisted-decisions`, {
      version: (issued.body as { version: number }).version,
      decision: 'ACCEPT',
      evidenceReference: 'Synthetic should not apply',
    });
    assert.notEqual(linkedReport.status, 201);
    const declineDraft = await post(operator, `${production}/offers`, {
      version: (
        (await operator.client.request(`${root}/orders/${order.id}/production`)).body as {
          summary: { orderVersion: number };
        }
      ).summary.orderVersion,
      eligibilityId: row('Hidden commercial beta')!.id,
      quantity: 10,
      expiresAt: '2027-09-20T00:00:00.000Z',
      ...terms,
    });
    assert.equal(declineDraft.status, 201, JSON.stringify(declineDraft.body));
    const declineIssued = await post(
      operator,
      `/offers/${(declineDraft.body as { id: string }).id}/issue`,
      { version: (declineDraft.body as { version: number }).version },
    );
    assert.equal(declineIssued.status, 201, JSON.stringify(declineIssued.body));
    const declined = await artisan.client.request(
      `/api/v1/commerce/offers/${(declineDraft.body as { id: string }).id}/actions`,
      'POST',
      {
        next: 'DECLINED',
        version: (declineIssued.body as { version: number }).version,
        termsSha256: (declineDraft.body as { termsSha256: string }).termsSha256,
      },
      {
        'X-CSRF-Token': ((await artisan.client.request('/api/v1/me')).body as { csrfToken: string })
          .csrfToken,
        'Idempotency-Key': randomUUID(),
      },
    );
    assert.equal(declined.status, 201, JSON.stringify(declined.body));
    assert.equal(
      await db.commercialBatch.count({
        where: { offerId: (declineDraft.body as { id: string }).id },
      }),
      0,
    );
    const again = await post(operator, `${production}/eligibility-assessments`, {
      version: (
        (await operator.client.request(`${root}/orders/${order.id}/production`)).body as {
          summary: { orderVersion: number };
        }
      ).summary.orderVersion,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic product file',
    });
    const after = (
      again.body as { assessments: { displayName: string; knownRemaining: string | null }[] }
    ).assessments.find((item) => item.displayName === 'Hidden commercial beta');
    assert.equal(after?.knownRemaining, '10.00');
    await runCollaborationScenarios({
      db,
      buyer,
      operator,
      artisan,
      outsider,
      admin,
      orderId: order.id,
      profileId: beta.profile.id,
      check,
    });
  });
}
