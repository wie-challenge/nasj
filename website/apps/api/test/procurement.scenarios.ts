import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import sharp from 'sharp';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { AppConfig } from '../src/config/env.js';
import type { ProcurementDetail, ProcurementList, ProcurementThread } from '@nasj/contracts';
import { seedCommerceFixture } from './commerce.fixture.js';
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }>;
};
type Identity = { client: Client; me: { user: { id: string } } };
export async function runProcurementScenarios({
  db,
  register,
  check,
  config,
}: {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  config: AppConfig;
}) {
  const people = await Promise.all(
    [
      'buyer',
      'operator',
      'artisan',
      'quality',
      'outsider',
      'assigned-operator',
      'coordinator',
      'unassigned-coordinator',
      'representative',
    ].map((r) => register(`procurement-${r}@example.com`, `Synthetic procurement ${r}`)),
  );
  const [
    buyer,
    operator,
    artisan,
    quality,
    outsider,
    assigned,
    coordinator,
    otherCoordinator,
    representative,
  ] = people;
  const fixture = await seedCommerceFixture(
    db,
    {
      buyerId: buyer.me.user.id,
      operatorId: operator.me.user.id,
      artisanId: artisan.me.user.id,
      qualityId: quality.me.user.id,
      outsiderId: outsider.me.user.id,
    },
    'procurement',
  );
  const input = {
    buyerOrganizationId: fixture.buyerOrganizationId,
    operatorOrganizationId: fixture.operatorOrganizationId,
    craftSkillId: 'weaving',
    title: 'Synthetic procurement request',
    specification: 'Cotton runner, synthetic reference version one.',
    designRequirements: 'Fictional blue trim and agreed dimensions.',
    quantity: 10,
    deliveryAt: fixture.deliveryAt,
    deliveryLocation: 'Synthetic Tunis collection point',
    provenance: 'SYNTHETIC',
  };
  const root = '/api/v1/procurement';
  async function command(who: Identity, path: string, body: unknown, key: string = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return who.client.request(root + path, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function ok<T = { id: string; version: number }>(
    who: Identity,
    path: string,
    body: unknown,
    key?: string,
  ) {
    const r = await command(who, path, body, key);
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.body as T;
  }
  async function get<T>(who: Identity, path: string) {
    const r = await who.client.request(root + path);
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.body as T;
  }
  const detail = () => get<ProcurementDetail>(buyer, `/rfqs/${id}`);
  let id = '',
    fileId = '',
    quoteId = '',
    orderId = '',
    productId = '';
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#11665f' } })
    .png()
    .toBuffer();
  const image = { filename: 'reference.png', mime: 'image/png', base64: png.toString('base64') };
  await check(
    'E02 draft creation validates fields, persists a revision and replays atomically',
    async () => {
      const key: string = randomUUID(),
        results = await Promise.all([
          command(buyer, '/rfqs', input, key),
          command(buyer, '/rfqs', input, key),
        ]);
      for (const r of results) assert.equal(r.status, 201, JSON.stringify(r));
      assert.deepEqual(results[0].body, results[1].body);
      id = (results[0].body as { id: string }).id;
      const d = await detail();
      assert.equal(d.rfq.procurementManaged, true);
      assert.equal(d.revisions.length, 1);
      assert.equal(d.revisions[0].authorId, buyer.me.user.id);
      assert.equal(d.revisions[0].snapshot.quantity, 10);
      assert.equal((await operator.client.request(`${root}/rfqs/${id}`)).status, 404);
      for (const body of [
        { ...input, quantity: 0 },
        { ...input, quantity: 1.5 },
        { ...input, specification: '' },
        { ...input, deliveryAt: 'not-a-date' },
        { ...input, wearableData: { strain: 1 } },
      ])
        assert.equal((await command(buyer, '/rfqs', body)).status, 400);
      const invalid = await command(buyer, '/rfqs', { ...input, quantity: 0 });
      assert.ok((invalid.body as { fieldErrors: Record<string, unknown> }).fieldErrors.quantity);
      assert.equal((await command(outsider, '/rfqs', input)).status, 403);
      assert.equal((await outsider.client.request(`${root}/rfqs/${id}`)).status, 404);
    },
  );
  await check(
    'E02 references are inspected, re-encoded and session scoped; unsafe input leaves the draft intact',
    async () => {
      const d = await detail();
      const uploaded = await ok(buyer, `/rfqs/${id}/attachments`, {
        ...image,
        version: d.rfq.version,
      });
      fileId = uploaded.id;
      const after = await detail();
      assert.equal(after.attachments[0].mime, 'image/webp');
      assert.equal(after.revisions.length, 2);
      assert.equal(after.revisions[0].predecessorId, d.revisions[0].id);
      const token = await get<{ token: string }>(buyer, `/rfqs/${id}/attachments/${fileId}/token`);
      const content = await get<{ mime: string; base64: string }>(
        buyer,
        `/rfqs/${id}/attachments/${fileId}/content?token=${encodeURIComponent(token.token)}`,
      );
      assert.equal(content.mime, 'image/webp');
      assert.equal((await sharp(Buffer.from(content.base64, 'base64')).metadata()).format, 'webp');
      assert.equal(
        (await outsider.client.request(`${root}/rfqs/${id}/attachments/${fileId}/token`)).status,
        404,
      );
      assert.equal(
        (
          await buyer.client.request(
            `${root}/rfqs/${id}/attachments/${fileId}/content?token=forged`,
          )
        ).status,
        403,
      );
      const claims = JSON.parse(Buffer.from(token.token.split('.')[0], 'base64url').toString());
      claims.expires = Date.now() - 1;
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url'),
        signature = createHmac('sha256', config.BETTER_AUTH_SECRET)
          .update(`procurement-download:${payload}`)
          .digest('base64url');
      assert.equal(
        (
          await buyer.client.request(
            `${root}/rfqs/${id}/attachments/${fileId}/content?token=${payload}.${signature}`,
          )
        ).status,
        403,
      );
      for (const body of [
        { ...image, mime: 'image/jpeg' },
        { ...image, base64: Buffer.from('MZ disguised executable').toString('base64') },
        { ...image, filename: '../unsafe.png' },
        { ...image, base64: Buffer.alloc(262145).toString('base64') },
      ])
        assert.equal(
          (await command(buyer, `/rfqs/${id}/attachments`, { ...body, version: after.rfq.version }))
            .status,
          400,
        );
      assert.equal((await detail()).rfq.version, after.rfq.version);
      await ok(buyer, `/rfqs/${id}/attachments/${fileId}/remove`, { version: after.rfq.version });
      assert.equal((await detail()).attachments.length, 0);
      assert.equal(
        (await buyer.client.request(`${root}/rfqs/${id}/attachments/${fileId}/token`)).status,
        404,
      );
      fileId = (
        await ok(buyer, `/rfqs/${id}/attachments`, {
          ...image,
          version: (await detail()).rfq.version,
        })
      ).id;
    },
  );
  await check(
    'E02 attachment count and stale-write limits hold under concurrent commands',
    async () => {
      const second = await ok(buyer, '/rfqs', { ...input, title: 'Synthetic image limit request' });
      let d = await get<ProcurementDetail>(buyer, `/rfqs/${second.id}`);
      for (let n = 0; n < 4; n++) {
        await ok(buyer, `/rfqs/${second.id}/attachments`, { ...image, version: d.rfq.version });
        d = await get<ProcurementDetail>(buyer, `/rfqs/${second.id}`);
      }
      const r = await Promise.all([
        command(buyer, `/rfqs/${second.id}/attachments`, { ...image, version: d.rfq.version }),
        command(buyer, `/rfqs/${second.id}/attachments`, { ...image, version: d.rfq.version }),
      ]);
      assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
      d = await get<ProcurementDetail>(buyer, `/rfqs/${second.id}`);
      assert.equal(d.attachments.length, 5);
      assert.equal(
        (
          await command(buyer, `/rfqs/${second.id}/attachments`, {
            ...image,
            version: d.rfq.version,
          })
        ).status,
        409,
      );
    },
  );
  await check(
    'E02 submission is versioned and replay safe; submitted content and references cannot be silently edited',
    async () => {
      const d = await detail(),
        key: string = randomUUID(),
        results = await Promise.all([
          command(buyer, `/rfqs/${id}/submit`, { version: d.rfq.version }, key),
          command(buyer, `/rfqs/${id}/submit`, { version: d.rfq.version }, key),
        ]);
      for (const r of results) assert.equal(r.status, 201);
      assert.deepEqual(results[0].body, results[1].body);
      assert.equal(
        (await command(buyer, `/rfqs/${id}/submit`, { version: d.rfq.version })).status,
        409,
      );
      const current = await detail();
      assert.equal(current.rfq.status, 'SUBMITTED');
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/attachments/${fileId}/remove`, {
            version: current.rfq.version,
          })
        ).status,
        409,
      );
      const history = await get<{ items: { actorLabel: string; code: string }[] }>(
        buyer,
        `/rfqs/${id}/activity`,
      );
      assert.equal(history.items.filter((x) => x.code === 'rfq.submitted').length, 1);
      assert.equal(history.items[0].actorLabel, 'Buyer representative');
      assert.equal((await outsider.client.request(`${root}/rfqs/${id}/activity`)).status, 404);
    },
  );
  await db.organizationMember.create({
    data: {
      userId: assigned.me.user.id,
      organizationId: fixture.operatorOrganizationId,
      roles: { create: { role: 'NASJ_OPERATOR', assignedByUserId: operator.me.user.id } },
    },
  });
  const rep = await db.organizationMember.create({
    data: {
      userId: representative.me.user.id,
      organizationId: fixture.buyerOrganizationId,
      roles: { create: { role: 'BUYER_REPRESENTATIVE', assignedByUserId: buyer.me.user.id } },
    },
  });
  await check(
    'E02 current internal operators need assigned buyer scope and buyer approval remains an explicit grant',
    async () => {
      assert.equal((await assigned.client.request(`${root}/rfqs/${id}`)).status, 404);
      await db.operatorAssignment.create({
        data: {
          operatorId: assigned.me.user.id,
          organizationId: fixture.buyerOrganizationId,
          assignedById: operator.me.user.id,
        },
      });
      assert.ok((await get<ProcurementList>(assigned, '/rfqs')).requests.some((r) => r.id === id));
      assert.equal((await get<ProcurementDetail>(assigned, `/rfqs/${id}`)).access.operator, true);
      assert.equal(
        (
          await command(representative, `/rfqs/${id}/sample-decisions`, {
            version: (await detail()).rfq.version,
            sampleId: 'forged',
            decision: 'APPROVED',
            comments: 'Attempted approval without authority.',
          })
        ).status,
        403,
      );
      await db.membershipPermission.create({
        data: {
          membershipId: rep.id,
          permission: 'buyer.rfq.create',
          enabled: false,
          grantedById: buyer.me.user.id,
          reason: 'Synthetic procurement removal test',
        },
      });
      assert.equal((await command(representative, '/rfqs', input)).status, 403);
      assert.equal(
        (await get<ProcurementDetail>(representative, `/rfqs/${id}`)).access.buyer,
        true,
      );
    },
  );
  const quoteInput = () => ({
    version: 0,
    totalTnd: '100.001',
    expiresAt: fixture.quoteExpiresAt,
    priceReview: 'Synthetic current price policy reviewed.',
    capacityReview: 'Synthetic declared capacity reviewed; not a reservation.',
    materialsReview: 'Synthetic material availability reviewed.',
    taxPolicyReference: 'SYNTHETIC-ZERO-RATE-EXAMPLE',
    taxBasisPoints: 0,
  });
  await check(
    'E02 clarifications are attributable and internal notes never enter buyer threads or timelines',
    async () => {
      const q = await ok(assigned, `/rfqs/${id}/questions`, {
        question: 'Which synthetic trim is required?',
      });
      await ok(assigned, `/rfqs/${id}/review`, { version: (await detail()).rfq.version });
      assert.equal(
        (
          await command(assigned, `/rfqs/${id}/quotes`, {
            ...quoteInput(),
            version: (await detail()).rfq.version,
          })
        ).status,
        409,
      );
      await ok(buyer, `/rfqs/${id}/questions/${q.id}/answer`, {
        answer: 'Use the fictional blue trim.',
      });
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/questions/${q.id}/answer`, {
            answer: 'Silently replace the old answer.',
          })
        ).status,
        409,
      );
      await ok(assigned, `/rfqs/${id}/thread`, {
        body: 'Private operational note for operators only.',
        internal: true,
      });
      await ok(buyer, `/rfqs/${id}/thread`, {
        body: 'Buyer message <script>alert(1)</script> remains plain text.',
        internal: false,
      });
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/thread`, {
            body: 'Attempted private note.',
            internal: true,
          })
        ).status,
        403,
      );
      const thread = await get<ProcurementThread>(buyer, `/rfqs/${id}/thread`);
      assert.equal(thread.items.length, 1);
      assert.ok(!JSON.stringify(thread).includes('Private operational'));
      assert.equal((await get<ProcurementThread>(assigned, `/rfqs/${id}/thread`)).items.length, 2);
      assert.equal((await outsider.client.request(`${root}/rfqs/${id}/thread`)).status, 404);
      assert.ok(
        !JSON.stringify(await get(buyer, `/rfqs/${id}/activity`)).includes('internal_note'),
      );
    },
  );
  await check(
    'E02 revised specifications preserve quote history and invalidate old acceptance',
    async () => {
      const first = await ok(assigned, `/rfqs/${id}/quotes`, {
        ...quoteInput(),
        version: (await detail()).rfq.version,
      });
      const before = await detail();
      assert.equal(before.quotes[0].totalTnd, '100.001');
      await ok(buyer, `/rfqs/${id}/revisions`, {
        ...input,
        buyerOrganizationId: undefined,
        operatorOrganizationId: undefined,
        provenance: undefined,
        title: input.title,
        quantity: 8,
        version: before.rfq.version,
        reason: 'Buyer reduced the fictional quantity.',
      });
      let d = await detail();
      assert.equal(d.rfq.status, 'SUBMITTED');
      assert.equal(d.quotes[0].snapshot.quantity, 10);
      assert.equal(d.quotes[0].current, false);
      assert.equal(d.revisions[0].snapshot.quantity, 8);
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/accept`, {
            version: d.rfq.version,
            quoteId: first.id,
            confirm: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/revisions`, {
            ...input,
            buyerOrganizationId: undefined,
            operatorOrganizationId: undefined,
            provenance: undefined,
            version: before.rfq.version,
            reason: 'Stale overwrite.',
          })
        ).status,
        409,
      );
      await ok(assigned, `/rfqs/${id}/review`, { version: d.rfq.version });
      d = await detail();
      quoteId = (
        await ok(assigned, `/rfqs/${id}/quotes`, {
          ...quoteInput(),
          version: d.rfq.version,
          totalTnd: '88.888',
        })
      ).id;
    },
  );
  await check(
    'E02 sample decisions retain exact specification, signatory and renewed approval for each version',
    async () => {
      const sample = await ok(assigned, `/rfqs/${id}/samples`, {
        version: (await detail()).rfq.version,
        evidenceReference: 'SYNTHETIC-SAMPLE-EVIDENCE-V1',
        criteria: 'Fictional dimensions, weave and blue trim must match.',
      });
      await ok(buyer, `/rfqs/${id}/sample-decisions`, {
        version: (await detail()).rfq.version,
        sampleId: sample.id,
        decision: 'CHANGES_REQUESTED',
        comments: 'Use the corrected fictional trim.',
      });
      assert.equal((await detail()).currentSampleApproved, false);
      const second = await ok(assigned, `/rfqs/${id}/samples`, {
        version: (await detail()).rfq.version,
        evidenceReference: 'SYNTHETIC-SAMPLE-EVIDENCE-V2',
        criteria: 'Corrected trim and dimensions for eight pieces.',
      });
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/sample-decisions`, {
            version: (await detail()).rfq.version,
            sampleId: sample.id,
            decision: 'APPROVED',
            comments: 'Attempted superseded sample approval.',
          })
        ).status,
        409,
      );
      await ok(buyer, `/rfqs/${id}/sample-decisions`, {
        version: (await detail()).rfq.version,
        sampleId: second.id,
        decision: 'APPROVED',
        comments: 'The exact synthetic sample is approved.',
      });
      const d = await detail();
      assert.equal(d.currentSampleApproved, true);
      assert.equal(d.samples[0].decision?.actorId, buyer.me.user.id);
      assert.equal(d.samples[0].snapshot.quantity, 8);
      assert.equal(d.samples[1].decision?.decision, 'CHANGES_REQUESTED');
    },
  );
  await check(
    'E02 exact quote acceptance creates one order and immutable contract under concurrent replay',
    async () => {
      const d = await detail(),
        key: string = randomUUID(),
        input = { version: d.rfq.version, quoteId, confirm: true };
      const r = await Promise.all([
        command(buyer, `/rfqs/${id}/accept`, input, key),
        command(buyer, `/rfqs/${id}/accept`, input, key),
      ]);
      for (const x of r) assert.equal(x.status, 201, JSON.stringify(x));
      assert.deepEqual(r[0].body, r[1].body);
      orderId = (r[0].body as { id: string }).id;
      assert.equal(await db.commercialOrder.count({ where: { rfqId: id } }), 1);
      assert.equal(await db.procurementAcceptance.count({ where: { orderId } }), 1);
      assert.equal((await command(representative, `/rfqs/${id}/accept`, input)).status, 403);
      const {
        buyerOrganizationId: _b,
        operatorOrganizationId: _o,
        provenance: _p,
        ...edit
      } = inputFields();
      assert.equal(
        (
          await command(buyer, `/rfqs/${id}/revisions`, {
            ...edit,
            version: (await detail()).rfq.version,
            reason: 'Attempt to change accepted obligations.',
          })
        ).status,
        409,
      );
    },
  );
  function inputFields() {
    return { ...input };
  }
  await check(
    'E02 managed production is blocked by missing current sample sign-off after sample replacement',
    async () => {
      const latest = await ok(assigned, `/rfqs/${id}/samples`, {
        version: (await detail()).rfq.version,
        evidenceReference: 'SYNTHETIC-SAMPLE-EVIDENCE-V3',
        criteria: 'Renewed synthetic trim criteria.',
      });
      await db.commercialOrder.update({ where: { id: orderId }, data: { status: 'PLANNING' } });
      await db.commercialOffer.create({
        data: {
          orderId,
          capacityDeclarationId: fixture.capacityDeclarationId,
          artisanProfileId: fixture.artisanProfileId,
          quantity: 8,
          unitPayMillimes: 1000n,
          estimatedHours: 'Synthetic eight hours',
          expiresAt: new Date(fixture.offerExpiresAt),
          materials: 'Synthetic materials',
          reworkTerms: 'Synthetic reviewed rework terms',
          paymentConditions: 'Synthetic agreed compensation',
          status: 'ACCEPTED',
          decidedByUserId: artisan.me.user.id,
          acceptedAt: new Date(),
        },
      });
      async function release() {
        const me = await operator.client.request('/api/v1/me');
        return operator.client.request(
          `/api/v1/commerce/orders/${orderId}/actions`,
          'POST',
          { version: 1, next: 'IN_PRODUCTION' },
          {
            'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
            'Idempotency-Key': randomUUID(),
          },
        );
      }
      const blocked = await release();
      assert.equal(blocked.status, 409);
      assert.equal((blocked.body as { code: string }).code, 'SAMPLE_APPROVAL_REQUIRED');
      await ok(buyer, `/rfqs/${id}/sample-decisions`, {
        version: (await detail()).rfq.version,
        sampleId: latest.id,
        decision: 'APPROVED',
        comments: 'Approve the renewed synthetic sample.',
      });
      assert.equal((await release()).status, 201);
    },
  );
  await check(
    'E02 documents use immutable numbered accepted snapshots and independently authorize every download',
    async () => {
      const invoice = await ok(assigned, `/rfqs/${id}/documents`, { kind: 'INVOICE' });
      const docs = await detail();
      assert.ok(docs.documents.some((d) => d.kind === 'QUOTE' && d.superseded));
      assert.ok(docs.documents.some((d) => d.kind === 'CONTRACT'));
      const download = await get<{
        document: { totalTnd: string; quantity: number };
      }>(buyer, `/documents/${invoice.id}/download`);
      assert.equal(download.document.totalTnd, '88.888');
      assert.equal(download.document.quantity, 8);
      assert.equal(
        (await outsider.client.request(`${root}/documents/${invoice.id}/download`)).status,
        404,
      );
      assert.equal(
        (await command(assigned, `/rfqs/${id}/documents`, { kind: 'INVOICE' })).status,
        409,
      );
      assert.equal(
        (await command(assigned, `/rfqs/${id}/documents`, { kind: 'DELIVERY' })).status,
        409,
      );
      await db.commercialOrder.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', delivered: 8 },
      });
      const delivery = await ok(assigned, `/rfqs/${id}/documents`, { kind: 'DELIVERY' });
      assert.ok(
        (
          await get<{ document: { delivered: number } }>(
            buyer,
            `/documents/${delivery.id}/download`,
          )
        ).document.delivered === 8,
      );
      const list = await get<{ items: { kind: string }[] }>(buyer, '/documents');
      assert.ok(list.items.some((d) => d.kind === 'INVOICE'));
      assert.ok(!JSON.stringify(list).includes('ARTISAN_PAYOUT'));
      await assert.rejects(
        db.procurementDocument.update({
          where: { id: invoice.id },
          data: { content: { tampered: true } },
        }),
        /append-only/,
      );
      await assert.rejects(
        db.procurementQuote.update({ where: { id: quoteId }, data: { totalMillimes: 1n } }),
        /append-only/,
      );
    },
  );
  await check(
    'E02 approved-product reorder clones versioned specs and requires new confirmations, feasibility and approval',
    async () => {
      productId = (
        await ok(assigned, `/rfqs/${id}/products`, {
          version: (await detail()).rfq.version,
          productCode: 'SYNTHETIC-RUNNER',
          materials: 'Approved fictional cotton yarn.',
          leadTimeDays: 7,
          leadTimeSampleCount: 2,
          leadTimeContext: 'Two fictional local-demo samples; this is an estimate.',
        })
      ).id;
      const reorder = await ok(buyer, `/products/${productId}/reorder`, {
        quantity: 5,
        deliveryAt: fixture.deliveryAt,
        deliveryLocation: 'New synthetic collection point',
        confirm: true,
      });
      let d = await get<ProcurementDetail>(buyer, `/rfqs/${reorder.id}`);
      assert.equal(d.rfq.quantity, 5);
      assert.equal(d.rfq.sourceProductId, productId);
      assert.equal(d.rfq.status, 'DRAFT');
      assert.equal(d.rfq.specification, input.specification);
      assert.equal(d.orderId, null);
      assert.equal(d.quotes.length, 0);
      assert.equal(d.samples.length, 0);
      assert.equal(d.documents.length, 0);
      assert.equal(d.currentSampleApproved, false);
      await ok(buyer, `/rfqs/${reorder.id}/submit`, { version: d.rfq.version });
      d = await get<ProcurementDetail>(buyer, `/rfqs/${reorder.id}`);
      await ok(assigned, `/rfqs/${reorder.id}/review`, { version: d.rfq.version });
      await ok(assigned, `/products/${productId}/status`, {
        status: 'DISCONTINUED',
        reason: 'Synthetic material no longer available.',
      });
      d = await get<ProcurementDetail>(buyer, `/rfqs/${reorder.id}`);
      assert.equal(
        (
          await command(assigned, `/rfqs/${reorder.id}/quotes`, {
            ...quoteInput(),
            version: d.rfq.version,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await command(buyer, `/products/${productId}/reorder`, {
            quantity: 4,
            deliveryAt: fixture.deliveryAt,
            deliveryLocation: 'Synthetic destination',
            confirm: true,
          })
        ).status,
        409,
      );
      assert.equal((await detail()).rfq.status, 'ACCEPTED');
      assert.equal(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).delivered,
        8,
      );
    },
  );
  await check(
    'E02 assigned coordinators can discuss their participant orders without seeing prices or internal notes',
    async () => {
      const association = await db.organization.create({
        data: {
          name: 'Synthetic procurement partner',
          slug: 'synthetic-procurement-partner',
          type: 'ASSOCIATION',
          approvalStatus: 'APPROVED',
          region: 'Tunis',
          description: 'Synthetic coordinator discussion fixture',
          contactEmail: 'synthetic-partner@example.com',
          representativeName: 'Synthetic coordinator',
          createdByUserId: operator.me.user.id,
        },
      });
      for (const who of [coordinator, otherCoordinator])
        await db.organizationMember.create({
          data: {
            userId: who.me.user.id,
            organizationId: association.id,
            roles: {
              create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: operator.me.user.id },
            },
          },
        });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: fixture.artisanProfileId,
          organizationId: association.id,
          recordedById: operator.me.user.id,
          reason: 'Synthetic managing relationship',
        },
      });
      const assignment = await db.artisanAssignment.create({
        data: {
          artisanProfileId: fixture.artisanProfileId,
          coordinatorId: coordinator.me.user.id,
          organizationId: association.id,
          assignedById: operator.me.user.id,
          reason: 'Synthetic assigned discussion participant',
        },
      });
      const policy = await db.authorizationPolicy.create({
        data: {
          version: 'PROCUREMENT-SYNTHETIC-TEST',
          methods: ['DOCUMENTED_VERBAL'],
          reviewReference: 'SYNTHETIC-NOT-LEGAL-REVIEW',
          reviewedById: operator.me.user.id,
        },
      });
      await db.onboardingAuthorization.create({
        data: {
          artisanProfileId: fixture.artisanProfileId,
          policyId: policy.id,
          purpose: 'PARTICIPATION',
          method: 'DOCUMENTED_VERBAL',
          occurredAt: new Date(),
          language: 'Arabic',
          recordedById: coordinator.me.user.id,
          witnessReference: 'Synthetic independent witness',
          evidenceReference: 'Synthetic authorization evidence',
        },
      });
      const discussions = await get<{ items: { id: string }[] }>(coordinator, '/discussions');
      assert.ok(discussions.items.some((r) => r.id === id));
      const thread = await get<ProcurementThread>(coordinator, `/rfqs/${id}/thread`);
      assert.equal(thread.canPostInternal, false);
      assert.ok(thread.items.every((m) => !m.internal));
      assert.equal((await coordinator.client.request(`${root}/rfqs/${id}`)).status, 404);
      assert.equal(
        (await otherCoordinator.client.request(`${root}/rfqs/${id}/thread`)).status,
        404,
      );
      await ok(coordinator, `/rfqs/${id}/thread`, {
        body: 'Assigned coordinator confirms the fictional handover discussion.',
        internal: false,
      });
      assert.equal(
        (
          await command(coordinator, `/rfqs/${id}/thread`, {
            body: 'Attempted internal note.',
            internal: true,
          })
        ).status,
        403,
      );
      await db.artisanAssignment.update({
        where: { id: assignment.id },
        data: { endedAt: new Date() },
      });
      assert.equal((await coordinator.client.request(`${root}/rfqs/${id}/thread`)).status, 404);
    },
  );
  await check(
    'E02 membership and account-assignment revocation apply immediately to history, images and documents',
    async () => {
      await db.organization.update({
        where: { id: fixture.buyerOrganizationId },
        data: { approvalStatus: 'SUSPENDED' },
      });
      assert.equal((await assigned.client.request(`${root}/rfqs/${id}`)).status, 404);
      assert.equal(
        (await get<ProcurementList>(operator, '/rfqs')).requests.some((r) => r.id === id),
        false,
      );
      await db.organization.update({
        where: { id: fixture.buyerOrganizationId },
        data: { approvalStatus: 'APPROVED' },
      });
      await db.operatorAssignment.updateMany({
        where: { operatorId: assigned.me.user.id },
        data: { revokedAt: new Date() },
      });
      assert.equal((await assigned.client.request(`${root}/rfqs/${id}`)).status, 404);
      const member = await db.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: fixture.buyerOrganizationId,
            userId: buyer.me.user.id,
          },
        },
      });
      await db.organizationMember.update({
        where: { id: member.id },
        data: { status: 'SUSPENDED' },
      });
      assert.equal((await buyer.client.request(`${root}/rfqs/${id}/activity`)).status, 404);
      assert.equal(
        (await buyer.client.request(`${root}/rfqs/${id}/attachments/${fileId}/token`)).status,
        404,
      );
      assert.equal((await get<{ items: unknown[] }>(buyer, '/documents')).items.length, 0);
    },
  );
}
