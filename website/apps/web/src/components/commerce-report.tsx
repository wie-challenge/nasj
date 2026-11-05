'use client';
import { useState } from 'react';
import type { CommerceMetrics } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { humanize } from './workspace-ui';
type Report = {
  status: string;
  pendingEvents: number;
  asOf?: string;
  metrics: (Omit<CommerceMetrics, 'finance'> & { finance: Record<string, unknown> | null }) | null;
};
export function CommerceReport({ orderId }: { orderId: string }) {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setReport(await apiFetch<Report>(`/api/v1/commerce/orders/${orderId}/report`));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load report.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Synthetic fulfillment report</summary>
      <button className="btn-secondary" type="button" onClick={load} disabled={busy}>
        {busy ? 'Loading report…' : 'Refresh report'}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <div>
          <p role="status">
            {humanize(report.status)} · {report.pendingEvents} queued events for this buyer
            organization.
            {report.asOf && ` Calculated ${report.asOf} (UTC).`}
          </p>
          {report.metrics && (
            <>
              <p>
                Order lifetime totals. All results are simulated. Actual costs, hours and verified
                settlement are unavailable.
              </p>
              <dl className="commerce-summary">
                {Object.entries(report.metrics.fulfillment).map(([name, value]) => (
                  <div key={name}>
                    <dt>{humanize(name)}</dt>
                    <dd>
                      {value.numerator} / {value.denominator} pieces
                    </dd>
                  </div>
                ))}
                {Object.entries(report.metrics.finance ?? {})
                  .filter(([, value]) => typeof value === 'string' && /^\d+$/.test(value))
                  .map(([name, value]) => (
                    <div key={name}>
                      <dt>{humanize(name)}</dt>
                      <dd>{String(value)} millimes (TND)</dd>
                    </div>
                  ))}
              </dl>
              <a className="btn-secondary" href={`/api/v1/commerce/orders/${orderId}/report.csv`}>
                Download synthetic CSV
              </a>
            </>
          )}
        </div>
      )}
    </details>
  );
}
