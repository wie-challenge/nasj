/**
 * Client-only signal. The buyer feedback panel sits beside the logistics panel on the same tab, so a
 * confirmed receipt must make its eligibility read refresh without a manual page reload.
 */
export const logisticsUpdatedEvent = 'nasj:logistics-updated';

export function announceLogisticsUpdate() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(logisticsUpdatedEvent));
}
