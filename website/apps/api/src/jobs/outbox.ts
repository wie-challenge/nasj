import type { Prisma, OutboxEvent } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service.js';
import { consumeLocalEvent } from './commerce-consumer.js';
import { logger } from '../common/logging.js';

export const MAX_ATTEMPTS = 5;
export type LocalConsumer = (tx: Prisma.TransactionClient, event: OutboxEvent) => Promise<void>;
export const recordReceipt: LocalConsumer = async (tx, event) => {
  if (event.version !== 1) throw new Error('Unsupported event version.');
  await tx.eventReceipt.upsert({
    where: { eventId: event.id },
    create: { eventId: event.id },
    update: {},
  });
};
// Only database-local consumers may run here. No external side effects within a transaction.
// Row locks are the in-flight state; a terminated process rolls back and releases its claim.
export async function dispatchBatch(
  db: PrismaService,
  limit = 50,
  consume: LocalConsumer = consumeLocalEvent,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError('Batch limit must be 1..100.');
  let processed = 0;
  for (; processed < limit; processed++) {
    const found = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
        const [event] = await tx.$queryRaw<OutboxEvent[]>`
        SELECT * FROM "OutboxEvent" WHERE "status" IN ('PENDING', 'RETRY')
        AND "availableAt" <= CURRENT_TIMESTAMP
        ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!event) return false;
        const startedAt = performance.now();
        await tx.$executeRawUnsafe('SAVEPOINT local_consumer');
        let failed = false;
        try {
          await consume(tx, event);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT local_consumer');
        } catch {
          failed = true;
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT local_consumer');
        }
        const attempts = event.attempts + 1;
        const durationMs = Math.round(performance.now() - startedAt);
        const status = failed ? (attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY') : 'DELIVERED';
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts,
            status,
            durationMs,
            availableAt: failed
              ? new Date(Date.now() + Math.min(3600, 2 ** attempts) * 1000)
              : event.availableAt,
            deliveredAt: failed ? null : new Date(),
            lastErrorCode: failed ? 'LOCAL_CONSUMER_FAILED' : null,
          },
        });
        return {
          eventId: event.id,
          correlationId: event.correlationId,
          status,
          attempts,
          durationMs,
        };
      },
      { timeout: 15000 },
    );
    if (!found) break;
    // Emit success/failure only after the delivery transaction has committed.
    logger[found.status === 'DELIVERED' ? 'info' : 'warn'](found, 'Outbox delivery');
  }
  return processed;
}
export async function outboxStatus(db: PrismaService) {
  const [counts, oldest, failed] = await Promise.all([
    db.outboxEvent.groupBy({ by: ['status'], _count: true }),
    db.outboxEvent.findFirst({
      where: { status: { in: ['PENDING', 'RETRY'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.outboxEvent.findMany({
      where: { status: 'FAILED' },
      take: 20,
      orderBy: { createdAt: 'asc' },
      select: { id: true, attempts: true, lastErrorCode: true },
    }),
  ]);
  return {
    counts,
    oldestPendingAgeMs: oldest ? Date.now() - oldest.createdAt.getTime() : 0,
    failed,
  };
}
