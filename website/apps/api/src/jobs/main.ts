import 'reflect-metadata';
import { PrismaService } from '../database/prisma.service.js';
import { loadConfig } from '../config/env.js';
import { dispatchBatch, outboxStatus } from './outbox.js';
import { dispatchNotifications } from './notifications.js';
import { rebuildAnalyticsBatch } from './commerce-consumer.js';
import { logger } from '../common/logging.js';
const args = process.argv.slice(2);
const mode = args[0] ?? '--once';
if (
  !['--once', '--watch', '--status', '--retry-failed', '--rebuild-analytics'].includes(mode) ||
  (mode === '--retry-failed' ? args.length !== 2 : args.length > 1)
)
  throw new Error('Use --once, --watch, --status or --retry-failed EVENT_ID, --rebuild-analytics.');
const config = loadConfig();
const db = new PrismaService(config);
let stopping = false;
process.once('SIGTERM', () => {
  stopping = true;
});
process.once('SIGINT', () => {
  stopping = true;
});
try {
  await db.$connect();
  if (mode === '--rebuild-analytics') {
    let cursor: string | undefined;
    let batch: Awaited<ReturnType<typeof rebuildAnalyticsBatch>>;
    do {
      const started = performance.now();
      batch = await rebuildAnalyticsBatch(db, cursor);
      cursor = batch.cursor;
      logger.info(
        { count: batch.count, durationMs: Math.round(performance.now() - started) },
        'Commerce analytics batch rebuilt',
      );
    } while (batch.count && !stopping);
  } else if (mode === '--status') console.log(JSON.stringify(await outboxStatus(db)));
  else if (mode === '--retry-failed') {
    const result = await db.outboxEvent.updateMany({
      where: { id: args[1], status: 'FAILED' },
      data: { status: 'RETRY', attempts: 0, availableAt: new Date(), lastErrorCode: null },
    });
    logger.info({ count: result.count }, 'Failed outbox event requeued by operator');
  } else {
    do {
      await dispatchBatch(db);
      await dispatchNotifications(db, config);
      if (mode === '--watch' && !stopping)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (mode === '--watch' && !stopping);
  }
} finally {
  await db.$disconnect();
}
