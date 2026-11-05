import type { Prisma, OutboxEvent } from '@prisma/client';
import { deriveCommerceMetrics } from '@nasj/contracts';
import type { LocalConsumer } from './outbox.js';

const sourceInclude = { rfq: true, offers: true, batches: true, payments: true } as const;
export async function rebuildOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: sourceInclude,
  });
  const milestones = await tx.auditEvent.findMany({
    where: {
      targetType: 'CommercialOrder',
      targetId: orderId,
      action: { in: ['commerce.order.in_transit', 'commerce.order.buyer_accepted'] },
    },
    select: { action: true },
  });
  const metrics = deriveCommerceMetrics({
    ...order,
    milestones: {
      shipped: milestones.some((m) => m.action === 'commerce.order.in_transit'),
      accepted: milestones.some((m) => m.action === 'commerce.order.buyer_accepted'),
    },
  });
  await tx.commerceProjection.upsert({
    where: { orderId },
    create: { orderId, metrics, definitionVersion: 1 },
    update: { metrics, asOf: new Date(), definitionVersion: 1 },
  });
}
async function resolve(tx: Prisma.TransactionClient, event: OutboxEvent) {
  let rfqId: string | undefined;
  let orderId: string | undefined;
  let artisanId: string | undefined;
  let buyerVisible = false;
  switch (event.targetType) {
    case 'CommercialRfq':
      rfqId = event.targetId;
      buyerVisible = true;
      break;
    case 'CommercialOrder':
      orderId = event.targetId;
      buyerVisible = true;
      break;
    case 'CommercialOffer': {
      const row = await tx.commercialOffer.findUniqueOrThrow({
        where: { id: event.targetId },
        include: { artisanProfile: true },
      });
      orderId = row.orderId;
      artisanId = row.artisanProfile.userId ?? undefined;
      break;
    }
    case 'CommercialBatch': {
      const row = await tx.commercialBatch.findUniqueOrThrow({
        where: { id: event.targetId },
        include: { artisanProfile: true },
      });
      orderId = row.orderId;
      artisanId = row.artisanProfile.userId ?? undefined;
      break;
    }
    case 'SyntheticPayment': {
      const row = await tx.syntheticPayment.findUniqueOrThrow({
        where: { id: event.targetId },
        include: { batch: { include: { artisanProfile: true } } },
      });
      orderId = row.orderId;
      artisanId = row.batch?.artisanProfile.userId ?? undefined;
      buyerVisible = row.kind === 'BUYER_RECEIPT';
      break;
    }
    default:
      throw Error('Unsupported commerce target.');
  }
  const order = orderId
    ? await tx.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })
    : undefined;
  const rfq = await tx.commercialRfq.findUniqueOrThrow({
    where: { id: rfqId ?? order!.rfqId },
    include: { order: true },
  });
  if (rfq.provenance !== 'SYNTHETIC' || rfq.buyerOrganizationId !== event.organizationId)
    throw Error('Invalid commerce source.');
  return { rfq, orderId: orderId ?? rfq.order?.id, artisanId, buyerVisible };
}
/** One justified queue: the existing durable outbox also runs the read-only-ledger ETL.
 * Projection, inbox effects and receipt commit together; retry rolls them all back. */
export const consumeLocalEvent: LocalConsumer = async (tx, event) => {
  if (event.version !== 1) throw Error('Unsupported event version.');
  if (await tx.eventReceipt.findUnique({ where: { eventId: event.id } })) return;
  if (event.eventType.startsWith('commerce.')) {
    const { rfq, orderId, artisanId, buyerVisible } = await resolve(tx, event);
    if (orderId) await rebuildOrder(tx, orderId);
    const scopes = [
      ...(buyerVisible ? [{ audience: 'BUYER', scopeId: rfq.buyerOrganizationId }] : []),
      ...(rfq.status !== 'DRAFT'
        ? [{ audience: 'OPERATOR', scopeId: rfq.operatorOrganizationId }]
        : []),
      ...(artisanId ? [{ audience: 'ARTISAN', scopeId: artisanId }] : []),
    ];
    for (const scope of scopes)
      await tx.commerceNotice.upsert({
        where: { eventId_audience_scopeId: { eventId: event.id, ...scope } },
        create: { eventId: event.id, ...scope, code: event.eventType },
        update: {},
      });
  }
  await tx.eventReceipt.create({ data: { eventId: event.id } });
};

/** Trusted operator CLI backfill. The cursor and batch cap bound every transaction.
 * No notifications are regenerated and no commercial source table is written. */
export async function rebuildAnalyticsBatch(
  db: import('../database/prisma.service.js').PrismaService,
  after?: string,
  limit = 50,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw RangeError('Batch limit must be 1..100.');
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
      const rows = await tx.commercialOrder.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: 'asc' },
        take: limit,
        select: { id: true },
      });
      for (const row of rows) await rebuildOrder(tx, row.id);
      return { count: rows.length, cursor: rows.at(-1)?.id };
    },
    { timeout: 15000 },
  );
}
