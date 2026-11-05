import { createHash } from 'node:crypto';
import type { Db } from '../foundation/transaction.js';
import type { CommercialRfq, ProcurementQuote } from '@prisma/client';
const canonical = (value: unknown): string => {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
};
export const evidenceHash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export async function quoteReviewSnapshot(tx: Db, rfq: CommercialRfq, quote: ProcurementQuote) {
  const [cost, latestCost, latestFeasibility] = await Promise.all([
    quote.costEstimateId
      ? tx.costEstimate.findUnique({ where: { id: quote.costEstimateId } })
      : null,
    tx.costEstimate.findFirst({ where: { rfqId: rfq.id }, orderBy: { version: 'desc' } }),
    tx.feasibilityAssessment.findFirst({ where: { rfqId: rfq.id }, orderBy: { version: 'desc' } }),
  ]);
  return evidenceHash({
    rfq: {
      id: rfq.id,
      version: rfq.version,
      quantity: rfq.quantity,
      deliveryAt: rfq.deliveryAt,
      deliveryLocation: rfq.deliveryLocation,
      specification: rfq.specification,
      designRequirements: rfq.designRequirements,
    },
    quote: {
      id: quote.id,
      rfqId: quote.rfqId,
      version: quote.version,
      revisionId: quote.revisionId,
      totalMillimes: quote.totalMillimes,
      expiresAt: quote.expiresAt,
      snapshot: quote.snapshot,
      feasibilityAssessmentId: quote.feasibilityAssessmentId,
      costEstimateId: quote.costEstimateId,
      termsSha256: quote.termsSha256,
      status: quote.status,
    },
    cost,
    latestCostId: latestCost?.id ?? null,
    latestFeasibility,
  });
}
export async function latestFinanceReview(tx: Db, rfqId: string) {
  const rows = await tx.financeRecordEvent.findMany({
    where: { targetId: rfqId, targetType: 'RfqFinanceReview' },
  });
  return (
    rows.sort(
      (a, b) =>
        Number((b.data as Record<string, unknown> | null)?.reviewVersion ?? 0) -
          Number((a.data as Record<string, unknown> | null)?.reviewVersion ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )[0] ?? null
  );
}
