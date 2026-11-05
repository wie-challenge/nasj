import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Actor } from '../../common/identity.js';
import type { Db } from './transaction.js';
type SafeSnapshot = Record<string, string | number | boolean | null | string[]>;
export async function audit(
  db: Db,
  actor: Actor,
  event: {
    action: string;
    targetType: string;
    targetId: string;
    organizationId?: string;
    reason?: string;
    before?: SafeSnapshot;
    after?: SafeSnapshot;
  },
) {
  const record = await db.auditEvent.create({
    data: {
      actorId: actor.id,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      organizationId: event.organizationId,
      reason: event.reason,
      correlationId: actor.requestId ?? randomUUID(),
      before: event.before as Prisma.InputJsonValue | undefined,
      after: event.after as Prisma.InputJsonValue | undefined,
    },
  });
  await db.outboxEvent.create({
    data: {
      id: randomUUID(),
      auditEventId: record.id,
      eventType: record.action,
      version: 1,
      actorId: record.actorId,
      organizationId: record.organizationId,
      targetType: record.targetType,
      targetId: record.targetId,
      correlationId: record.correlationId,
    },
  });
}
