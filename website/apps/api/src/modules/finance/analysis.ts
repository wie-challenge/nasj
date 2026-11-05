import { formatTnd } from '@nasj/contracts';
export const signedTnd = (amount: bigint) =>
  (amount < 0n ? '-' : '') + formatTnd(amount < 0n ? -amount : amount);
export type CashEvent = {
  id: string;
  date: string | null;
  direction: 'IN' | 'OUT';
  amount: bigint;
  evidence: 'PROJECTED' | 'VERIFIED';
};
/** Half-open periods, integer millimes, same-day receipts conservatively follow outflows. */
export function cashGap(events: CashEvent[]) {
  const known = events
    .filter((e) => e.date !== null)
    .sort(
      (a, b) =>
        new Date(a.date!).getTime() - new Date(b.date!).getTime() ||
        (a.direction === b.direction ? a.id.localeCompare(b.id) : a.direction === 'OUT' ? -1 : 1),
    );
  let balance = 0n,
    min = 0n;
  const timeline = known.map((e) => {
    balance += e.direction === 'IN' ? e.amount : -e.amount;
    if (balance < min) min = balance;
    return {
      ...e,
      amount: undefined,
      amountTnd: formatTnd(e.amount),
      balanceTnd: signedTnd(balance),
    };
  });
  return {
    minimumModeledGapTnd: !events.length || events.some((e) => !e.date) ? null : formatTnd(-min),
    knownDatedEventsGapTnd: formatTnd(-min),
    incomplete: !events.length || events.some((e) => !e.date),
    assumptions: [
      'Zero opening cash',
      'Outflows precede inflows at the same instant',
      'Projected inputs are not verified transactions',
    ],
    timeline,
  };
}
export type TimelinessObligation = {
  id: string;
  amount: bigint;
  dueAt: string | null;
  createdAt: string;
  provenance: string;
  disputed: boolean;
  settlements: {
    amount: bigint;
    date: string | null;
    verified: boolean;
    status: string;
    /** Authoritative payment identity. Timeliness deduplicates by it, like the paid totals. */
    reference: string;
  }[];
};
export function paymentTimeliness(
  rows: TimelinessObligation[],
  from: string,
  to: string,
  now = new Date(),
) {
  const start = new Date(from),
    end = new Date(to);
  let eligible = 0,
    onTime = 0,
    late = 0,
    unknown = 0,
    overdue = 0,
    partial = 0,
    disputed = 0;
  const details = [];
  for (const r of rows) {
    const periodDate = new Date(r.dueAt ?? r.createdAt);
    if (periodDate < start || periodDate >= end) continue;
    // Timeliness keeps its own requirement that a settlement has a usable date; that is what makes
    // an on-time judgement possible at all. Identity deduplication is applied first so a replayed
    // reference cannot move the completion instant or inflate the paid figure.
    const seenReferences = new Set<string>();
    const verified = r.settlements
      .filter(
        (s) => s.verified && s.status === 'VERIFIED_SETTLED' && s.date && new Date(s.date) <= now,
      )
      .filter((s) => {
        const reference = s.reference?.trim();
        if (!reference) return false;
        if (seenReferences.has(reference)) return false;
        seenReferences.add(reference);
        return true;
      })
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    let paid = 0n;
    let completion: string | null = null;
    for (const s of verified) {
      paid += s.amount;
      if (paid >= r.amount && !completion) completion = s.date;
    }
    let status = 'UNKNOWN_UNVERIFIED';
    if (r.disputed) {
      disputed++;
      unknown++;
      status = 'DISPUTED_EXCLUDED';
    } else if (r.provenance !== 'SYNTHETIC' && r.dueAt && completion && paid === r.amount) {
      eligible++;
      if (new Date(completion) <= new Date(r.dueAt)) {
        onTime++;
        status = 'VERIFIED_ON_TIME';
      } else {
        late++;
        status = 'VERIFIED_LATE';
      }
    } else {
      unknown++;
      if (paid > 0n && paid < r.amount) partial++;
      if (r.provenance !== 'SYNTHETIC' && r.dueAt && new Date(r.dueAt) < now && paid < r.amount) {
        overdue++;
        status = 'OUTSTANDING_OVERDUE';
      }
    }
    details.push({
      id: r.id,
      status,
      dueAt: r.dueAt,
      verifiedSettlementAt: completion,
      amountTnd: formatTnd(r.amount),
      verifiedTnd: formatTnd(paid),
      evidence: r.provenance,
    });
  }
  return {
    period: { from, to, bounds: '[from,to)' },
    eligiblePaymentCount: eligible,
    verifiedOnTimeCount: onTime,
    verifiedLateCount: late,
    unverifiedUnknownCount: unknown,
    outstandingOverdueCount: overdue,
    partialPaymentCount: partial,
    disputedExcludedCount: disputed,
    onTimePercentage: eligible ? Math.round((onTime * 10000) / eligible) / 100 : null,
    exclusions: [
      'Unknown contractual due dates use creation date only for unknown-count cohorting',
      'Synthetic, disputed, partially paid, overpaid and unverified obligations excluded from the verified denominator',
    ],
    details,
  };
}
/** Formula neutralization includes leading whitespace and control characters. */
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  let check = s.trimStart();
  while (check && check.charCodeAt(0) <= 32) check = check.slice(1);
  if (/^[=+@-]/u.test(check)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export type AccountingRow = {
  id: string;
  sourceId: string;
  orderId: string;
  date: string;
  kind: string;
  amount: bigint;
  evidence: string;
};
export function accountingExport(rows: AccountingRow[], from: string, to: string) {
  const selected = rows
    .filter((r) => r.date >= from && r.date < to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const grouped = new Map<string, bigint>();
  for (const r of selected) {
    const key = `${r.kind}:${r.evidence}`;
    grouped.set(key, (grouped.get(key) ?? 0n) + r.amount);
  }
  const columns = [
    'id',
    'source_event',
    'order',
    'date',
    'kind',
    'currency',
    'amount_tnd',
    'evidence',
  ];
  const csv = `${[
    columns.map(csvCell).join(','),
    ...selected.map((r) =>
      [r.id, r.sourceId, r.orderId, r.date, r.kind, 'TND', formatTnd(r.amount), r.evidence]
        .map(csvCell)
        .join(','),
    ),
  ].join('\r\n')}\r\n`;
  return {
    csv,
    rowCount: selected.length,
    totals: [...grouped].map(([group, amount]) => ({ group, amountTnd: formatTnd(amount) })),
    reconciled: true,
    period: { from, to, bounds: '[from,to)' },
    classification: 'SOURCE_SUBLEDGERS_NO_TAX_MAPPING',
    note: 'Obligations, receipts and execution reports are separate groups, never added into a misleading net total.',
  };
}
