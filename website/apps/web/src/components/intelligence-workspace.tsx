'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useResource, Workspace, ResourceState, humanize } from './workspace-ui';
import type { IntelligenceWorkspaceView, RiskState } from '@nasj/contracts';

const riskClass: Record<RiskState, string> = {
  ON_TRACK: 'status status-approved',
  AT_RISK: 'status status-pending',
  OVERDUE: 'status status-rejected',
  INSUFFICIENT_DATA: 'status',
};

function percent(value: number | null) {
  return value === null ? 'Unavailable' : `${value}%`;
}

export function IntelligenceWorkspace() {
  const [month, setMonth] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const resource = useResource<IntelligenceWorkspaceView>(
    `/api/v1/intelligence${month ? `?month=${encodeURIComponent(month)}` : ''}`,
  );
  async function act(path: string, body: unknown) {
    setBusy(true);
    setMessage('');
    try {
      await apiFetch(path, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
      setMessage('Recorded. The underlying production facts and agreements are unchanged.');
      await resource.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record this action.');
    } finally {
      setBusy(false);
    }
  }
  const data = resource.data;
  return (
    <Workspace
      title="Production intelligence and analytics"
      description="Explainable delay risk, forecast comparison, fairness review and business metrics derived from stored records. Synthetic and verified figures are always separated."
    >
      <label>
        Reporting month
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </label>
      {message && <p role="status">{message}</p>}
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
      {data && (
        <>
          <p className="notice" role="note">
            Every figure below comes from synthetic demonstration records. Policy versions: risk{' '}
            {data.riskPolicyVersion}, metrics {data.metricsPolicyVersion}. Generated{' '}
            {new Date(data.generatedAt).toLocaleString()}. Reporting period:{' '}
            {new Date(data.period.from).toLocaleDateString()} to{' '}
            {new Date(data.period.to).toLocaleDateString()} ({data.period.timezone}).
          </p>

          <section aria-labelledby="risk">
            <h2 id="risk">Batch risk</h2>
            {!data.batches.length && (
              <p className="notice" role="status">
                No production batch exists to assess.
              </p>
            )}
            {data.batches.length > 0 && (
              <table className="data-table">
                <caption>Delay-risk indicators with their reasons</caption>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Group</th>
                    <th scope="col">State</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map((batch) => (
                    <tr key={batch.batchId}>
                      <th scope="row">{batch.batchId.slice(0, 8)}</th>
                      <td>{batch.artisanDisplayName}</td>
                      <td>
                        <span className={riskClass[batch.risk.state]}>
                          {humanize(batch.risk.state)}
                        </span>
                      </td>
                      <td>
                        {batch.risk.remainingQuantity === null
                          ? 'Unknown'
                          : batch.risk.remainingQuantity}
                      </td>
                      <td>
                        <p>
                          Evaluated {new Date(batch.evaluatedAt).toLocaleString()}; intervention
                          owner: {humanize(batch.interventionOwner)}.
                        </p>
                        <ul>
                          {batch.risk.reasons.map((reason) => (
                            <li key={reason.code}>{reason.detail}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="alerts">
            <h2 id="alerts">Operational alerts</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => act('/api/v1/intelligence/alerts/evaluate', month ? { month } : {})}
            >
              Evaluate recorded risk and alerts
            </button>
            {!data.alerts.length && <p>No recorded operational alert.</p>}
            {data.alerts.map((alert) => (
              <article key={alert.id}>
                <h3>
                  {humanize(alert.kind)} · {alert.batchId.slice(0, 8)}
                </h3>
                <p>
                  {humanize(alert.status)} · Owner: {humanize(alert.ownerRole)}
                </p>
                {alert.status === 'OPEN' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(`/api/v1/intelligence/alerts/${encodeURIComponent(alert.id)}/decision`, {
                        action: 'ACKNOWLEDGE',
                        reason:
                          'Production manager acknowledged through the operational alert view.',
                      })
                    }
                  >
                    Acknowledge alert
                  </button>
                )}
                {alert.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(`/api/v1/intelligence/alerts/${encodeURIComponent(alert.id)}/decision`, {
                        action: 'RESOLVE',
                        reason:
                          'Production manager recorded corrective review; original facts remain available.',
                      })
                    }
                  >
                    Resolve reviewed alert
                  </button>
                )}
              </article>
            ))}
          </section>
          <section aria-labelledby="forecast">
            <h2 id="forecast">Forecast versus observed</h2>
            <p>Observed reference data: {data.forecastSummary.note}</p>
            <p>
              Synthetic comparison only: {data.syntheticForecastSummary.observations} comparable
              observations; mean absolute error{' '}
              {data.syntheticForecastSummary.meanAbsoluteErrorDays ?? 'unavailable'} days. This is
              not evidence of real forecasting accuracy.
            </p>
            <dl className="summary">
              <div>
                <dt>Comparable observations</dt>
                <dd>{data.forecastSummary.observations}</dd>
              </div>
              <div>
                <dt>Mean absolute error (days)</dt>
                <dd>
                  {data.forecastSummary.meanAbsoluteErrorDays === null
                    ? 'Not reported'
                    : data.forecastSummary.meanAbsoluteErrorDays}
                </dd>
              </div>
              <div>
                <dt>Mean signed error (days)</dt>
                <dd>
                  {data.forecastSummary.meanSignedErrorDays === null
                    ? 'Not reported'
                    : data.forecastSummary.meanSignedErrorDays}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="fairness">
            <h2 id="fairness">Offer distribution and ranking audit</h2>
            <p>{data.fairness.note}</p>
            {data.fairness.suppressed ? (
              <p className="notice" role="status">
                Cohort of {data.fairness.cohort} is below the minimum of{' '}
                {data.fairness.minimumCohort}. Distribution figures are withheld.
              </p>
            ) : (
              <table className="data-table">
                <caption>
                  Offer distribution — cohort {data.fairness.cohort}, minimum{' '}
                  {data.fairness.minimumCohort}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Share of offers</th>
                    <th scope="col">Offered</th>
                    <th scope="col">Accepted</th>
                    <th scope="col">Declined</th>
                    <th scope="col">Expired</th>
                    <th scope="col">Simulated paid participation</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fairness.rows.map((row) => (
                    <tr key={row.artisanProfileId}>
                      <td>{percent(row.sharePercent)}</td>
                      <td>{row.offered}</td>
                      <td>{row.accepted}</td>
                      <td>{row.declined}</td>
                      <td>{row.expired}</td>
                      <td>{row.paidParticipation ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <dl className="summary">
              <div>
                <dt>Ranking policy version</dt>
                <dd>{data.rankingAudit.policyVersion}</dd>
              </div>
              <div>
                <dt>Recorded recommendation snapshots</dt>
                <dd>{data.rankingAudit.snapshots}</dd>
              </div>
              <div>
                <dt>Human overrides</dt>
                <dd>{data.rankingAudit.overrides}</dd>
              </div>
              <div>
                <dt>Batches with insufficient data</dt>
                <dd>{data.rankingAudit.excludedCandidates}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="fulfillment">
            <h2 id="fulfillment">Fulfillment metrics</h2>
            <table className="data-table">
              <caption>Each ratio states its numerator and denominator</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Numerator</th>
                  <th scope="col">Denominator</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Produced', data.fulfillment.produced],
                    ['Quality approved', data.fulfillment.qualityApproved],
                    ['Shipped', data.fulfillment.shipped],
                    ['Received', data.fulfillment.received],
                    ['Buyer accepted', data.fulfillment.buyerAccepted],
                  ] as const
                ).map(([label, metric]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{metric.numerator}</td>
                    <td>{metric.denominator}</td>
                    <td>{percent(metric.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{data.fulfillment.note}</p>
            <dl className="summary">
              <div>
                <dt>Requests</dt>
                <dd>{data.fulfillment.counts.rfqs}</dd>
              </div>
              <div>
                <dt>Accepted quotations</dt>
                <dd>{data.fulfillment.counts.acceptedQuotations}</dd>
              </div>
              <div>
                <dt>Offered quantity</dt>
                <dd>{data.fulfillment.counts.offeredQuantity}</dd>
              </div>
              <div>
                <dt>Artisan-accepted quantity</dt>
                <dd>{data.fulfillment.counts.artisanAcceptedQuantity}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="producer-share">
            <h2 id="producer-share">Producer share (aggregate)</h2>
            {data.producerShare.suppressed ? (
              <p className="notice" role="status">
                {data.producerShare.note} Cohort {data.producerShare.cohort} is below the reviewed
                threshold of {data.producerShare.minimumCohort}.
              </p>
            ) : (
              <>
                <dl className="summary">
                  <div>
                    <dt>Share of net quotation revenue</dt>
                    <dd>
                      {data.producerShare.sharePercent === null
                        ? 'Undefined (zero revenue)'
                        : `${data.producerShare.sharePercent}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Numerator (agreed compensation)</dt>
                    <dd>{data.producerShare.numeratorTnd} TND</dd>
                  </div>
                  <div>
                    <dt>Denominator (net quotation revenue)</dt>
                    <dd>{data.producerShare.denominatorTnd} TND</dd>
                  </div>
                </dl>
                <p>
                  Formula: <code>{data.producerShare.formula}</code>
                </p>
                <p>{data.producerShare.note}</p>
              </>
            )}
          </section>

          <section aria-labelledby="compensation">
            <h2 id="compensation">Compensation, kept separate</h2>
            {!data.compensation && (
              <p role="status">
                Compensation aggregates are withheld because the participating cohort is below the
                reporting threshold.
              </p>
            )}
            {data.compensation && (
              <>
                <table className="data-table">
                  <caption>
                    Agreed, earned, payable, simulated and verified are never combined
                  </caption>
                  <tbody>
                    <tr>
                      <th scope="row">Agreed</th>
                      <td>{data.compensation.agreed} TND</td>
                    </tr>
                    <tr>
                      <th scope="row">Earned from accepted work</th>
                      <td>{data.compensation.earned} TND</td>
                    </tr>
                    <tr>
                      <th scope="row">Payable</th>
                      <td>{data.compensation.payable} TND</td>
                    </tr>
                    <tr>
                      <th scope="row">Simulated settlement</th>
                      <td>{data.compensation.simulatedPaid} TND</td>
                    </tr>
                    <tr>
                      <th scope="row">Verified paid</th>
                      <td>
                        {data.compensation.verifiedPaid} TND
                        {!data.compensation.verifiedAvailable && ' (no verified evidence exists)'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p>{data.compensation.note}</p>
              </>
            )}
          </section>

          <p className="notice" role="note">
            {data.limitations.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </>
      )}
    </Workspace>
  );
}
