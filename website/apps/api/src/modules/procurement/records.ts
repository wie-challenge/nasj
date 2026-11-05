import type { CommercialRfq } from '@prisma/client';
import type { Actor } from '../../common/identity.js';
import type { Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';
export function specificationSnapshot(row: CommercialRfq) {
  return {
    title: row.title,
    specification: row.specification,
    designRequirements: row.designRequirements,
    craftSkillId: row.craftSkillId,
    quantity: row.quantity,
    deliveryAt: row.deliveryAt.toISOString(),
    deliveryLocation: row.deliveryLocation,
    provenance: 'SYNTHETIC',
  };
}
export async function revision(tx: Db, actor: Actor, row: CommercialRfq, reason: string) {
  const prior = await tx.procurementRevision.findFirst({
    where: { rfqId: row.id },
    orderBy: { version: 'desc' },
  });
  if (prior?.version === row.version) return prior;
  const attachments = await tx.procurementAttachment.findMany({
    where: { rfqId: row.id, removedAt: null },
    select: { id: true, sha256: true },
  });
  return tx.procurementRevision.create({
    data: {
      rfqId: row.id,
      authorId: actor.id,
      version: row.version,
      reason,
      predecessorId: prior?.id,
      snapshot: {
        ...specificationSnapshot(row),
        attachments,
        clarifications: await tx.procurementQuestion.findMany({
          where: { rfqId: row.id, answeredAt: { not: null } },
          select: { id: true, question: true, answer: true },
        }),
      },
    },
  });
}
export async function activity(tx: Db, actor: Actor, row: CommercialRfq, code: string) {
  const buyer = await tx.organizationMember.findFirst({
    where: { userId: actor.id, organizationId: row.buyerOrganizationId, status: 'ACTIVE' },
  });
  await tx.procurementActivity.create({
    data: {
      rfqId: row.id,
      actorId: actor.id,
      actorLabel: buyer
        ? 'Buyer representative'
        : (await tx.organizationMember.findFirst({
              where: { userId: actor.id, status: 'ACTIVE', isCoordinator: true },
            }))
          ? 'Assigned coordinator'
          : 'NASJ operator',
      code,
      version: row.version,
    },
  });
}
export async function procurementAudit(
  tx: Db,
  actor: Actor,
  row: CommercialRfq,
  code: string,
  targetId = row.id,
  reason?: string,
) {
  await audit(tx, actor, {
    action: `procurement.${code}`,
    targetType: targetId === row.id ? 'CommercialRfq' : 'ProcurementRecord',
    targetId,
    organizationId: row.buyerOrganizationId,
    reason,
    after: { provenance: 'SYNTHETIC' },
  });
  await activity(tx, actor, row, code);
}
