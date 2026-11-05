'use client';
import { useRef, useState } from 'react';
import {
  exceptionCategories,
  type CollaborationPreview,
  type CollaborationTarget,
  type CollaborationTerms,
} from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { humanize } from './workspace-ui';

export function TermsComparison({
  original,
  proposed,
}: {
  original: CollaborationTerms;
  proposed: CollaborationTerms;
}) {
  return (
    <div className="grid two">
      {[
        ['Original terms', original],
        ['Proposed terms', proposed],
      ].map(([title, value]) => {
        const terms = value as CollaborationTerms;
        return (
          <div key={String(title)}>
            <h4>{String(title)}</h4>
            <p>
              {terms.quantity} pieces by {new Date(terms.deadline).toLocaleString()}
            </p>
            <p>
              Unit pay: {terms.unitPayTnd} TND. Total pay: {terms.totalPayTnd} TND.
            </p>
            <p>Effort (hours): {terms.effort}</p>
            <p>Materials: {terms.materials}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CollaborationCreation({
  kind,
  targets,
  reload,
}: {
  kind: 'exception' | 'schedule' | 'counter';
  targets: CollaborationTarget[];
  reload: () => unknown;
}) {
  const [id, setId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [detail, setDetail] = useState('');
  const [category, setCategory] = useState<string>('MATERIAL_SHORTAGE');
  const [severity, setSeverity] = useState('MEDIUM');
  const [evidence, setEvidence] = useState('');
  const [preview, setPreview] = useState<CollaborationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  // Retain the exact key for an ambiguous retry of an unchanged submission.
  const previewPayload = useRef<string | null>(null);
  const generation = useRef(0);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const target = targets.find((t) => t.id === id);
  const endpoint =
    kind === 'counter'
      ? 'counteroffers'
      : kind === 'schedule'
        ? 'schedule-revisions'
        : 'exceptions';
  const title =
    kind === 'counter'
      ? 'Propose a counteroffer'
      : kind === 'schedule'
        ? 'Propose a schedule revision'
        : 'Report a production exception';
  function changed() {
    generation.current++;
    previewPayload.current = null;
    setPreview(null);
    setError('');
    setMessage('');
  }
  function body() {
    if (!target)
      throw new Error('Select an eligible record. Refresh choices if it is no longer available.');
    const base = { expectedVersion: target.version };
    if (kind === 'counter')
      return {
        ...base,
        offerId: id,
        proposedQuantity: Number(quantity),
        proposedDeadline: new Date(deadline).toISOString(),
        clarification: detail,
      };
    if (kind === 'schedule')
      return {
        ...base,
        batchId: id,
        proposedDeadline: new Date(deadline).toISOString(),
        reason: detail,
      };
    return {
      ...base,
      batchId: id,
      category,
      severity,
      description: detail,
      evidenceReference: evidence,
      ...(quantity !== '' ? { affectedQuantity: Number(quantity) } : {}),
      ...(deadline ? { affectedDate: new Date(deadline).toISOString() } : {}),
    };
  }
  async function recover() {
    if (busy || !attempt.current) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/v1/collaboration/${endpoint}`, {
        method: 'POST',
        body: JSON.parse(attempt.current.payload),
        idempotencyKey: attempt.current.key,
      });
      setUncertain(false);
      attempt.current = null;
      setPreview(null);
      setMessage('The original submission is confirmed. Your edited draft is preserved.');
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Recovery failed. Retry the original submission.',
      );
      // A transaction-rejected stale/validation response proves this exact creation did not commit.
      if (
        failure instanceof ApiError &&
        ['STALE_PROPOSAL', 'OFFER_NOT_OPEN', 'OFFER_EXPIRED', 'VALIDATION_ERROR'].includes(
          failure.detail.code,
        )
      ) {
        attempt.current = null;
        setUncertain(false);
        setPreview(null);
        await reload();
      }
      // Authorization failures retain the receipt because recovery may become possible later.
    } finally {
      setBusy(false);
    }
  }
  async function run(submit: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const input = body();
      if (submit) {
        if (uncertain)
          throw new Error('Confirm the original submission before submitting a new draft.');
        if (kind !== 'exception' && (!preview || previewPayload.current !== JSON.stringify(input)))
          throw new Error('Preview the current proposal before submitting.');
        const payload = JSON.stringify(input);
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, key: crypto.randomUUID() };
        await apiFetch(`/api/v1/collaboration/${endpoint}`, {
          method: 'POST',
          body: input,
          idempotencyKey: attempt.current.key,
        });
        setMessage(
          kind === 'exception'
            ? 'Exception reported. Original facts and agreed pay are preserved.'
            : 'Proposal submitted. Existing commitments remain until the required approvals.',
        );
        setPreview(null);
        attempt.current = null;
        setUncertain(false);
        await reload();
      } else {
        const before = generation.current;
        const result = await apiFetch<CollaborationPreview>(
          `/api/v1/collaboration/${endpoint}/preview`,
          { method: 'POST', body: input },
        );
        if (before === generation.current) {
          previewPayload.current = JSON.stringify(input);
          setPreview(result);
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
      if (submit && attempt.current && (!(failure instanceof ApiError) || failure.status >= 500))
        setUncertain(true);
      else if (submit && failure instanceof ApiError && failure.status < 500)
        attempt.current = null;
      if (failure instanceof ApiError && [403, 404, 409].includes(failure.status)) {
        setPreview(null);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }
  if (!targets.length && !uncertain && !id)
    return (
      <p className="notice">
        No eligible {kind === 'counter' ? 'issued offer' : 'production batch'} is available for{' '}
        {title.toLowerCase()}.
      </p>
    );
  return (
    <form
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        void run(kind === 'exception');
      }}
      onChange={changed}
    >
      <h3>{title}</h3>
      <fieldset disabled={busy}>
        <legend>{title} details</legend>
        <label>
          {kind === 'counter' ? 'Issued offer' : 'Production batch'}
          <select
            aria-label={kind === 'counter' ? 'Issued offer' : 'Production batch'}
            required
            value={id}
            onChange={(e) => {
              setId(e.target.value);
            }}
          >
            <option value="">Select…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {kind === 'exception' && (
          <>
            <p>
              Responsible coordinator:{' '}
              {target
                ? (target.coordinator ??
                  'No active coordinator is assigned; the production operator is notified.')
                : 'Select a batch to identify the assigned coordinator'}
            </p>
            <label>
              Exception category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {exceptionCategories.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {kind !== 'schedule' && (
          <label>
            {kind === 'counter' ? 'Proposed quantity' : 'Affected quantity (optional)'}
            <input
              aria-label={kind === 'counter' ? 'Proposed quantity' : 'Affected quantity (optional)'}
              type="number"
              min={kind === 'counter' ? 1 : 0}
              max={1000000}
              step={1}
              required={kind === 'counter'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        )}
        <label>
          {kind === 'exception' ? 'Affected date (optional)' : 'Proposed deadline'}
          <input
            aria-label={kind === 'exception' ? 'Affected date (optional)' : 'Proposed deadline'}
            type="datetime-local"
            required={kind !== 'exception'}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          {kind === 'counter'
            ? 'Clarification (optional)'
            : kind === 'schedule'
              ? 'Reason for revision'
              : 'Original report and requested assistance'}
          <textarea
            aria-label={
              kind === 'counter'
                ? 'Clarification (optional)'
                : kind === 'schedule'
                  ? 'Reason for revision'
                  : 'Original report and requested assistance'
            }
            required={kind !== 'counter'}
            minLength={kind === 'counter' ? undefined : 2}
            maxLength={kind === 'counter' ? 2000 : 4000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        {kind === 'exception' && (
          <>
            <p>
              Describe production facts and the help needed. Keep health information out of this
              report.
            </p>
            <label>
              Evidence reference (optional)
              <input
                maxLength={500}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <p>
              Evidence is a reference only; file upload is not supported for production exceptions.
              The responsible assigned coordinator receives the report.
            </p>
          </>
        )}
        {preview && (
          <section aria-label="Proposal preview">
            <TermsComparison original={preview.original} proposed={preview.proposed} />
            <ul>
              {preview.impact.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        {kind === 'exception' ? (
          <button className="button" disabled={busy || uncertain} type="submit">
            Submit exception report
          </button>
        ) : (
          <>
            <button className="button" disabled={busy || uncertain} type="submit">
              Preview proposal
            </button>
            <button
              className="button"
              disabled={busy || uncertain || !preview}
              type="button"
              onClick={() => void run(true)}
            >
              Submit {kind === 'counter' ? 'counteroffer' : 'schedule revision'}
            </button>
          </>
        )}
        <button
          className="button"
          type="button"
          disabled={busy || uncertain}
          onClick={() => {
            setPreview(null);
            void reload();
          }}
        >
          Refresh eligible choices
        </button>
      </fieldset>
      {uncertain && (
        <p role="status">
          The submission result is unknown. Retry the original submission before sending a new
          draft.
        </p>
      )}
      {uncertain && (
        <button className="button" type="button" disabled={busy} onClick={() => void recover()}>
          Retry original submission
        </button>
      )}
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
