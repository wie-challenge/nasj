import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { formatTnd } from '@nasj/contracts';
import type { PrismaService } from '../src/database/prisma.service.js';
type Identity = {
  me: { user: { id: string } };
  client: {
    request(
      path: string,
      method?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; body: unknown }>;
  };
};
export async function runFinanceScenarios(
  db: PrismaService,
  actors: {
    operator: Identity;
    finance: Identity;
    artisan: Identity;
    buyer: Identity;
    admin: Identity;
    coordinator: Identity;
    stranger: Identity;
  },
  orderId: string,
  batchId: string,
) {
  const { operator, finance, artisan, buyer, admin, coordinator, stranger } = actors;
  const root = '/api/v1/finance';
  const send = async (who: Identity, path: string, body: unknown, key = randomUUID()) => {
    const me = await who.client.request('/api/v1/me');
    return who.client.request(root + path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  };
  const id = (r: { body: unknown }) => (r.body as { id: string }).id;
  const ok = (r: { status: number; body: unknown }) =>
    assert.equal(r.status, 201, JSON.stringify(r.body));
  const order = await db.commercialOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { rfq: true },
  });
  const member = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: order.rfq.operatorOrganizationId,
        userId: operator.me.user.id,
      },
    },
  });
  for (const permission of [
    'finance.deposit.record',
    'finance.payout.request',
    'finance.payout.approve',
    'finance.payout.execute',
    'finance.dispute.manage',
    'finance.adjustment.propose',
    'finance.adjustment.approve',
    'finance.closure.assess',
    'finance.accounting.export',
  ])
    await db.membershipPermission.create({
      data: {
        membershipId: member.id,
        permission,
        grantedById: operator.me.user.id,
        reason: 'Synthetic finance integration authority',
      },
    });
  const checker = await db.organizationMember.findUniqueOrThrow({
    where: {
      organizationId_userId: {
        organizationId: order.rfq.operatorOrganizationId,
        userId: finance.me.user.id,
      },
    },
  });
  for (const permission of ['finance.deposit.review', 'finance.adjustment.approve'])
    await db.membershipPermission.create({
      data: {
        membershipId: checker.id,
        permission,
        grantedById: operator.me.user.id,
        reason: 'Synthetic independent review',
      },
    });
  for (const who of [admin, stranger, coordinator])
    assert.equal((await who.client.request(`${root}/orders/${orderId}`)).status, 404);
  const deposit = {
    amountTnd: '0.001',
    paymentReference: 'Synthetic bank claim',
    paymentDate: '2026-10-01T00:00:00Z',
    evidence: 'Synthetic evidence, not verified',
    provenance: 'SYNTHETIC',
  };
  assert.equal((await send(admin, `/orders/${orderId}/deposits`, deposit)).status, 404);
  const key = randomUUID();
  const d = await send(operator, `/orders/${orderId}/deposits`, deposit, key);
  ok(d);
  assert.equal((d.body as { status: string }).status, 'PENDING_VERIFICATION');
  assert.equal((d.body as { coverage: string }).coverage, 'PARTIAL');
  assert.equal(id(await send(operator, `/orders/${orderId}/deposits`, deposit, key)), id(d));
  assert.equal((await send(operator, `/orders/${orderId}/deposits`, deposit)).status, 409);
  assert.equal(
    (
      await send(finance, `/deposits/${id(d)}/review`, {
        decision: 'VERIFIED',
        reason: 'Pretend verified',
      })
    ).status,
    400,
  );
  ok(
    await send(finance, `/deposits/${id(d)}/review`, {
      decision: 'PENDING_VERIFICATION',
      reason: 'No bank evidence authority',
    }),
  );
  const payable = await db.artisanPayable.findFirstOrThrow({ where: { orderId } });
  await assert.rejects(
    db.payoutRequest.create({
      data: {
        orderId,
        payableId: payable.id,
        amountMillimes: 1n,
        payableSnapshotMillimes: payable.amountMillimes,
        requesterId: operator.me.user.id,
        reason: 'Forged approval metadata',
        status: 'APPROVED',
      },
    }),
  );
  const huge = await send(operator, `/orders/${orderId}/payouts`, {
    payableId: payable.id,
    amountTnd: '999999999.000',
    reason: 'Above payable',
  });
  assert.equal(huge.status, 409);
  const requests = await Promise.all([
    send(operator, `/orders/${orderId}/payouts`, {
      payableId: payable.id,
      amountTnd: formatTnd(payable.amountMillimes),
      reason: 'Controlled partial request',
    }),
    send(operator, `/orders/${orderId}/payouts`, {
      payableId: payable.id,
      amountTnd: formatTnd(payable.amountMillimes),
      reason: 'Concurrent duplicate obligation',
    }),
  ]);
  assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
  const p = requests.find((r) => r.status === 201)!;
  assert.equal(
    (await send(operator, `/payouts/${id(p)}/approve`, { reason: 'Self approval' })).status,
    409,
  );
  await db.membershipPermission.create({
    data: {
      membershipId: checker.id,
      permission: 'finance.payout.approve',
      enabled: false,
      grantedById: operator.me.user.id,
      reason: 'Revoked check authority',
    },
  });
  assert.equal(
    (await send(finance, `/payouts/${id(p)}/approve`, { reason: 'Revoked checker' })).status,
    404,
  );
  await db.membershipPermission.deleteMany({
    where: { membershipId: checker.id, permission: 'finance.payout.approve' },
  });
  await db.organizationMember.update({ where: { id: checker.id }, data: { status: 'SUSPENDED' } });
  assert.equal(
    (await send(finance, `/payouts/${id(p)}/approve`, { reason: 'Suspended checker' })).status,
    404,
  );
  await db.organizationMember.update({ where: { id: checker.id }, data: { status: 'ACTIVE' } });
  const approvals = await Promise.all([
    send(finance, `/payouts/${id(p)}/approve`, { reason: 'Independent approval' }),
    send(finance, `/payouts/${id(p)}/approve`, { reason: 'Duplicate approval' }),
  ]);
  assert.deepEqual(approvals.map((r) => r.status).sort(), [201, 409]);
  const original = payable.amountMillimes;
  await assert.rejects(
    db.artisanPayable.update({
      where: { id: payable.id },
      data: { amountMillimes: original + 1n },
    }),
  );
  await db.payoutRequest.update({
    where: { id: id(p) },
    data: { payableSnapshotMillimes: original + 1n },
  });
  const execution = {
    amountTnd: '0.001',
    reference: 'manual-first-attempt',
    evidence: 'Reported manually; no approved bank authority',
    occurredAt: '2026-10-02T00:00:00Z',
    outcome: 'REPORTED',
  };
  assert.equal((await send(operator, `/payouts/${id(p)}/executions`, execution)).status, 409);
  await db.payoutRequest.update({
    where: { id: id(p) },
    data: { payableSnapshotMillimes: original },
  });
  assert.equal(
    (await send(operator, `/payouts/${id(p)}/executions`, { ...execution, bankVerified: true }))
      .status,
    400,
  );
  ok(await send(operator, `/payouts/${id(p)}/executions`, { ...execution, outcome: 'FAILED' }));
  await assert.rejects(
    db.payoutExecutionRecord.create({
      data: {
        payoutId: id(p),
        amountMillimes: 1n,
        reference: 'forged-live-receipt',
        evidence: 'Synthetic',
        occurredAt: new Date(),
        actorId: operator.me.user.id,
        status: 'PAID_VERIFIED',
        bankVerified: true,
      },
    }),
  );
  const ex = await send(operator, `/payouts/${id(p)}/executions`, {
    ...execution,
    reference: 'manual-second-attempt',
  });
  ok(ex);
  assert.equal((ex.body as { bankVerified: boolean }).bankVerified, false);
  assert.equal((ex.body as { status: string }).status, 'VERIFICATION_PENDING');
  const dispute = {
    batchId,
    payableId: payable.id,
    amountTnd: '0.001',
    reason: 'Payment concern',
    description: 'Review the reported execution evidence',
    evidence: 'Artisan reported concern',
  };
  assert.equal((await send(coordinator, `/orders/${orderId}/disputes`, dispute)).status, 403);
  const claim = await send(artisan, `/orders/${orderId}/disputes`, dispute);
  ok(claim);
  ok(
    await send(operator, `/disputes/${id(claim)}/review`, {
      status: 'UNDER_REVIEW',
      reason: 'Assigned independent handling',
    }),
  );
  ok(
    await send(operator, `/disputes/${id(claim)}/review`, {
      status: 'PROPOSED_RESOLUTION',
      reason: 'Proposal for claimant review',
    }),
  );
  assert.equal(
    (
      await send(operator, `/disputes/${id(claim)}/review`, {
        status: 'RESOLVED',
        reason: 'Cannot waive claim',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await send(operator, `/payouts/${id(p)}/executions`, {
        ...execution,
        reference: 'blocked-during-dispute',
      })
    ).status,
    409,
  );
  const blocked = await operator.client.request(`${root}/orders/${orderId}/closure`);
  assert.equal((blocked.body as { status: string }).status, 'BLOCKED');
  assert.ok((blocked.body as { blockers: string[] }).blockers.includes('OPEN_PAYMENT_DISPUTES'));
  assert.ok(
    (blocked.body as { blockers: string[] }).blockers.includes(
      'COMPENSATION_ENTITLEMENT_REVIEW_REQUIRED',
    ),
  );
  assert.ok(
    (blocked.body as { blockers: string[] }).blockers.includes('ARTISAN_PAYABLES_OUTSTANDING'),
  );
  assert.ok(
    (blocked.body as { blockers: string[] }).blockers.includes('MATERIAL_LIABILITIES_UNRESOLVED'),
  );
  ok(
    await send(artisan, `/disputes/${id(claim)}/review`, {
      status: 'RESOLVED',
      reason: 'I accept the proposal; outstanding payment remains owed',
    }),
  );
  ok(
    await send(artisan, `/disputes/${id(claim)}/review`, {
      status: 'CLOSED',
      reason: 'Claim history preserved',
    }),
  );
  const adj = await send(operator, `/orders/${orderId}/adjustments`, {
    kind: 'CANCELLATION',
    amountTnd: '1.000',
    reason: 'Cancellation entitlement requires approved policy',
  });
  ok(adj);
  assert.equal(
    (await send(operator, `/adjustments/${id(adj)}/approve`, { reason: 'Cannot self approve' }))
      .status,
    409,
  );
  ok(
    await send(finance, `/adjustments/${id(adj)}/approve`, {
      reason: 'Review proposal only, no obligation reduction',
    }),
  );
  assert.equal(
    (await db.artisanPayable.findUniqueOrThrow({ where: { id: payable.id } })).amountMillimes,
    original,
  );
  const assessment = await send(operator, `/orders/${orderId}/closure`, {});
  ok(assessment);
  assert.equal((assessment.body as { status: string }).status, 'BLOCKED');
  const workspace = await operator.client.request(`${root}/orders/${orderId}`);
  assert.equal(workspace.status, 200, JSON.stringify(workspace.body));
  assert.ok((workspace.body as { payables: { unitPayTnd: string }[] }).payables[0].unitPayTnd);
  assert.ok((workspace.body as { deposits: { expectedTnd: string }[] }).deposits[0].expectedTnd);
  await assert.rejects(
    db.orderClosureAssessment.create({
      data: {
        orderId,
        actorId: operator.me.user.id,
        status: 'READY_FOR_CLOSURE',
        blockers: [],
        snapshot: {},
      },
    }),
  );
  const statement = await artisan.client.request(`${root}/my-statement`);
  assert.equal(statement.status, 200);
  assert.equal(
    (statement.body as { items: { paidVerifiedTnd: string }[] }).items[0].paidVerifiedTnd,
    '0.000',
  );
  assert.equal(
    JSON.stringify((await buyer.client.request(`${root}/orders/${orderId}`)).body).includes(
      'artisanProfileId',
    ),
    false,
  );
  assert.ok((await db.financeRecordEvent.count({ where: { targetId: id(claim) } })) >= 5);
  const from = new Date(Date.now() - 30 * 86400000).toISOString(),
    to = new Date(Date.now() + 86400000).toISOString();
  const exported = await operator.client.request(
    `${root}/orders/${orderId}/accounting-export?${new URLSearchParams({ from, to })}`,
  );
  assert.equal(exported.status, 200, JSON.stringify(exported.body));
  const report = exported.body as { csv: string; totals: { group: string; amountTnd: string }[] };
  const authoritativePayables = await db.artisanPayable.findMany({ where: { orderId } });
  const liabilityTotal = authoritativePayables.reduce((sum, p) => sum + p.amountMillimes, 0n);
  const exportedLiabilities = report.totals.filter((t) => t.group.startsWith('ARTISAN_LIABILITY:'));
  assert.equal(exportedLiabilities.length, 1);
  assert.equal(exportedLiabilities[0].amountTnd, formatTnd(liabilityTotal));
  for (const source of authoritativePayables)
    assert.ok(report.csv.includes(`payable:${source.id}`));
  assert.doesNotMatch(report.csv, /VERIFIED_SETTLED|bankAccount|beneficiary/);
  assert.equal(
    (
      await buyer.client.request(
        `${root}/orders/${orderId}/accounting-export?${new URLSearchParams({ from, to })}`,
      )
    ).status,
    404,
  );
  console.log('  ✓ Batch 5 deposit, payout, execution, claim and closure governance scenarios');
}
