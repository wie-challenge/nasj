import 'reflect-metadata';
import { PrismaService } from '../src/database/prisma.service.js';
import { loadConfig } from '../src/config/env.js';
import { dispatchBatch } from '../src/jobs/outbox.js';
import { consumeLocalEvent } from '../src/jobs/commerce-consumer.js';
const db = new PrismaService(loadConfig());
try {
  await dispatchBatch(db, 1, async (tx, event) => {
    await consumeLocalEvent(tx, event);
    process.stdout.write('CONSUMER_EFFECTS_UNCOMMITTED\n');
    await new Promise<void>(() => {
      /* Parent deliberately kills this test process. */
    });
  });
} finally {
  await db.$disconnect();
}
