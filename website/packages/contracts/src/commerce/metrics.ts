/** Versioned cumulative per-order metrics. Reporting window is order creation..asOf, UTC.
 * Integer quantities and decimal millime strings; ratios carry their denominator.
 * No actual cost/time or verified-bank sources exist: unavailable fields stay null. */
export const COMMERCE_METRICS_VERSION = 1;
export interface MetricSource {
  provenance: string;
  status: string;
  delivered: number;
  milestones?: { shipped: boolean; accepted: boolean };
  rfq: { quantity: number; provenance: string };
  batches: {
    provenance: string;
    produced: number;
    approved: number;
    submitted: number;
    offerId: string;
  }[];
  offers: { id: string; provenance: string; unitPayMillimes: bigint }[];
  payments: {
    provenance: string;
    kind: string;
    status: string;
    amountMillimes: bigint;
    evidenceType: string | null;
  }[];
}
export function deriveCommerceMetrics(source: MetricSource) {
  if (
    [source, source.rfq, ...source.batches, ...source.offers, ...source.payments].some(
      (r) => r.provenance !== 'SYNTHETIC',
    )
  )
    throw Error('Only synthetic commerce sources are supported.');
  const sum = (field: 'produced' | 'approved' | 'submitted') =>
    source.batches.reduce((n, b) => n + b[field], 0);
  const ratio = (numerator: number) => ({
    numerator,
    denominator: source.rfq.quantity,
    ratio: source.rfq.quantity === 0 ? null : numerator / source.rfq.quantity,
  });
  const approved = sum('approved');
  const shipped =
    source.milestones?.shipped ||
    ['IN_TRANSIT', 'DELIVERED', 'BUYER_ACCEPTED', 'SETTLED', 'CLOSED'].includes(source.status)
      ? approved
      : 0;
  const accepted =
    source.milestones?.accepted || ['BUYER_ACCEPTED', 'SETTLED', 'CLOSED'].includes(source.status)
      ? source.delivered
      : 0;
  const settled = (kind: string) =>
    source.payments
      .filter((p) => p.kind === kind && p.status === 'SETTLED')
      .reduce((n, p) => {
        if (p.evidenceType !== 'SIMULATED_SETTLEMENT')
          throw Error('Invalid settlement classification.');
        return n + p.amountMillimes;
      }, 0n);
  const earned = source.batches.reduce((n, b) => {
    const offer = source.offers.find((o) => o.id === b.offerId);
    if (!offer) throw Error('Missing authoritative offer.');
    return n + BigInt(b.approved) * offer.unitPayMillimes;
  }, 0n);
  const payout = settled('ARTISAN_PAYOUT');
  if (payout > earned) throw Error('Unreconciled payout.');
  return {
    definitionVersion: COMMERCE_METRICS_VERSION,
    provenance: 'SYNTHETIC',
    evidenceClass: 'SIMULATED',
    timezone: 'UTC',
    period: 'ORDER_LIFETIME_TO_AS_OF',
    fulfillment: {
      produced: ratio(sum('produced')),
      submitted: ratio(sum('submitted')),
      approved: ratio(approved),
      shipped: ratio(shipped),
      received: ratio(source.delivered),
      accepted: ratio(accepted),
    },
    finance: {
      currency: 'TND',
      unit: 'MILLIME',
      buyerReceived: settled('BUYER_RECEIPT').toString(),
      artisanEarned: earned.toString(),
      artisanPaid: payout.toString(),
      artisanOutstanding: (earned - payout).toString(),
      scheduledBuyerReceipt: source.payments
        .filter(
          (p) =>
            p.kind === 'BUYER_RECEIPT' && ['SCHEDULED', 'APPROVED', 'INITIATED'].includes(p.status),
        )
        .reduce((n, p) => n + p.amountMillimes, 0n)
        .toString(),
      scheduledArtisanPayout: source.payments
        .filter(
          (p) =>
            p.kind === 'ARTISAN_PAYOUT' &&
            ['SCHEDULED', 'APPROVED', 'INITIATED'].includes(p.status),
        )
        .reduce((n, p) => n + p.amountMillimes, 0n)
        .toString(),
      verifiedSettlement: null,
      actualCost: null,
      actualHours: null,
      coverage: {
        verifiedSettlement: 'UNAVAILABLE',
        actualCost: 'UNAVAILABLE',
        actualHours: 'UNAVAILABLE',
      },
    },
  };
}
export type CommerceMetrics = ReturnType<typeof deriveCommerceMetrics>;
