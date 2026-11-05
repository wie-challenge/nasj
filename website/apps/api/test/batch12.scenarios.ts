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
export async function runBatch12Scenarios({ db, register, check }: Harness) {
  const [sales, finance, buyer, artisan, quality, stranger, admin] = await Promise.all(
    ['sales', 'finance', 'buyer', 'artisan', 'quality', 'stranger', 'admin'].map((r) =>
      register(`batch12-${r}@example.com`, `Synthetic Batch12 ${r}`),
    ),
  );
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: sales.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: stranger.me.user.id,
    },
    'batch12',
  );
  const orgId = fixture.operatorOrganizationId;
  const salesMember = await db.organizationMember.findFirstOrThrow({
    where: { organizationId: orgId, userId: sales.me.user.id },
  });
  await db.membershipRole.create({
    data: {
      membershipId: salesMember.id,
      role: 'BUSINESS_DEVELOPMENT',
      assignedByUserId: sales.me.user.id,
    },
  });
  for (const person of [sales, finance])
    await db.operatorAssignment.create({
      data: {
        operatorId: person.me.user.id,
        organizationId: fixture.buyerOrganizationId,
        assignedById: sales.me.user.id,
      },
    });
  const financeMember = await db.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: finance.me.user.id,
      roles: { create: { role: 'FINANCE_MANAGER', assignedByUserId: sales.me.user.id } },
    },
  });
  for (const permission of [
    'finance.payable.reconcile',
    'finance.accounting.export',
    'finance.closure.assess',
    'finance.adjustment.propose',
    'finance.payout.request',
    'finance.payout.execute',
  ])
    await db.membershipPermission.create({
      data: {
        membershipId: financeMember.id,
        permission,
        grantedById: sales.me.user.id,
        reason: 'Synthetic Batch12 scoped authority',
      },
    });
  async function send(who: Identity, path: string, body: unknown, key = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(`/api/v1/${path}`, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  const ok = <T>(r: Result) => {
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body as T;
  };
  const prospectInput = {
    operatorOrganizationId: orgId,
    buyerOrganizationId: fixture.buyerOrganizationId,
    segment: 'Hospitality',
    needs: 'Documented pilot needs',
    qualificationNotes: 'Discovery only, no commitment',
    status: 'LEAD',
    ownerId: sales.me.user.id,
    nextAction: 'Review buyer needs',
    followUpAt: null,
    contactBasis: 'CONSENT',
    basisEvidence: 'Synthetic contact consent reference',
    contactReviewAt: '2027-12-01T00:00:00Z',
    reason: 'Synthetic discovery',
  };
  let prospectId = '';
  let groupId = '';
  await check(
    'B12 pipeline scopes contact access, preserves versioned discovery and idempotent creation',
    async () => {
      const key = randomUUID();
      const a = ok<{ id: string }>(await send(sales, 'sales/prospects', prospectInput, key));
      const b = ok<{ id: string }>(await send(sales, 'sales/prospects', prospectInput, key));
      assert.equal(a.id, b.id);
      prospectId = a.id;
      const workspace = await sales.client.request('/api/v1/sales');
      assert.equal(workspace.status, 200);
      assert.match(JSON.stringify(workspace.body), /Hospitality/);
      assert.equal((await stranger.client.request('/api/v1/sales')).status, 404);
      assert.equal((await buyer.client.request('/api/v1/sales')).status, 404);
      assert.equal(
        (
          await send(sales, 'sales/prospects', {
            ...prospectInput,
            buyerOrganizationId: fixture.otherBuyerOrganizationId,
          })
        ).status,
        404,
      );
    },
  );
  await check(
    'B12 pipeline transitions preserve history, expired contacts disappear and stale writes fail',
    async () => {
      const { operatorOrganizationId, buyerOrganizationId, ...details } = prospectInput;
      void operatorOrganizationId;
      void buyerOrganizationId;
      ok(
        await send(sales, `sales/prospects/${prospectId}`, {
          ...details,
          version: 1,
          status: 'QUALIFIED',
          contactReviewAt: '2020-01-01T00:00:00Z',
        }),
      );
      assert.equal(
        (
          await send(sales, `sales/prospects/${prospectId}`, {
            ...details,
            version: 1,
            status: 'QUALIFIED',
          })
        ).status,
        409,
      );
      const w = (await sales.client.request('/api/v1/sales')).body as {
        prospects: {
          id: string;
          organization: { contactEmail: string | null };
          revisions: unknown[];
        }[];
      };
      const p = w.prospects.find((p) => p.id === prospectId)!;
      assert.equal(p.organization.contactEmail, null);
      assert.equal(p.revisions.length, 2);
      ok(
        await send(sales, `sales/prospects/${prospectId}`, {
          ...details,
          version: 2,
          status: 'QUALIFIED',
          reason: 'Synthetic renewed documented contact permission',
        }),
      );
      assert.equal(
        (
          await send(sales, `sales/prospects/${prospectId}`, {
            ...details,
            version: 2,
            status: 'CONTRACTED',
          })
        ).status,
        409,
      );
    },
  );
  const rfq = await db.commercialRfq.create({
    data: {
      buyerOrganizationId: fixture.buyerOrganizationId,
      operatorOrganizationId: orgId,
      craftSkillId: 'weaving',
      title: 'Synthetic Batch12 RFQ',
      specification: 'Versioned sample needs',
      designRequirements: 'Documented sample',
      quantity: 10,
      deliveryAt: new Date(fixture.deliveryAt),
      deliveryLocation: 'Synthetic Tunis',
      status: 'SUBMITTED',
      provenance: 'SYNTHETIC',
    },
  });
  const specification = await db.productSpecification.create({
    data: {
      ownerOrganizationId: orgId,
      productCode: `B12-${randomUUID()}`,
      name: 'Batch12 synthetic product',
      craftSkillId: 'weaving',
      authorId: sales.me.user.id,
    },
  });
  const revision = await db.productSpecificationRevision.create({
    data: {
      specificationId: specification.id,
      revisionNumber: 1,
      status: 'APPROVED',
      description: 'Synthetic approved source',
      dimensions: '10x10',
      unit: 'PIECES',
      materials: [],
      instructions: 'Use the exact source',
      tolerances: 'One mm',
      qualityCriteria: 'Follow the versioned inspection checklist',
      referenceImages: [],
      authorId: sales.me.user.id,
    },
  });
  const proposal = {
    version: 1,
    specificationRevisionId: revision.id,
    quantity: 10,
    proposedPriceTnd: '100.001',
    estimatedCostTnd: '70.001',
    validUntil: '2027-12-01T00:00:00Z',
    timing: 'Review before production',
    responsibilities: 'No artisan assignment',
    status: 'DRAFT',
    buyerResponse: 'Awaiting response',
    reason: 'Initial documented proposal',
    feedback: '',
    decisionAt: null,
  };
  await check(
    'B12 proposal revisions preserve exact scope and cannot win without authorized RFQ evidence',
    async () => {
      const draft = ok<{ groupId: string }>(
        await send(sales, `sales/prospects/${prospectId}/proposals`, proposal),
      );
      groupId = draft.groupId;
      ok(
        await send(sales, `sales/prospects/${prospectId}/proposals`, {
          ...proposal,
          groupId,
          version: 2,
          status: 'SENT',
        }),
      );
      assert.equal(
        (
          await send(sales, `sales/prospects/${prospectId}/proposals`, {
            ...proposal,
            groupId,
            version: 3,
            status: 'WON',
            decisionAt: new Date().toISOString(),
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await send(stranger, `sales/prospects/${prospectId}/proposals`, {
            ...proposal,
            groupId,
            version: 3,
          })
        ).status,
        404,
      );
    },
  );
  await check(
    'B12 won proposal links RFQ without creating artisan consent or financial obligations',
    async () => {
      const before = {
        offers: await db.commercialOffer.count(),
        payables: await db.artisanPayable.count(),
        samples: await db.productSampleRequest.count(),
      };
      const key = randomUUID();
      const input = {
        ...proposal,
        groupId,
        version: 3,
        status: 'WON',
        decisionAt: new Date().toISOString(),
        rfqId: rfq.id,
      };
      const one = ok<{ id: string; createsAgreement: boolean }>(
        await send(sales, `sales/prospects/${prospectId}/proposals`, input, key),
      );
      const two = ok<{ id: string }>(
        await send(sales, `sales/prospects/${prospectId}/proposals`, input, key),
      );
      assert.equal(one.id, two.id);
      assert.equal(one.createsAgreement, false);
      assert.deepEqual(
        {
          offers: await db.commercialOffer.count(),
          payables: await db.artisanPayable.count(),
          samples: await db.productSampleRequest.count(),
        },
        before,
      );
      assert.equal(await db.pilotProposalRevision.count({ where: { groupId } }), 3);
      await assert.rejects(
        db.pilotProposalRevision.update({
          where: { id: one.id },
          data: { snapshot: { status: 'LOST' } },
        }),
      );
    },
  );
  let createdOrderId = '';
  await check(
    'B12 sales conversion requires exact sustainable cost and funding review before buyer contract acceptance',
    async () => {
      const revision = await db.procurementRevision.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          authorId: sales.me.user.id,
          reason: 'Synthetic baseline terms',
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
          requestedQuantity: '10',
          knownRemaining: '10',
          effortMin: '5',
          effortMax: '10',
          constraints: [],
          explanation: 'Synthetic complete evidence',
          assumptions: { provenance: 'SYNTHETIC' },
          authorId: sales.me.user.id,
        },
      });
      const cost = await db.costEstimate.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          feasibilityAssessmentId: feasibility.id,
          quantity: 10,
          components: [{ category: 'ARTISAN_LABOR', amountTnd: '70.001' }],
          subtotalMillimes: 70001n,
          marginMethod: 'NONE',
          marginBasisPoints: 0,
          sellingMillimes: 100001n,
          incomplete: false,
          status: 'APPROVED',
          authorId: sales.me.user.id,
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const quote = await db.procurementQuote.create({
        data: {
          rfqId: rfq.id,
          version: 1,
          revisionId: revision.id,
          authorId: sales.me.user.id,
          totalMillimes: 100001n,
          expiresAt: new Date(fixture.quoteExpiresAt),
          snapshot: { provenance: 'SYNTHETIC' },
          costEstimateId: cost.id,
          feasibilityAssessmentId: feasibility.id,
          termsSha256: 'ab'.repeat(32),
        },
      });
      await db.commercialRfq.update({
        where: { id: rfq.id },
        data: { status: 'QUOTED', procurementManaged: true },
      });
      const accept = {
        version: 1,
        quoteId: quote.id,
        confirm: true,
        termsSha256: quote.termsSha256,
      };
      const blocked = await send(buyer, `procurement/rfqs/${rfq.id}/accept`, accept);
      assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
      assert.equal((blocked.body as { code: string }).code, 'FINANCE_REVIEW_REQUIRED');
      const review = {
        quoteId: quote.id,
        decision: 'APPROVE_ADVISORY',
        fundingStatus: 'UNFUNDED',
        fundingEvidence: 'Synthetic funding plan only',
        reason: 'Review exact commercial proposal',
      };
      assert.equal((await send(finance, `finance/rfqs/${rfq.id}/review`, review)).status, 409);
      ok(
        await send(finance, `finance/rfqs/${rfq.id}/review`, {
          ...review,
          fundingStatus: 'DOCUMENTED_PLAN',
        }),
      );
      const accepted = ok<{ id: string }>(
        await send(buyer, `procurement/rfqs/${rfq.id}/accept`, accept),
      );
      createdOrderId = accepted.id;
      const stage = (await db.commercialProspect.findUniqueOrThrow({ where: { id: prospectId } }))
        .snapshot as { status: string; stageProvenance: string };
      assert.equal(stage.status, 'CONTRACTED');
      assert.equal(stage.stageProvenance, 'SYNTHETIC_APPLICATION_ACCEPTANCE');
    },
  );
  const order = await db.commercialOrder.findUniqueOrThrow({ where: { id: createdOrderId } });
  async function linkedQuotation() {
    const request = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: fixture.buyerOrganizationId,
        operatorOrganizationId: orgId,
        craftSkillId: 'weaving',
        title: 'Remediation linked request',
        specification: 'Exact synthetic terms',
        designRequirements: 'Independent audit source',
        quantity: 1,
        deliveryAt: new Date(fixture.deliveryAt),
        deliveryLocation: 'Synthetic Tunis',
        status: 'QUOTED',
        procurementManaged: true,
      },
    });
    const revision = await db.procurementRevision.create({
      data: {
        rfqId: request.id,
        version: 1,
        authorId: sales.me.user.id,
        reason: 'Exact remediation source',
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    const feasibility = await db.feasibilityAssessment.create({
      data: {
        rfqId: request.id,
        version: 1,
        rfqVersion: 1,
        result: 'FEASIBLE',
        unitType: 'PIECES',
        requestedQuantity: '1',
        knownRemaining: '10',
        effortMin: '5',
        effortMax: '10',
        constraints: [],
        explanation: 'Synthetic supported estimate',
        assumptions: { provenance: 'SYNTHETIC' },
        authorId: sales.me.user.id,
      },
    });
    const cost = await db.costEstimate.create({
      data: {
        rfqId: request.id,
        version: 1,
        feasibilityAssessmentId: feasibility.id,
        quantity: 1,
        components: [{ category: 'ARTISAN_LABOR', amountTnd: '70.001' }],
        subtotalMillimes: 70001n,
        marginMethod: 'NONE',
        marginBasisPoints: 0,
        sellingMillimes: 100001n,
        incomplete: false,
        status: 'APPROVED',
        authorId: sales.me.user.id,
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    const quote = await db.procurementQuote.create({
      data: {
        rfqId: request.id,
        version: 1,
        revisionId: revision.id,
        authorId: sales.me.user.id,
        totalMillimes: 100001n,
        expiresAt: new Date(fixture.quoteExpiresAt),
        snapshot: { provenance: 'SYNTHETIC' },
        costEstimateId: cost.id,
        feasibilityAssessmentId: feasibility.id,
        termsSha256: 'cd'.repeat(32),
      },
    });
    const draft = ok<{ groupId: string }>(
      await send(sales, `sales/prospects/${prospectId}/proposals`, {
        ...proposal,
        rfqId: request.id,
      }),
    );
    ok(
      await send(sales, `sales/prospects/${prospectId}/proposals`, {
        ...proposal,
        groupId: draft.groupId,
        version: 2,
        status: 'SENT',
        rfqId: request.id,
      }),
    );
    return {
      request,
      quote,
      cost,
      feasibility,
      revision,
      groupId: draft.groupId,
      accept: { version: 1, quoteId: quote.id, termsSha256: quote.termsSha256, confirm: true },
      review: {
        quoteId: quote.id,
        decision: 'APPROVE_ADVISORY',
        fundingStatus: 'DOCUMENTED_PLAN',
        fundingEvidence: 'Reviewed funding plan version one',
        reason: 'Exact remediation finance review',
      },
    };
  }
  await check(
    'R12 SENT proposal keeps an authorized RFQ link and missing, held or rejected review denies acceptance',
    async () => {
      const c = await linkedQuotation();
      assert.equal(
        (
          await db.pilotProposalRevision.findFirstOrThrow({
            where: { groupId: c.groupId, version: 2 },
          })
        ).rfqId,
        c.request.id,
      );
      const attempt = () => send(buyer, `procurement/rfqs/${c.request.id}/accept`, c.accept);
      for (const state of ['MISSING', 'HOLD', 'REJECT']) {
        if (state !== 'MISSING')
          ok(
            await send(finance, `finance/rfqs/${c.request.id}/review`, {
              ...c.review,
              decision: state,
              fundingStatus: 'UNFUNDED',
            }),
          );
        const denied = await attempt();
        assert.equal(denied.status, 409, JSON.stringify(denied.body));
        assert.equal((denied.body as { code: string }).code, 'FINANCE_REVIEW_REQUIRED');
        assert.equal(await db.commercialOrder.count({ where: { rfqId: c.request.id } }), 0);
      }
      assert.equal(
        (await send(sales, `finance/rfqs/${c.request.id}/review`, c.review)).status,
        404,
      );
      assert.equal(
        (
          await send(stranger, `sales/prospects/${prospectId}/proposals`, {
            ...proposal,
            rfqId: c.request.id,
          })
        ).status,
        404,
      );
    },
  );
  await check(
    'R12 current approval permits idempotent concurrent acceptance before WON without artisan commitment',
    async () => {
      const c = await linkedQuotation();
      ok(await send(finance, `finance/rfqs/${c.request.id}/review`, c.review));
      const before = await db.artisanPayable.count();
      const key = randomUUID();
      const results = await Promise.all([
        send(buyer, `procurement/rfqs/${c.request.id}/accept`, c.accept, key),
        send(buyer, `procurement/rfqs/${c.request.id}/accept`, c.accept, key),
      ]);
      const first = ok<{ id: string }>(results[0]),
        second = ok<{ id: string }>(results[1]);
      assert.equal(first.id, second.id);
      assert.equal(await db.commercialOrder.count({ where: { rfqId: c.request.id } }), 1);
      assert.equal(await db.artisanPayable.count(), before);
      ok(
        await send(sales, `sales/prospects/${prospectId}/proposals`, {
          ...proposal,
          groupId: c.groupId,
          version: 3,
          status: 'WON',
          rfqId: c.request.id,
          decisionAt: new Date().toISOString(),
        }),
      );
      assert.equal(await db.commercialOrder.count({ where: { rfqId: c.request.id } }), 1);
    },
  );
  await check(
    'R12 changed RFQ assumptions or latest funding plan invalidate the previous approval',
    async () => {
      const c = await linkedQuotation();
      ok(await send(finance, `finance/rfqs/${c.request.id}/review`, c.review));
      await db.commercialRfq.update({ where: { id: c.request.id }, data: { version: 2 } });
      assert.equal(
        (await send(buyer, `procurement/rfqs/${c.request.id}/accept`, { ...c.accept, version: 2 }))
          .status,
        409,
      );
      ok(await send(finance, `finance/rfqs/${c.request.id}/review`, c.review));
      ok(
        await send(finance, `finance/rfqs/${c.request.id}/review`, {
          ...c.review,
          decision: 'HOLD',
          fundingStatus: 'UNFUNDED',
          fundingEvidence: 'Funding plan was withdrawn',
        }),
      );
      assert.equal(
        (await send(buyer, `procurement/rfqs/${c.request.id}/accept`, { ...c.accept, version: 2 }))
          .status,
        409,
      );
    },
  );
  await check(
    'R12 changed costing requires a fresh quote and approval; historical JSON SENT links remain gated',
    async () => {
      const c = await linkedQuotation();
      ok(await send(finance, `finance/rfqs/${c.request.id}/review`, c.review));
      const { id, createdAt, ...old } = c.cost;
      void id;
      void createdAt;
      const revised = await db.costEstimate.create({
        data: {
          ...old,
          components: [{ category: 'ARTISAN_LABOR', amountTnd: '80.001' }],
          snapshot: { provenance: 'SYNTHETIC' },
          version: 2,
          subtotalMillimes: 80001n,
        },
      });
      assert.equal(
        (await send(buyer, `procurement/rfqs/${c.request.id}/accept`, c.accept)).status,
        409,
      );
      assert.equal(
        (await send(finance, `finance/rfqs/${c.request.id}/review`, c.review)).status,
        409,
      );
      const { id: qid, createdAt: qdate, ...q } = c.quote;
      void qid;
      void qdate;
      const quote = await db.procurementQuote.create({
        data: {
          ...q,
          snapshot: { provenance: 'SYNTHETIC' },
          version: 2,
          costEstimateId: revised.id,
          termsSha256: 'ef'.repeat(32),
        },
      });
      assert.equal(
        (await send(buyer, `procurement/rfqs/${c.request.id}/accept`, c.accept)).status,
        409,
      );
      ok(
        await send(finance, `finance/rfqs/${c.request.id}/review`, {
          ...c.review,
          quoteId: quote.id,
        }),
      );
      ok(
        await send(buyer, `procurement/rfqs/${c.request.id}/accept`, {
          ...c.accept,
          quoteId: quote.id,
          termsSha256: quote.termsSha256,
        }),
      );
      const other = await linkedQuotation();
      // Native append-only legacy fixture: prior software stored the authorized reference only in JSON.
      await db.pilotProposalRevision.create({
        data: {
          prospectId,
          groupId: randomUUID(),
          version: 1,
          specificationRevisionId: revision.id,
          actorId: sales.me.user.id,
          snapshot: { ...proposal, status: 'SENT', rfqId: other.request.id },
        },
      });
      assert.equal(
        (await send(buyer, `procurement/rfqs/${other.request.id}/accept`, other.accept)).status,
        409,
      );
    },
  );

  await check(
    'B12 financial analysis reports unknowns and refuses unrelated contact or buyer finance disclosure',
    async () => {
      const r = await finance.client.request(`/api/v1/finance/orders/${order.id}/analysis`);
      assert.equal(r.status, 200);
      const data = r.body as {
        actualContributionTnd: null;
        cashModel: null;
        verifiedReceiptsTnd: string;
      };
      assert.equal(data.actualContributionTnd, null);
      assert.equal(data.cashModel, null);
      assert.equal(data.verifiedReceiptsTnd, '0.000');
      for (const who of [buyer, stranger, artisan])
        assert.equal(
          (await who.client.request(`/api/v1/finance/orders/${order.id}/analysis`)).status,
          404,
        );
    },
  );
  await check(
    'B12 cost evidence uses exact money, rejects duplicates atomically and preserves source events',
    async () => {
      const cost = {
        category: 'MATERIAL',
        amountTnd: '12.345',
        sourceReference: '=SYNTHETIC-INVOICE-1',
        occurredAt: '2026-10-15T00:00:00Z',
        provenance: 'SYNTHETIC',
        reason: 'Synthetic attributed material evidence',
      };
      const key = randomUUID();
      const a = ok<{ id: string }>(
        await send(finance, `finance/orders/${order.id}/costs`, cost, key),
      );
      const b = ok<{ id: string }>(
        await send(finance, `finance/orders/${order.id}/costs`, cost, key),
      );
      assert.equal(a.id, b.id);
      const count = await db.auditEvent.count();
      assert.equal((await send(finance, `finance/orders/${order.id}/costs`, cost)).status, 409);
      assert.equal(await db.auditEvent.count(), count);
      assert.equal((await send(buyer, `finance/orders/${order.id}/costs`, cost)).status, 404);
      assert.equal(
        (
          await send(finance, `finance/orders/${order.id}/costs`, {
            ...cost,
            amountTnd: '1.0001',
          })
        ).status,
        400,
      );
      const r = await finance.client.request(`/api/v1/finance/orders/${order.id}/analysis`);
      assert.equal((r.body as { recordedCostsTnd: string }).recordedCostsTnd, '12.345');
      await assert.rejects(db.financeRecordEvent.delete({ where: { id: a.id } }));
    },
  );
  await check(
    'B12 dated working-capital review preserves unknown dates and separates estimates from transactions',
    async () => {
      const model = {
        reason: 'Finance advisory review only',
        varianceReason: 'Recorded material receipt differs from quote',
        costCoverage: 'INCOMPLETE',
        events: [
          {
            sourceReference: 'Material plan',
            direction: 'OUT',
            amountTnd: '20.001',
            date: '2026-10-01T00:00:00Z',
            basis: 'Projected material payment',
          },
          {
            sourceReference: 'Buyer plan',
            direction: 'IN',
            amountTnd: '10.000',
            date: null,
            basis: 'Unknown buyer receipt date',
          },
        ],
      };
      ok(await send(finance, `finance/orders/${order.id}/cash-review`, model));
      const r = (await finance.client.request(`/api/v1/finance/orders/${order.id}/analysis`))
        .body as {
        cashModel: { minimumModeledGapTnd: null; knownDatedEventsGapTnd: string };
        actualContributionTnd: null;
      };
      assert.equal(r.cashModel.minimumModeledGapTnd, null);
      assert.equal(r.cashModel.knownDatedEventsGapTnd, '20.001');
      assert.equal(r.actualContributionTnd, null);
    },
  );
  // Include newly recorded fixture events after the calendar crosses into November.
  const through = new Date(Date.now() + 86400000).toISOString();
  const query = `?from=2026-10-01T00:00:00.000Z&to=${encodeURIComponent(through)}`;
  await check(
    'B12 accounting export reconciles immutable sources with period, audit and financial disclosure scopes',
    async () => {
      const path = `/api/v1/finance/orders/${order.id}/accounting-export${query}`;
      const r = await finance.client.request(path);
      assert.equal(r.status, 200);
      const data = r.body as {
        rowCount: number;
        totals: { amountTnd: string }[];
        reconciled: boolean;
        csv: string;
      };
      assert.equal(data.reconciled, true);
      assert.equal(data.rowCount, 2);
      assert.ok(data.totals.some((t) => t.amountTnd === '12.345'));
      assert.match(data.csv, /COST_MATERIAL/);
      assert.doesNotMatch(data.csv, /contactEmail|beneficiary/);
      for (const who of [sales, buyer, stranger])
        assert.equal((await who.client.request(path)).status, 404);
      assert.equal(
        (
          await finance.client.request(
            `/api/v1/finance/orders/${order.id}/accounting-export?from=no&to=no`,
          )
        ).status,
        400,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { action: 'finance.accounting.export', targetId: order.id },
        }),
        1,
      );
    },
  );
  await check(
    'B12 timeliness returns unavailable rather than simulated payment performance',
    async () => {
      const r = await finance.client.request(
        `/api/v1/finance/orders/${order.id}/timeliness${query}`,
      );
      assert.equal(r.status, 200);
      const data = r.body as { eligiblePaymentCount: number; onTimePercentage: null };
      assert.equal(data.eligiblePaymentCount, 0);
      assert.equal(data.onTimePercentage, null);
      assert.equal(
        (await buyer.client.request(`/api/v1/finance/orders/${order.id}/timeliness${query}`))
          .status,
        404,
      );
    },
  );
  await check(
    'B12 financial closure denies unapproved exceptions, preserves liabilities and replays one immutable decision',
    async () => {
      const key = randomUUID(),
        input = {
          version: order.version,
          reason: 'Synthetic closure review',
          exceptionReference: 'Administrator request cannot waive debt',
        };
      const a = ok<{ id: string; status: string; exceptionDisposition: string }>(
        await send(finance, `finance/orders/${order.id}/close`, input, key),
      );
      const b = ok<{ id: string }>(
        await send(finance, `finance/orders/${order.id}/close`, input, key),
      );
      assert.equal(a.id, b.id);
      assert.equal(a.status, 'DENIED');
      assert.equal(a.exceptionDisposition, 'DENIED_NO_APPROVED_EXCEPTION_POLICY');
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
        order.status,
      );
      assert.equal((await send(buyer, `finance/orders/${order.id}/close`, input)).status, 404);
      assert.equal(
        (await send(finance, `finance/orders/${order.id}/close`, { ...input, version: 99 })).status,
        409,
      );
    },
  );
  await check(
    'B12 finance review cannot approve unsupported costs or unfunded conversion',
    async () => {
      assert.equal(
        (
          await send(sales, `finance/rfqs/${rfq.id}/review`, {
            quoteId: 'unknown',
            decision: 'APPROVE_ADVISORY',
            fundingStatus: 'UNFUNDED',
            fundingEvidence: 'No supported funding',
            reason: 'Synthetic unsupported review',
          })
        ).status,
        404,
      );
    },
  );
  async function settledLegacy() {
    const legacy = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: fixture.buyerOrganizationId,
        operatorOrganizationId: orgId,
        craftSkillId: 'weaving',
        title: 'Remediation legacy close',
        specification: 'Synthetic exact audit fixture',
        designRequirements: 'Preserve closure authority',
        quantity: 1,
        deliveryAt: new Date(fixture.deliveryAt),
        deliveryLocation: 'Synthetic Tunis',
        status: 'ACCEPTED',
        quoteMillimes: 1000n,
        order: { create: { status: 'SETTLED', delivered: 1 } },
      },
      include: { order: true },
    });
    const offer = await db.commercialOffer.create({
      data: {
        orderId: legacy.order!.id,
        capacityDeclarationId: fixture.capacityDeclarationId,
        artisanProfileId: fixture.artisanProfileId,
        quantity: 1,
        unitPayMillimes: 1000n,
        estimatedHours: '1',
        expiresAt: new Date(fixture.offerExpiresAt),
        materials: 'Synthetic only',
        reworkTerms: 'Reviewed',
        paymentConditions: 'Synthetic accepted terms',
        status: 'ACCEPTED',
        batch: {
          create: {
            orderId: legacy.order!.id,
            artisanProfileId: fixture.artisanProfileId,
            status: 'COMPLETED',
            produced: 1,
            submitted: 1,
            approved: 1,
          },
        },
      },
      include: { batch: true },
    });
    await db.syntheticPayment.createMany({
      data: [
        {
          orderId: legacy.order!.id,
          kind: 'BUYER_RECEIPT',
          amountMillimes: 1000n,
          status: 'SETTLED',
          evidenceType: 'SIMULATED_SETTLEMENT',
        },
        {
          orderId: legacy.order!.id,
          batchId: offer.batch!.id,
          kind: 'ARTISAN_PAYOUT',
          amountMillimes: 1000n,
          status: 'SETTLED',
          evidenceType: 'SIMULATED_SETTLEMENT',
        },
      ],
    });
    return { order: legacy.order!, batch: offer.batch!, offer };
  }
  async function payableFixture(terms = 'Accepted milestone terms; no structured date exists yet') {
    const legacy = await settledLegacy();
    const payable = await db.artisanPayable.create({
      data: {
        orderId: legacy.order.id,
        offerId: legacy.offer.id,
        batchId: legacy.batch.id,
        artisanProfileId: fixture.artisanProfileId,
        milestone: 'BUYER_ACCEPTED_PIECE',
        policyVersion: 1,
        quantity: 1,
        unitPayMillimes: 1000n,
        amountMillimes: 1000n,
        sourceEventId: `remediation:${randomUUID()}`,
        termsSnapshot: terms,
      },
    });
    return { ...legacy, payable };
  }
  await check(
    'R12 contractual dates append immutable exact-source corrections without rewriting accepted terms',
    async () => {
      const c = await payableFixture();
      const terms = c.payable.termsSnapshot;
      const input = {
        payableId: c.payable.id,
        version: 1,
        basis: 'ACCEPTED_TERMS_EVIDENCE',
        dueAt: '2026-10-15T00:00:00Z',
        sourceEvidence: 'Synthetic accepted contract paragraph seven',
        reason: 'Transcribe existing contractual date only',
      };
      const key = randomUUID();
      const first = ok<{ id: string; contractVersion: string }>(
        await send(finance, `finance/orders/${c.order.id}/contractual-dates`, input, key),
      );
      const repeated = ok<{ id: string }>(
        await send(finance, `finance/orders/${c.order.id}/contractual-dates`, input, key),
      );
      assert.equal(first.id, repeated.id);
      assert.match(first.contractVersion, /^PAYABLE_TERMS_SHA256:/);
      assert.equal(
        (await send(buyer, `finance/orders/${c.order.id}/contractual-dates`, input)).status,
        404,
      );
      assert.equal(
        (await send(finance, `finance/orders/${order.id}/contractual-dates`, input)).status,
        404,
      );
      assert.equal(
        (
          await send(finance, `finance/orders/${c.order.id}/contractual-dates`, {
            ...input,
            basis: 'UNKNOWN',
          })
        ).status,
        400,
      );
      assert.equal(
        (await send(finance, `finance/orders/${c.order.id}/contractual-dates`, input)).status,
        409,
      );
      const second = ok<{ id: string }>(
        await send(finance, `finance/orders/${c.order.id}/contractual-dates`, {
          ...input,
          version: 2,
          basis: 'UNKNOWN',
          dueAt: null,
          reason: 'Prior transcription lacks sufficient source evidence',
        }),
      );
      const saved = await db.contractualDueDate.findUniqueOrThrow({ where: { id: second.id } });
      assert.equal(saved.correctionOfId, first.id);
      await assert.rejects(
        db.contractualDueDate.create({
          data: { ...saved, id: randomUUID(), version: 3, correctionOfId: first.id },
        }),
      );
      await assert.rejects(
        db.contractualDueDate.update({ where: { id: first.id }, data: { dueAt: null } }),
      );
      assert.equal(
        (await db.artisanPayable.findUniqueOrThrow({ where: { id: c.payable.id } })).termsSnapshot,
        terms,
      );
      const history = await finance.client.request(
        `/api/v1/finance/orders/${c.order.id}/contractual-dates`,
      );
      assert.equal(history.status, 200);
      assert.equal((history.body as { history: unknown[] }).history.length, 2);
    },
  );
  await check(
    'R12 actual timeliness exposes scheduled, pending, failed and partial reports without verified payment',
    async () => {
      const c = await payableFixture(JSON.stringify({ paymentDueAt: '2020-01-01T00:00:00Z' }));
      const report = () =>
        finance.client.request(
          `/api/v1/finance/orders/${c.order.id}/timeliness?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z`,
        );
      const first = await report();
      assert.equal(first.status, 200);
      assert.equal((first.body as { details: { dueAt: null }[] }).details[0].dueAt, null);
      ok(
        await send(finance, `finance/orders/${c.order.id}/contractual-dates`, {
          payableId: c.payable.id,
          version: 1,
          basis: 'ACCEPTED_TERMS_EVIDENCE',
          dueAt: '2026-10-15T00:00:00Z',
          sourceEvidence: 'Synthetic exact accepted terms reference',
          reason: 'Recorded contractual date, not bank proof',
        }),
      );
      const payout = ok<{ id: string }>(
        await send(finance, `finance/orders/${c.order.id}/payouts`, {
          payableId: c.payable.id,
          amountTnd: '1.000',
          reason: 'Synthetic requested payout',
        }),
      );
      const scheduled = (await report()).body as { details: { operationalState: string }[] };
      assert.equal(scheduled.details[0].operationalState, 'SCHEDULED');
      ok(
        await send(sales, `finance/payouts/${payout.id}/approve`, {
          reason: 'Independent synthetic checker approval',
        }),
      );
      const execution = {
        amountTnd: '0.400',
        reference: `remediation-${randomUUID()}`,
        evidence: 'Unverified execution report only',
        occurredAt: '2026-10-14T00:00:00Z',
        outcome: 'FAILED',
      };
      ok(await send(finance, `finance/payouts/${payout.id}/executions`, execution));
      assert.equal(
        ((await report()).body as { details: { operationalState: string }[] }).details[0]
          .operationalState,
        'FAILED',
      );
      ok(
        await send(finance, `finance/payouts/${payout.id}/executions`, {
          ...execution,
          reference: `remediation-${randomUUID()}`,
          outcome: 'REPORTED',
        }),
      );
      const partial = (await report()).body as {
        verificationAvailability: string;
        eligiblePaymentCount: number;
        onTimePercentage: null;
        details: {
          dueAt: string;
          operationalState: string;
          executionStatuses: string[];
          reportedUnverifiedTnd: string;
        }[];
      };
      assert.equal(partial.eligiblePaymentCount, 0);
      assert.equal(partial.onTimePercentage, null);
      assert.equal(partial.details[0].operationalState, 'PARTIAL_REPORTED_UNVERIFIED');
      assert.equal(partial.details[0].reportedUnverifiedTnd, '0.400');
      assert.ok(partial.details[0].executionStatuses.includes('FAILED'));
      assert.match(partial.verificationAvailability, /UNAVAILABLE/);
      assert.equal(partial.details[0].dueAt, '2026-10-15T00:00:00.000Z');
      assert.equal(
        (
          await send(finance, `finance/payouts/${payout.id}/executions`, {
            ...execution,
            reference: `remediation-${randomUUID()}`,
            amountTnd: '2.000',
            outcome: 'REPORTED',
          })
        ).status,
        409,
      );
      await assert.rejects(
        db.payoutExecutionRecord.create({
          data: {
            payoutId: payout.id,
            amountMillimes: 1000n,
            reference: randomUUID(),
            evidence: 'Forbidden synthetic bank verification',
            occurredAt: new Date(),
            actorId: finance.me.user.id,
            status: 'VERIFIED_SETTLED',
            bankVerified: true,
          },
        }),
      );
      const dispute = await db.paymentDispute.create({
        data: {
          orderId: c.order.id,
          batchId: c.batch.id,
          payableId: c.payable.id,
          artisanProfileId: fixture.artisanProfileId,
          amountMillimes: 1000n,
          reason: 'Independent payment dispute',
          description: 'Unresolved synthetic payment',
          evidence: 'Synthetic claim evidence',
          actorId: artisan.me.user.id,
          responseDueAt: new Date(Date.now() + 86400000),
        },
      });
      assert.ok(dispute.id);
      assert.equal(
        ((await report()).body as { details: { operationalState: string }[] }).details[0]
          .operationalState,
        'DISPUTED',
      );
    },
  );
  await check(
    'R12 native simulated and overpayment reports remain outside the verified denominator',
    async () => {
      const c = await payableFixture();
      await db.simulatedSettlement.create({
        data: {
          orderId: c.order.id,
          payableId: c.payable.id,
          subjectKey: c.payable.id,
          side: 'ARTISAN',
          attempt: 1,
          status: 'SIMULATED_SETTLED',
          amountMillimes: 1000n,
          dueAt: new Date('2026-10-15T00:00:00Z'),
        },
      });
      const payout = await db.payoutRequest.create({
        data: {
          orderId: c.order.id,
          payableId: c.payable.id,
          amountMillimes: 1000n,
          payableSnapshotMillimes: 1000n,
          requesterId: finance.me.user.id,
          reason: 'Synthetic native mismatch reports',
        },
      });
      await db.payoutExecutionRecord.createMany({
        data: [1000n, 500n].map((amountMillimes) => ({
          payoutId: payout.id,
          amountMillimes,
          reference: randomUUID(),
          evidence: 'Unverified native reconciliation mismatch',
          occurredAt: new Date(),
          actorId: finance.me.user.id,
          status: 'VERIFICATION_PENDING',
          bankVerified: false,
        })),
      });
      const data = (
        await finance.client.request(
          `/api/v1/finance/orders/${c.order.id}/timeliness?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z`,
        )
      ).body as {
        eligiblePaymentCount: number;
        onTimePercentage: null;
        details: { operationalState: string; simulatedSettlementStatuses: string[] }[];
      };
      assert.equal(data.eligiblePaymentCount, 0);
      assert.equal(data.onTimePercentage, null);
      assert.equal(data.details[0].operationalState, 'OVERPAYMENT_REPORTED_REVIEW');
      assert.ok(data.details[0].simulatedSettlementStatuses.includes('SIMULATED_SETTLED'));
    },
  );
  const closeInput = {
    next: 'CLOSED',
    version: 1,
    materialsResolved: true,
    dispositionNote: 'Synthetic material reconciliation does not waive financial obligations',
  };
  await check(
    'R12 closure exact pending-adjustment counterexample denies legacy and finance routes without waiving liabilities',
    async () => {
      const legacy = await settledLegacy();
      const adjustment = ok<{ id: string }>(
        await send(finance, `finance/orders/${legacy.order.id}/adjustments`, {
          amountTnd: '1.000',
          kind: 'PARTIAL_FULFILLMENT',
          reason: 'Unresolved exact audit adjustment',
          evidence: 'Independent counterexample retained',
        }),
      );
      const assessment = await finance.client.request(
        `/api/v1/finance/orders/${legacy.order.id}/closure`,
      );
      assert.equal(assessment.status, 200);
      assert.ok(
        (assessment.body as { blockers: string[] }).blockers.includes(
          'SETTLEMENT_POLICY_REVIEW_REQUIRED',
        ),
      );
      const key = randomUUID();
      for (let i = 0; i < 2; i++) {
        const denied = await send(
          sales,
          `commerce/orders/${legacy.order.id}/actions`,
          closeInput,
          key,
        );
        assert.equal(denied.status, 409, JSON.stringify(denied.body));
        assert.equal((denied.body as { code: string }).code, 'FINANCIAL_CLOSURE_REQUIRED');
      }
      const rejected = ok<{ status: string }>(
        await send(finance, `finance/orders/${legacy.order.id}/close`, {
          version: 1,
          reason: 'No lawful exception installed',
          exceptionReference: 'Administrator cannot waive this obligation',
        }),
      );
      assert.equal(rejected.status, 'DENIED');
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: legacy.order.id } })).status,
        'SETTLED',
      );
      assert.equal(
        (await db.financialAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } })).status,
        'PENDING_REVIEW',
      );
    },
  );
  await check(
    'R12 closure detects inventory readiness, payable, dispute and partial buyer evidence through their real relationships',
    async () => {
      const inventory = await settledLegacy();
      const revision = await db.procurementRevision.create({
        data: {
          rfqId: inventory.order.rfqId,
          version: 1,
          authorId: sales.me.user.id,
          reason: 'Synthetic released material source',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const sample = await db.procurementSample.create({
        data: {
          rfqId: inventory.order.rfqId,
          version: 1,
          revisionId: revision.id,
          authorId: sales.me.user.id,
          evidenceReference: 'Synthetic approved sample reference',
          criteria: 'Material standard',
          snapshot: { provenance: 'SYNTHETIC' },
        },
      });
      const release = await db.batchRelease.create({
        data: {
          batchId: inventory.batch.id,
          actorId: sales.me.user.id,
          revisionId: revision.id,
          sampleId: sample.id,
          fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
          materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
        },
      });
      const requirement = await db.batchMaterialRequirement.create({
        data: {
          batchId: inventory.batch.id,
          releaseId: release.id,
          materialCode: 'cotton',
          name: 'Cotton',
          unit: 'METERS',
          perItemMilli: 1000,
          wastageBps: 0,
          batchQuantity: 1,
          requiredMilli: 1000,
          readiness: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
        },
      });
      await db.materialReadiness.create({
        data: {
          batchId: inventory.batch.id,
          requirementId: requirement.id,
          materialCode: 'cotton',
          readiness: 'RECEIPT_INCOMPLETE',
        },
      });
      assert.equal(
        (await send(sales, `commerce/orders/${inventory.order.id}/actions`, closeInput)).status,
        409,
      );
      const stock = (
        await finance.client.request(`/api/v1/finance/orders/${inventory.order.id}/closure`)
      ).body as { blockers: string[] };
      assert.ok(stock.blockers.includes('MATERIAL_READINESS_REVIEW_REQUIRED'));
      const owing = await payableFixture();
      await db.buyerDepositRecord.create({
        data: {
          orderId: owing.order.id,
          buyerOrganizationId: fixture.buyerOrganizationId,
          expectedMillimes: 1000n,
          amountMillimes: 500n,
          paymentReference: `partial-${randomUUID()}`,
          paymentDate: new Date(),
          evidence: 'Partial unverified buyer receipt',
          provenance: 'PENDING_VERIFICATION',
          actorId: finance.me.user.id,
        },
      });
      await db.paymentDispute.create({
        data: {
          orderId: owing.order.id,
          batchId: owing.batch.id,
          payableId: owing.payable.id,
          artisanProfileId: fixture.artisanProfileId,
          amountMillimes: 1000n,
          reason: 'Outstanding artisan claim',
          description: 'Synthetic dispute',
          evidence: 'Preserve claim',
          actorId: artisan.me.user.id,
          responseDueAt: new Date(Date.now() + 86400000),
        },
      });
      assert.equal(
        (await send(sales, `commerce/orders/${owing.order.id}/actions`, closeInput)).status,
        409,
      );
      const finances = (
        await finance.client.request(`/api/v1/finance/orders/${owing.order.id}/closure`)
      ).body as { blockers: string[] };
      for (const code of [
        'ARTISAN_PAYABLES_OUTSTANDING',
        'OPEN_PAYMENT_DISPUTES',
        'BUYER_RECEIVABLES_UNRECONCILED',
      ])
        assert.ok(finances.blockers.includes(code), code);
    },
  );
  await check(
    'R12 closure and a concurrent adjustment cannot leave a closed order with a newly accepted adjustment',
    async () => {
      const legacy = await settledLegacy();
      const [closed, adjustment] = await Promise.all([
        send(sales, `commerce/orders/${legacy.order.id}/actions`, closeInput),
        send(finance, `finance/orders/${legacy.order.id}/adjustments`, {
          amountTnd: '1.001',
          kind: 'PARTIAL_FULFILLMENT',
          reason: 'Concurrent unresolved obligation',
          evidence: 'Synthetic race',
        }),
      ]);
      if (closed.status === 201) {
        assert.equal(adjustment.status, 409);
        assert.equal(
          await db.financialAdjustment.count({ where: { orderId: legacy.order.id } }),
          0,
        );
      } else {
        assert.equal(closed.status, 409, JSON.stringify(closed.body));
        assert.equal(adjustment.status, 201, JSON.stringify(adjustment.body));
        assert.equal(
          (await db.commercialOrder.findUniqueOrThrow({ where: { id: legacy.order.id } })).status,
          'SETTLED',
        );
      }
    },
  );
  await check(
    'B12 legacy simulation cannot close an order with finance source records',
    async () => {
      const legacy = await db.commercialRfq.create({
        data: {
          buyerOrganizationId: fixture.buyerOrganizationId,
          operatorOrganizationId: orgId,
          craftSkillId: 'weaving',
          title: 'Synthetic legacy closure boundary',
          specification: 'Synthetic legacy scope',
          designRequirements: 'Preserve finance authority',
          quantity: 1,
          deliveryAt: new Date(fixture.deliveryAt),
          deliveryLocation: 'Synthetic Tunis',
          status: 'ACCEPTED',
          order: { create: { status: 'SETTLED' } },
        },
        include: { order: true },
      });
      await db.financeRecordEvent.create({
        data: {
          orderId: legacy.order!.id,
          targetId: legacy.order!.id,
          targetType: 'OrderCostEvidence',
          actorId: finance.me.user.id,
          status: 'RECORDED_UNVERIFIED',
          reason: 'Synthetic source evidence',
          data: { amountTnd: '1.001' },
        },
      });
      const result = await send(sales, `commerce/orders/${legacy.order!.id}/actions`, {
        next: 'CLOSED',
        version: 1,
        materialsResolved: true,
        dispositionNote: 'Synthetic material reconciliation cannot override finance source records',
      });
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal((result.body as { code: string }).code, 'FINANCIAL_CLOSURE_REQUIRED');
    },
  );
  await check(
    'B12 prospect discovery never enrolls a verified buyer and supports audited name correction',
    async () => {
      const { buyerOrganizationId, ...discovery } = prospectInput;
      void buyerOrganizationId;
      const row = ok<{ id: string; buyerOrganizationId: string }>(
        await send(sales, 'sales/prospects', {
          ...discovery,
          organizationName: 'Synthetic unverified lead',
          contactEmail: 'synthetic-lead@example.com',
        }),
      );
      const org = await db.organization.findUniqueOrThrow({
        where: { id: row.buyerOrganizationId },
      });
      assert.equal(org.approvalStatus, 'PENDING_REVIEW');
      assert.equal(await db.organizationMember.count({ where: { organizationId: org.id } }), 0);
      const { operatorOrganizationId, ...details } = discovery;
      void operatorOrganizationId;
      ok(
        await send(sales, `sales/prospects/${row.id}`, {
          ...details,
          version: 1,
          organizationName: 'Corrected synthetic lead',
          reason: 'Documented organization name correction',
        }),
      );
      assert.equal(
        (await db.organization.findUniqueOrThrow({ where: { id: org.id } })).name,
        'Corrected synthetic lead',
      );
    },
  );
  await check('B12 revoked membership immediately removes sales and finance access', async () => {
    await db.organizationMember.update({
      where: { id: salesMember.id },
      data: { status: 'SUSPENDED' },
    });
    assert.equal((await sales.client.request('/api/v1/sales')).status, 404);
    await db.organizationMember.update({
      where: { id: financeMember.id },
      data: { status: 'SUSPENDED' },
    });
    assert.equal(
      (await finance.client.request(`/api/v1/finance/orders/${order.id}/analysis`)).status,
      404,
    );
  });
  await check(
    'B12 retention inventory is governed, non-destructive and never claims legal approval',
    async () => {
      assert.equal((await stranger.client.request('/api/v1/governance/retention')).status, 404);
      await db.user.update({ where: { id: admin.me.user.id }, data: { role: 'ADMIN' } });
      const inventory = await admin.client.request('/api/v1/governance/retention');
      assert.equal(inventory.status, 200);
      const data = inventory.body as {
        version: string;
        inventory: unknown[];
        purgeEnabled: boolean;
      };
      assert.equal(
        data.inventory.length,
        11,
        'buyer and showroom feedback each add a purpose entry',
      );
      assert.ok(
        (data.inventory as { dataClass: string }[]).some(
          (row) => row.dataClass === 'BUYER_ORDER_FEEDBACK',
        ),
      );
      assert.equal(data.purgeEnabled, false);
      const input = {
        version: data.version,
        purpose: 'Synthetic operational inventory review',
        reason: 'Retention durations and named legal owners remain pending',
      };
      const result = ok<{ purgeEnabled: boolean }>(
        await send(admin, 'governance/retention/review', input),
      );
      assert.equal(result.purgeEnabled, false);
      assert.equal(
        (await send(admin, 'governance/retention/review', { ...input, purgeEnabled: true })).status,
        400,
      );
    },
  );
}
