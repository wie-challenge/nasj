'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useResource, Workspace, ResourceState, humanize } from './workspace-ui';
import type {
  CatalogWorkspaceView,
  SpecificationView,
  SpecificationRevisionView,
  SampleRequestView,
} from '@nasj/contracts';

async function post(path: string, body: unknown) {
  return apiFetch(path, {
    method: 'POST',
    body,
    idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
  });
}

export function ProductCatalogWorkspace() {
  const resource = useResource<CatalogWorkspaceView>('/api/v1/catalog');
  const data = resource.data;
  return (
    <Workspace
      title="Product design and sampling"
      description="Versioned product specifications, paid sample terms and recorded buyer approval. Approved revisions are immutable."
    >
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
      {data && (
        <>
          <section aria-labelledby="specifications">
            <h2 id="specifications">Product specifications</h2>
            {!data.specifications.length && (
              <p className="notice" role="status">
                No product specification exists for your organization yet.
              </p>
            )}
            {data.specifications.map((specification) => (
              <SpecificationCard
                key={specification.id}
                specification={specification}
                reload={resource.reload}
              />
            ))}
          </section>
          <section aria-labelledby="samples">
            <h2 id="samples">Sample requests</h2>
            {!data.samples.length && (
              <p className="notice" role="status">
                No sample request exists for your organization.
              </p>
            )}
            {data.samples.map((sample) => (
              <SampleCard
                key={sample.id}
                sample={sample}
                canApprove={data.canApprove}
                reload={resource.reload}
              />
            ))}
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

function SpecificationCard({
  specification,
  reload,
}: {
  specification: SpecificationView;
  reload: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const latest = specification.revisions[0];

  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await post(path, body);
      setMessage(success);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="plan-card" aria-labelledby={`spec-${specification.id}`}>
      <h3 id={`spec-${specification.id}`}>
        {specification.productCode} — {specification.name}
      </h3>
      <p>
        Craft: {specification.craftName} · {specification.revisions.length} revision
        {specification.revisions.length === 1 ? '' : 's'}
      </p>
      <table className="data-table">
        <caption>Revision history</caption>
        <thead>
          <tr>
            <th scope="col">Revision</th>
            <th scope="col">Status</th>
            <th scope="col">Approved</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {specification.revisions.map((revision: SpecificationRevisionView) => (
            <tr key={revision.id}>
              <th scope="row">v{revision.revisionNumber}</th>
              <td>{humanize(revision.status)}</td>
              <td>
                {revision.approvedAt ? new Date(revision.approvedAt).toLocaleDateString() : '—'}
              </td>
              <td>
                {revision.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/api/v1/catalog/specification-revisions/${encodeURIComponent(revision.id)}/submit`,
                        { version: revision.revisionNumber },
                        'Revision submitted for review.',
                      )
                    }
                  >
                    Submit for review
                  </button>
                )}
                {revision.status === 'SUBMITTED_FOR_REVIEW' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/v1/catalog/specification-revisions/${encodeURIComponent(revision.id)}/decision`,
                          { version: revision.revisionNumber, decision: 'APPROVED', comments: '' },
                          'Revision approved. It is now immutable.',
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/v1/catalog/specification-revisions/${encodeURIComponent(revision.id)}/decision`,
                          {
                            version: revision.revisionNumber,
                            decision: 'REJECTED',
                            comments: 'Returned for revision.',
                          },
                          'Revision rejected.',
                        )
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {latest && (
        <details>
          <summary>Latest revision detail (v{latest.revisionNumber})</summary>
          <p>{latest.description}</p>
          <p>
            Dimensions: {latest.dimensions || 'Not recorded'} {latest.unit}
          </p>
          <p>Tolerances: {latest.tolerances || 'Not recorded'}</p>
          <p>Quality criteria: {latest.qualityCriteria}</p>
          <h4>Materials</h4>
          <ul>
            {latest.materials.map((material) => (
              <li key={material.materialCode}>
                {material.name}: {material.quantity} {material.unit}
              </li>
            ))}
          </ul>
          <h4>Reference images</h4>
          {latest.referenceImages.length ? (
            <ul>
              {latest.referenceImages.map((image) => (
                <li key={image.sha256}>
                  {image.filename} {image.caption && `— ${image.caption}`}
                </li>
              ))}
            </ul>
          ) : (
            <p>No reference image is attached.</p>
          )}
        </details>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </article>
  );
}

function SampleCard({
  sample,
  canApprove,
  reload,
}: {
  sample: SampleRequestView;
  canApprove: boolean;
  reload: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [compensation, setCompensation] = useState('');
  const [materialCost, setMaterialCost] = useState('0.000');
  const [completionEvidence, setCompletionEvidence] = useState('');
  const [recordedMinutes, setRecordedMinutes] = useState('');
  const [timeEvidence, setTimeEvidence] = useState<'UNKNOWN' | 'SYNTHETIC' | 'OBSERVED'>('UNKNOWN');
  const [actualMaterialCost, setActualMaterialCost] = useState('');
  const [actualMaterialUsage, setActualMaterialUsage] = useState('');

  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await post(path, body);
      setMessage(success);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="plan-card" aria-labelledby={`sample-${sample.id}`}>
      <h3 id={`sample-${sample.id}`}>
        {sample.productCode} sample for {sample.specificationName} (revision v
        {sample.revisionNumber})
      </h3>
      <dl className="summary">
        <div>
          <dt>Status</dt>
          <dd>{humanize(sample.status)}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{sample.sampleQuantity}</dd>
        </div>
        <div>
          <dt>Compensation</dt>
          <dd>
            {sample.compensationTnd ? `${sample.compensationTnd} TND` : 'Not agreed'}{' '}
            {sample.compensationBasis !== 'UNPAID_BY_DEFAULT_BLOCKED' &&
              `(${humanize(sample.compensationBasis)})`}
          </dd>
        </div>
        <div>
          <dt>Recorded time</dt>
          <dd>
            {sample.actualRecordedMinutes === null
              ? 'Unknown'
              : `${sample.actualRecordedMinutes} minutes (${humanize(sample.timeEvidence)})`}
          </dd>
        </div>
      </dl>
      {sample.compensationBlocker && (
        <p className="notice" role="status">
          {sample.compensationBlocker} Sample work cannot start until compensation is agreed.
        </p>
      )}
      <p>Work terms: {sample.workTerms}</p>
      <p>
        Approved specification v{sample.revisionNumber}: {sample.specification.description}
      </p>
      <p>
        Measurements: {sample.specification.dimensions}. Tolerances:{' '}
        {sample.specification.tolerances}.
      </p>
      <p>Acceptance criteria: {sample.specification.qualityCriteria}</p>
      <p>Material cost: {sample.materialCostTnd ?? 'Not recorded'} TND</p>
      <p>
        Actual material cost:{' '}
        {sample.actualMaterialCostTnd === null
          ? 'Unavailable'
          : `${sample.actualMaterialCostTnd} TND`}
        . Recorded material usage: {sample.actualMaterialUsage || 'Unavailable'}.
      </p>
      {sample.payable && (
        <p>
          Sample obligation: {sample.payable.amountTnd} TND — {humanize(sample.payable.status)}.
          Recognition is not payment.
        </p>
      )}
      <p>Materials: {sample.materialResponsibility}</p>
      {sample.status === 'TERMS_PENDING' && sample.canIssueTerms && (
        <div className="form-grid">
          <label>
            Agreed compensation (TND)
            <input
              type="text"
              inputMode="decimal"
              value={compensation}
              onChange={(event) => setCompensation(event.target.value)}
              placeholder="e.g. 45.000"
            />
          </label>
          <label>
            Material cost (TND)
            <input
              type="text"
              inputMode="decimal"
              value={materialCost}
              onChange={(event) => setMaterialCost(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !compensation}
            onClick={() =>
              act(
                `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/terms`,
                {
                  compensationTnd: compensation,
                  compensationBasis: 'PER_SAMPLE',
                  materialCostTnd: materialCost,
                  reimburseMaterials: false,
                  workTerms: sample.workTerms,
                  evidenceReference: 'Sample terms agreed in writing.',
                },
                'Sample terms issued. The artisan must review and accept them before work.',
              )
            }
          >
            Issue sample terms
          </button>
        </div>
      )}
      {sample.canAcceptTerms && sample.termsSha256 && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(
              `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/accept`,
              { termsSha256: sample.termsSha256 },
              'You accepted the exact displayed sample terms.',
            )
          }
        >
          Accept these sample terms
        </button>
      )}
      {sample.status === 'ACCEPTED_FOR_PRODUCTION' && sample.canRecordWork && (
        <div>
          <p>
            Leave actual time and material cost blank when unavailable. These records do not change
            the agreed payment terms.
          </p>
          <label>
            Sample observed minutes (optional)
            <input
              type="number"
              min="1"
              value={recordedMinutes}
              onChange={(event) => setRecordedMinutes(event.target.value)}
            />
          </label>
          <label>
            Sample time evidence class
            <select
              aria-label="Sample time evidence class"
              value={timeEvidence}
              onChange={(event) => setTimeEvidence(event.target.value as typeof timeEvidence)}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="SYNTHETIC">Synthetic demonstration observation</option>
              <option value="OBSERVED">Personally observed duration</option>
            </select>
          </label>
          <label>
            Actual sample material cost (TND, optional)
            <input
              inputMode="decimal"
              value={actualMaterialCost}
              onChange={(event) => setActualMaterialCost(event.target.value)}
            />
          </label>
          <label>
            Actual sample material use (optional)
            <textarea
              value={actualMaterialUsage}
              onChange={(event) => setActualMaterialUsage(event.target.value)}
            />
          </label>

          <label>
            Completion evidence
            <input
              value={completionEvidence}
              onChange={(event) => setCompletionEvidence(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/work`,
                {
                  actualRecordedMinutes: recordedMinutes ? Number(recordedMinutes) : null,
                  timeEvidence,
                  actualMaterialCostTnd: actualMaterialCost || null,
                  actualMaterialUsage,
                  evidenceReference: completionEvidence,
                },
                'Sample submitted. Recorded time stays unknown until measured.',
              )
            }
          >
            Submit sample work
          </button>
        </div>
      )}
      {sample.status === 'SUBMITTED' && sample.canEvaluate && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(
              `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/evaluations`,
              {
                decision: 'APPROVED',
                criteria: 'Meets the approved revision tolerances and quality criteria.',
                comments: '',
                evidenceReference: 'Sample inspection recorded.',
              },
              'Sample inspection passed. Buyer approval is still required.',
            )
          }
        >
          Record inspection pass
        </button>
      )}
      {sample.status === 'UNDER_REVIEW' && canApprove && sample.canApprove && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/approval`,
                {
                  decision: 'APPROVED',
                  comments: '',
                  evidenceReference: 'Buyer sign-off recorded.',
                },
                'Sample approved by the buying organization.',
              )
            }
          >
            Approve sample
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/catalog/samples/${encodeURIComponent(sample.id)}/approval`,
                {
                  decision: 'REJECTED',
                  comments: 'Does not meet the expected quality.',
                  evidenceReference: 'Buyer rejection recorded.',
                },
                'Sample rejected.',
              )
            }
          >
            Reject sample
          </button>
        </>
      )}
      {sample.evaluations.length > 0 && (
        <details>
          <summary>Inspection history ({sample.evaluations.length})</summary>
          <ul>
            {sample.evaluations.map((evaluation) => (
              <li key={evaluation.id}>
                {humanize(evaluation.decision)} — {new Date(evaluation.createdAt).toLocaleString()}
                <p>Criteria: {evaluation.criteria}</p>
                <p>{evaluation.comments}</p>
                <p>Evidence: {evaluation.evidenceReference}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {sample.approvals.map((approval) => (
        <p key={approval.id}>
          Buyer decision: {humanize(approval.decision)} —{' '}
          {new Date(approval.createdAt).toLocaleString()}. {approval.comments} Evidence:{' '}
          {approval.evidenceReference}
        </p>
      ))}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </article>
  );
}
