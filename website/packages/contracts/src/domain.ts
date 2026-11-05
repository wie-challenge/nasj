// Pure rules for implemented foundation workflows. No infrastructure dependencies.
export type ApprovalState = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export function canEditOrganization(state: ApprovalState): boolean {
  return state === 'DRAFT' || state === 'REJECTED';
}
export function canReviewOrganization(
  state: ApprovalState,
  decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
): boolean {
  return decision === 'SUSPENDED'
    ? state === 'APPROVED'
    : state === 'PENDING_REVIEW' || state === 'SUSPENDED';
}
export type Period = { effectiveFrom: Date; effectiveTo: Date };
export function isCapacityRevision(period: Period, overlaps: readonly Period[]): boolean {
  const start = period.effectiveFrom.getTime(),
    end = period.effectiveTo.getTime();
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start < end &&
    overlaps.every(
      (row) => row.effectiveFrom.getTime() === start && row.effectiveTo.getTime() === end,
    )
  );
}
// Decimal(12,2) persistence, application limit 100000; zero means no declared availability.
export function exactCapacityQuantity(quantity: number): string {
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 100000 ||
    !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(quantity))
  )
    throw new RangeError('Invalid capacity quantity.');
  return quantity.toFixed(2);
}
// Nonnegative TND only. Strings at API boundaries, bigint millimes internally.
export const MAX_TND_MILLIMES = 9223372036854775807n;
function bounded(value: bigint): bigint {
  if (value < 0n || value > MAX_TND_MILLIMES) throw new RangeError('TND amount is out of range.');
  return value;
}
export function parseTnd(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})(\.\d{1,3})?$/.test(value))
    throw new RangeError('Use exact TND with at most three decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return bounded(BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')));
}
export function formatTnd(millimes: bigint): string {
  bounded(millimes);
  return `${millimes / 1000n}.${String(millimes % 1000n).padStart(3, '0')}`;
}
export function addTnd(left: bigint, right: bigint): bigint {
  return bounded(bounded(left) + bounded(right));
}
// Explicit HALF_UP rounding, once, at the millime boundary (e.g. a rational rate).
export function prorateTnd(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  bounded(amount);
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Invalid nonnegative ratio.');
  const scaled = amount * numerator;
  return bounded(scaled / denominator + (2n * (scaled % denominator) >= denominator ? 1n : 0n));
}
