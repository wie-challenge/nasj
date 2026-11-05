'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ActionForm, Input, Choice, ResourceState, useResource, text } from './workspace-ui';
type Analysis = {
  acceptedQuote: { revenueTnd: string } | null;
  plannedContributionTnd: string | null;
  recordedCostsTnd: string;
  artisanObligationsTnd: string;
  quoteBasisContributionTnd: string | null;
  actualContributionTnd: string | null;
  quotedVsRecordedCostVarianceTnd: string | null;
  varianceReason: string;
  cashModel: {
    minimumModeledGapTnd: string | null;
    knownDatedEventsGapTnd: string;
    incomplete: boolean;
    timeline: {
      id: string;
      date: string;
      direction: string;
      amountTnd: string;
      balanceTnd: string;
    }[];
  } | null;
  limitations: string[];
  recordedCostLines: { id: string; sourceReference: string; category: string; amountTnd: string }[];
};
const root = '/api/v1/finance';
const post = (path: string, body: unknown) =>
  apiFetch(root + path, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
const iso = (v: string) => (v ? new Date(v).toISOString() : null);
export function RfqFinanceReview() {
  return (
    <details>
      <summary>Review funding before a sales-linked contract</summary>
      <ActionForm
        label="Record RFQ finance review"
        action={(f) =>
          post(`/rfqs/${text(f, 'rfqId')}/review`, {
            quoteId: text(f, 'quoteId'),
            decision: text(f, 'decision'),
            fundingStatus: text(f, 'fundingStatus'),
            fundingEvidence: text(f, 'fundingEvidence'),
            reason: text(f, 'reason'),
          })
        }
      >
        <Input name="rfqId" label="RFQ to review" required />
        <Input name="quoteId" label="Exact costed quote reference" required />
        <Choice name="decision" label="Finance decision">
          <option>HOLD</option>
          <option>APPROVE_ADVISORY</option>
          <option>REJECT</option>
        </Choice>
        <Choice name="fundingStatus" label="Funding evidence status">
          <option>UNFUNDED</option>
          <option>DOCUMENTED_PLAN</option>
        </Choice>
        <Input name="fundingEvidence" label="Funding plan evidence" required />
        <Input name="reason" label="Finance review reason" required />
      </ActionForm>
    </details>
  );
}
export function FinancialAnalysis({
  orderId,
  canRecord,
  canExport,
}: {
  orderId: string;
  canRecord: boolean;
  canExport: boolean;
}) {
  const [cashRows, setCashRows] = useState<string[]>(['cash-initial']);
  const r = useResource<Analysis>(`${root}/orders/${orderId}/analysis`);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [metrics, setMetrics] = useState<{
    eligiblePaymentCount: number;
    verifiedOnTimeCount: number;
    verifiedLateCount: number;
    unverifiedUnknownCount: number;
    onTimePercentage: number | null;
    outstandingOverdueCount: number;
    partialPaymentCount: number;
    disputedExcludedCount: number;
    exclusions: string[];
    details: {
      id: string;
      status: string;
      operationalState: string;
      executionStatuses: string[];
      simulatedSettlementStatuses: string[];
      dueAt: string | null;
      verifiedSettlementAt: string | null;
    }[];
  } | null>(null);
  const [exported, setExported] = useState<{
    csv: string;
    rowCount: number;
    totals: { group: string; amountTnd: string }[];
  } | null>(null);
  const base = `/orders/${orderId}`;
  const query = `?${new URLSearchParams({ from: period.from, to: period.to })}`;
  return (
    <section aria-label="Order contribution and accounting" className="section-gap">
      <h3>Contribution and working capital</h3>
      {canRecord && <ContractualDates orderId={orderId} />}
      <p>
        Verified settlement is unavailable: no approved bank/provider verification policy is
        enabled.
      </p>
      <ResourceState {...r} retry={r.reload} />
      {r.data && (
        <>
          <dl>
            <dt>Accepted quote revenue reference</dt>
            <dd>{r.data.acceptedQuote?.revenueTnd ?? 'Unavailable'} TND</dd>
            <dt>Planned contribution</dt>
            <dd>{r.data.plannedContributionTnd ?? 'Unavailable'} TND</dd>
            <dt>Recorded non-artisan costs</dt>
            <dd>{r.data.recordedCostsTnd} TND</dd>
            <dt>Artisan obligations</dt>
            <dd>{r.data.artisanObligationsTnd} TND</dd>
            <dt>Quote-basis estimated contribution</dt>
            <dd>{r.data.quoteBasisContributionTnd ?? 'Unavailable'} TND</dd>
            <dt>Supported actual contribution</dt>
            <dd>
              {r.data.actualContributionTnd ??
                'Unavailable: recognition policy and complete evidence required'}
            </dd>
            <dt>Quoted versus recorded cost variance</dt>
            <dd>
              {r.data.quotedVsRecordedCostVarianceTnd ?? 'Unavailable'} TND —{' '}
              {r.data.varianceReason}
            </dd>
          </dl>
          <ul>
            {r.data.limitations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <p>
            Minimum modeled cash gap:{' '}
            {r.data.cashModel?.minimumModeledGapTnd ??
              'Unavailable; review missing or dated inputs incomplete'}
            .
          </p>
          {r.data.cashModel?.timeline.map((e) => (
            <p key={e.id}>
              {e.date} · {e.direction} {e.amountTnd} TND · projected balance {e.balanceTnd} TND
            </p>
          ))}
          {r.data.recordedCostLines.map((c) => (
            <p key={c.id}>
              {c.category}: {c.amountTnd} TND — {c.sourceReference}
            </p>
          ))}
          {canRecord && (
            <>
              <details>
                <summary>Record attributable cost evidence</summary>
                <ActionForm
                  label="Record cost evidence"
                  onSuccess={r.reload}
                  action={(f) =>
                    post(`${base}/costs`, {
                      category: text(f, 'category'),
                      amountTnd: text(f, 'amountTnd'),
                      sourceReference: text(f, 'sourceReference'),
                      occurredAt: iso(text(f, 'occurredAt')),
                      provenance: text(f, 'provenance'),
                      reason: text(f, 'reason'),
                    })
                  }
                >
                  <Choice name="category" label="Cost category">
                    {['MATERIAL', 'QA', 'PACKING', 'LOGISTICS', 'OTHER'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Choice>
                  <Input name="amountTnd" label="Recorded cost (TND)" required />
                  <Input name="sourceReference" label="Unique cost evidence reference" required />
                  <Input
                    name="occurredAt"
                    label="Cost occurrence date"
                    type="datetime-local"
                    required
                  />
                  <Choice name="provenance" label="Cost evidence state">
                    <option>SYNTHETIC</option>
                    <option>RECORDED_UNVERIFIED</option>
                  </Choice>
                  <Input name="reason" label="Cost recording reason" required />
                </ActionForm>
              </details>
              <details>
                <summary>Review projected cash requirements</summary>
                <p>
                  Enter dated projected buyer receipts, material purchases and artisan obligations.
                  This records assumptions, not contractual dates or payments.
                </p>
                <ActionForm
                  label="Save cash review"
                  onSuccess={r.reload}
                  action={(f) =>
                    post(`${base}/cash-review`, {
                      reason: text(f, 'reason'),
                      varianceReason: text(f, 'varianceReason'),
                      costCoverage: text(f, 'costCoverage'),
                      events: Array.from({ length: cashRows.length }, (_, i) => ({
                        sourceReference: text(f, `cashSource${i}`),
                        direction: text(f, `cashDirection${i}`),
                        amountTnd: text(f, `cashAmount${i}`),
                        date: iso(text(f, `cashDate${i}`)),
                        basis: text(f, `cashBasis${i}`),
                      })),
                    })
                  }
                >
                  {cashRows.map((rowId, i) => (
                    <fieldset key={rowId}>
                      <legend>Projected cash event {i + 1}</legend>
                      <Input
                        name={`cashSource${i}`}
                        label={`Cash source reference ${i + 1}`}
                        required
                      />
                      <Choice name={`cashDirection${i}`} label={`Cash direction ${i + 1}`}>
                        <option value="OUT">Outflow</option>
                        <option value="IN">Inflow</option>
                      </Choice>
                      <Input name={`cashAmount${i}`} label={`Cash amount TND ${i + 1}`} required />
                      <Input
                        name={`cashDate${i}`}
                        label={`Cash date ${i + 1} (leave empty when unknown)`}
                        type="datetime-local"
                      />
                      <Input
                        name={`cashBasis${i}`}
                        label={`Cash assumption evidence ${i + 1}`}
                        required
                      />
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setCashRows((rows) => [...rows, crypto.randomUUID()].slice(0, 100))
                    }
                  >
                    Add projected cash event
                  </button>
                  <Choice name="costCoverage" label="Cost coverage">
                    <option>INCOMPLETE</option>
                    <option>RECORDED_SCOPE_COMPLETE</option>
                  </Choice>
                  <Input name="varianceReason" label="Variance explanation" required />
                  <Input name="reason" label="Cash review reason" required />
                </ActionForm>
              </details>
            </>
          )}
          <ActionForm
            label="Set financial reporting period"
            action={async (f) => {
              setPeriod({ from: iso(text(f, 'from'))!, to: iso(text(f, 'to'))! });
              setMetrics(null);
              setExported(null);
            }}
          >
            <Input name="from" label="Financial period from" type="datetime-local" required />
            <Input
              name="to"
              label="Financial period to (exclusive)"
              type="datetime-local"
              required
            />
          </ActionForm>
          {period.from && (
            <>
              <ActionForm
                label="Calculate payment timeliness"
                action={async () => setMetrics(await apiFetch(`${root + base}/timeliness${query}`))}
              />
              {canExport && (
                <ActionForm
                  label="Prepare accounting CSV"
                  action={async () =>
                    setExported(await apiFetch(`${root + base}/accounting-export${query}`))
                  }
                />
              )}
            </>
          )}
          {metrics && (
            <>
              <p role="status">
                Eligible verified: {metrics.eligiblePaymentCount}; on time:{' '}
                {metrics.verifiedOnTimeCount}; late: {metrics.verifiedLateCount}
                {'; '}
                unknown/unverified: {metrics.unverifiedUnknownCount}; on-time rate:{' '}
                {metrics.onTimePercentage === null ? 'Unavailable' : `${metrics.onTimePercentage}%`}
                .
              </p>
              <p>
                Outstanding overdue: {metrics.outstandingOverdueCount}; partial:{' '}
                {metrics.partialPaymentCount}; disputed and excluded:{' '}
                {metrics.disputedExcludedCount}.
              </p>
              <ul>
                {metrics.exclusions.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              {metrics.details.map((v) => (
                <p key={v.id}>
                  {v.id}: {v.status}; operational state {v.operationalState}; execution reports{' '}
                  {v.executionStatuses.join(', ') || 'none'}; simulations{' '}
                  {v.simulatedSettlementStatuses.join(', ') || 'none'}; contractual due{' '}
                  {v.dueAt ?? 'unknown'}; verified settlement{' '}
                  {v.verifiedSettlementAt ?? 'unavailable'}.
                </p>
              ))}
            </>
          )}
          {exported && (
            <>
              <p>
                Export reconciled: {exported.rowCount} source rows. Totals are separate
                subledger/evidence groups.
              </p>
              <ul>
                {exported.totals.map((t) => (
                  <li key={t.group}>
                    {t.group}: {t.amountTnd} TND
                  </li>
                ))}
              </ul>
              <a
                download={`accounting-${orderId}.csv`}
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(exported.csv)}`}
              >
                Download accounting CSV
              </a>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ContractualDates({ orderId }: { orderId: string }) {
  const r = useResource<{
    payables: { id: string; amountTnd: string }[];
    history: {
      id: string;
      payableId: string;
      version: number;
      basis: string;
      dueAt: string | null;
      sourceEvidence: string;
      contractVersion: string;
    }[];
  }>(`${root}/orders/${orderId}/contractual-dates`);
  return (
    <details>
      <summary>Contractual due-date evidence</summary>
      <p>
        Transcribe already accepted terms, or record unknown. Corrections append history; they do
        not amend the agreement or verify payment.
      </p>
      <ResourceState {...r} retry={r.reload} />
      {r.data && (
        <>
          {r.data.payables.length ? (
            <ActionForm
              label="Record contractual due-date evidence"
              onSuccess={r.reload}
              action={(f) => {
                const payableId = text(f, 'payableId');
                const previous = r.data!.history.find((h) => h.payableId === payableId);
                return post(`/orders/${orderId}/contractual-dates`, {
                  payableId,
                  version: (previous?.version ?? 0) + 1,
                  basis: text(f, 'basis'),
                  dueAt: iso(text(f, 'dueAt')),
                  sourceEvidence: text(f, 'sourceEvidence'),
                  reason: text(f, 'reason'),
                });
              }}
            >
              <Choice name="payableId" label="Payable for contractual date">
                {r.data.payables.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.amountTnd} TND
                  </option>
                ))}
              </Choice>
              <Choice name="basis" label="Contractual date basis">
                <option value="UNKNOWN">Unknown</option>
                <option value="ACCEPTED_TERMS_EVIDENCE">Evidence of accepted terms</option>
              </Choice>
              <Input
                name="dueAt"
                label="Exact contractual due date (leave empty for unknown)"
                type="datetime-local"
              />
              <Input name="sourceEvidence" label="Accepted agreement source evidence" required />
              <Input name="reason" label="Date recording or correction reason" required />
            </ActionForm>
          ) : (
            <p>No recognized payable is available for date evidence.</p>
          )}
          <ol>
            {r.data.history.map((h) => (
              <li key={h.id}>
                Version {h.version}: {h.dueAt ?? 'Unknown'} — {h.sourceEvidence}. Source version{' '}
                {h.contractVersion}.
              </li>
            ))}
          </ol>
        </>
      )}
    </details>
  );
}
