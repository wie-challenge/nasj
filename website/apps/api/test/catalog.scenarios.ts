import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BuyerCatalog } from '@nasj/contracts';
import type { PrismaService } from '../src/database/prisma.service.js';
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
export async function runCatalogScenarios({
  db,
  register,
  check,
}: {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
}) {
  const [buyer, operator, artisan, quality, outsider] = await Promise.all(
    ['buyer', 'operator', 'artisan', 'quality', 'outsider'].map((role) =>
      register(`catalog-${role}@example.com`, `Synthetic catalog ${role}`),
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
    'catalog',
  );
  const input = {
    buyerOrganizationId: fixture.buyerOrganizationId,
    operatorOrganizationId: fixture.operatorOrganizationId,
    catalogExampleId: 'woven-table-runner-v1',
    craftSkillId: 'weaving',
    title: 'Synthetic catalog request',
    specification: 'Buyer-confirmed fictional cotton runner, revised dimensions 130 × 30 cm.',
    designRequirements: 'Buyer will agree colors before quoting.',
    quantity: 10,
    deliveryAt: fixture.deliveryAt,
    deliveryLocation: 'Synthetic Tunis collection point',
    provenance: 'SYNTHETIC',
  };
  async function create(who: Identity, body: unknown, key = randomUUID()) {
    const me = await who.client.request('/api/v1/me');
    return who.client.request('/api/v1/commerce/rfqs', 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function catalog() {
    const result = await buyer.client.request('/api/v1/commerce/catalog');
    assert.equal(result.status, 200);
    return result.body as BuyerCatalog;
  }
  await check(
    'buyer-safe catalog exposes bounded synthetic examples, assumptions and empty categories',
    async () => {
      const result = await catalog();
      assert.equal(result.version, 1);
      assert.equal(result.provenance, 'SYNTHETIC');
      assert.ok(result.categories.length <= 100);
      assert.deepEqual(result.categories.find((c) => c.id === 'other')?.examples, []);
      for (const example of result.categories.flatMap((c) => c.examples)) {
        assert.equal(example.provenance, 'SYNTHETIC');
        assert.equal(example.unit, 'PIECE');
        assert.ok(example.specification.length > 10);
        assert.ok(example.leadTime.minDays <= example.leadTime.maxDays);
        assert.match(example.leadTime.assumption, /no stock or supply is confirmed/);
        assert.ok(
          !('price' in example) && !('capacity' in example) && !('artisanProfileId' in example),
        );
      }
      assert.equal(
        result.categories.find((c) => c.id === 'pottery')?.examples[0].availability,
        'UNAVAILABLE',
      );
      assert.equal(
        (await outsider.client.request('/api/v1/commerce/catalog')).status,
        200,
        'Catalog contains shared examples, not private procurement data.',
      );
    },
  );
  await check(
    'catalog RFQ selection rejects forged and unavailable examples atomically; valid prefill stays replay-safe',
    async () => {
      const before = await db.commercialRfq.count();
      const events = await db.outboxEvent.count();
      for (const body of [
        { ...input, catalogExampleId: 'forged-example' },
        { ...input, catalogExampleId: 'decorative-vase-v1', craftSkillId: 'pottery' },
        { ...input, craftSkillId: 'embroidery' },
        { ...input, catalogExampleId: 'https://evil.invalid/example' },
        { ...input, quantity: 0 },
        { ...input, deliveryAt: '2020-01-01T00:00:00Z' },
      ])
        assert.equal((await create(buyer, body)).status, 400);
      assert.equal((await create(outsider, input)).status, 403);
      assert.equal(await db.commercialRfq.count(), before);
      assert.equal(await db.outboxEvent.count(), events);
      const key = randomUUID();
      const first = await create(buyer, input, key);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.deepEqual((await create(buyer, input, key)).body, first.body);
      assert.equal(
        (await create(buyer, { ...input, specification: 'Different confirmed specification' }, key))
          .status,
        409,
      );
      assert.equal(await db.commercialRfq.count(), before + 1);
      const saved = await db.commercialRfq.findUniqueOrThrow({
        where: { id: (first.body as { id: string }).id },
      });
      assert.equal(saved.status, 'DRAFT');
      assert.equal(
        saved.specification,
        input.specification,
        'Catalog suggestions remain buyer-editable requirements.',
      );
      assert.equal(saved.quantity, 10);
      assert.equal(
        await db.commercialOrder.count({ where: { rfqId: saved.id } }),
        0,
        'Selecting an example is not an order, reservation or supply commitment.',
      );
    },
  );
  await check(
    'inactive crafts invalidate catalog links and API selection; no active crafts yields a safe empty catalog',
    async () => {
      const active = await db.craftSkill.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      try {
        await db.craftSkill.update({ where: { id: 'weaving' }, data: { isActive: false } });
        assert.equal(
          (await catalog()).categories.some((c) => c.id === 'weaving'),
          false,
        );
        assert.equal((await create(buyer, input)).status, 400);
        await db.craftSkill.updateMany({
          where: { id: { in: active.map((c) => c.id) } },
          data: { isActive: false },
        });
        assert.deepEqual((await catalog()).categories, []);
      } finally {
        await db.craftSkill.updateMany({
          where: { id: { in: active.map((c) => c.id) } },
          data: { isActive: true },
        });
      }
    },
  );
}
