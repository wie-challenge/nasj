import 'reflect-metadata';
import { PrismaService } from '../database/prisma.service.js';
import { loadConfig } from '../config/env.js';
import { outboxStatus } from '../jobs/outbox.js';
import { backupStatus } from '../operations/backup.js';
import { operationalAlerts } from '../jobs/alerts.js';
const config = loadConfig();
const db = new PrismaService(config);
try {
  const response = await fetch(`http://127.0.0.1:${config.API_PORT}/api/health/ready`, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  const status = await outboxStatus(db);
  const failedCount = status.counts.find((row) => row.status === 'FAILED')?._count ?? 0;
  let backup: Awaited<ReturnType<typeof backupStatus>> | undefined;
  let backupUnavailable = false;
  if (process.env.BACKUP_DIRECTORY) {
    try {
      backup = await backupStatus(process.env.BACKUP_DIRECTORY);
    } catch {
      backupUnavailable = true;
    }
  }
  const notificationFailures = await db.notificationDelivery.count({
    where: { status: { in: ['FAILED', 'UNCERTAIN'] } },
  });
  const notificationAgeReview = await db.notificationDelivery.count({
    where: { status: 'SENDING', createdAt: { lt: new Date(Date.now() - 300000) } },
  });
  const alerts = operationalAlerts({
    notificationFailures,
    notificationAgeReview,
    ready: response?.ok ?? false,
    oldestPendingAgeMs: status.oldestPendingAgeMs,
    failedCount,
    backupAgeMs: backup?.ageMs,
  });
  if (backupUnavailable) alerts.push('BACKUP_UNAVAILABLE');
  console.log(
    JSON.stringify({ alerts, backup, failedCount, oldestPendingAgeMs: status.oldestPendingAgeMs }),
  );
  process.exitCode = alerts.length ? 1 : 0;
} catch {
  console.log(JSON.stringify({ alerts: ['DATABASE_UNAVAILABLE'] }));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
