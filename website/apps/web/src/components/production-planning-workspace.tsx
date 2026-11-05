'use client';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useResource, Workspace, ResourceState, humanize } from './workspace-ui';
import type {
  PlanningWorkspaceView,
  RankedCandidate,
  AllocationPlanView,
  PricingSuggestion,
  DeliveryComparison,
} from '@nasj/contracts';

const tierClass: Record<string, string> = {
  RECOMMENDED: 'status status-approved',
  REVIEW: 'status status-pending',
  EXCLUDED: 'status status-rejected',
};

function tnd(value: string | null) {
  return value === null ? '—' : `${value} TND`;
}

export function ProductionPlanningWorkspace({ orderId }: { orderId: string }) {
  const path = `/api/v1/procurement/orders/${encodeURIComponent(orderId)}/planning`;
  const resource = useResource<PlanningWorkspaceView>(path);
  const data = resource.data;

  return (
    <Workspace
      title="Production planning"
      description="Rank eligible groups, allocate an order across several groups, and compare delivery plans. Recommendations are advisory; only an artisan's own acceptance commits capacity."
    >
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
      {data && (
        <>
          <Summary data={data} />
          <CandidateTable data={data} />
          <AllocationEditor data={data} reload={resource.reload} />
          <PricingPanel data={data} />
          <SimulationPanel data={data} />
          <PlanningAudit orderId={orderId} />
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

function Summary({ data }: { data: PlanningWorkspaceView }) {
  const counts = data.candidates.reduce<Record<string, number>>((accumulator, candidate) => {
    accumulator[candidate.tier] = (accumulator[candidate.tier] ?? 0) + 1;
    return accumulator;
  }, {});
  return (
    <section aria-labelledby="planning-summary">
      <h2 id="planning-summary">Order requirement</h2>
      <dl className="summary">
        <div>
          <dt>Required quantity</dt>
          <dd>{data.requiredQuantity} pieces</dd>
        </div>
        <div>
          <dt>Craft</dt>
          <dd>{data.craftName}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{new Date(data.deadline).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Recommended / review / excluded</dt>
          <dd>
            {counts.RECOMMENDED ?? 0} / {counts.REVIEW ?? 0} / {counts.EXCLUDED ?? 0}
          </dd>
        </div>
        <div>
          <dt>Policy version</dt>
          <dd>{data.planningPolicyVersion}</dd>
        </div>
      </dl>
    </section>
  );
}

function CandidateTable({ data }: { data: PlanningWorkspaceView }) {
  if (!data.candidates.length)
    return (
      <section aria-labelledby="candidates">
        <h2 id="candidates">Candidate groups</h2>
        <p className="notice" role="status">
          No eligibility assessment exists for this order yet. Assess candidates in the production
          workspace before planning.
        </p>
      </section>
    );
  return (
    <section aria-labelledby="candidates">
      <h2 id="candidates">Candidate groups</h2>
      <p>
        Ordered by hard eligibility tier, then by weighted score using weight version{' '}
        {data.rankingWeights.version}. Unknown capacity is shown as review.
      </p>
      <table className="data-table">
        <caption className="visually-hidden">Ranked candidate groups with explanations</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Tier</th>
            <th scope="col">Free pieces</th>
            <th scope="col">Score</th>
            <th scope="col">Explanation</th>
          </tr>
        </thead>
        <tbody>
          {data.candidates.map((candidate) => (
            <tr key={candidate.artisanProfileId}>
              <th scope="row">{candidate.displayName}</th>
              <td>
                <span className={tierClass[candidate.tier] ?? 'status'}>
                  {humanize(candidate.tier)}
                </span>
              </td>
              <td>
                {candidate.allocatablePieces === null ? 'Unknown' : candidate.allocatablePieces}
              </td>
              <td>
                {candidate.score === null ? (
                  <span title="A weighted input is unknown, so no score is shown.">Not scored</span>
                ) : (
                  <details>
                    <summary>{candidate.score.toFixed(1)} / 100</summary>
                    <ul>
                      {candidate.scoreComponents.map((component) => (
                        <li key={component.code}>
                          {humanize(component.code)}:{' '}
                          {component.normalized === null
                            ? 'unknown'
                            : component.normalized.toFixed(2)}{' '}
                          × {component.weight} = {component.contribution}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td>
                <ul>
                  {candidate.explanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AllocationEditor({
  data,
  reload,
}: {
  data: PlanningWorkspaceView;
  reload: () => unknown;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [materialReadiness, setMaterialReadiness] = useState<'READY' | 'NOT_READY' | 'UNKNOWN'>(
    data.materialReadiness,
  );
  const [materialReference, setMaterialReference] = useState('');
  const recommended = data.candidates.filter((candidate) => candidate.tier === 'RECOMMENDED');
  const [lines, setLines] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.suggestion.lines.map((line) => [line.artisanProfileId, line.quantity])),
  );
  const allocated = Object.values(lines).reduce((sum, value) => sum + (value || 0), 0);
  const unallocated = data.requiredQuantity - allocated;

  const setQuantity = (id: string, value: number) =>
    setLines((current) => ({ ...current, [id]: Math.max(0, Math.trunc(value)) }));

  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        version: data.orderVersion,
        requiredQuantity: data.requiredQuantity,
        materialAssumptions: {
          readiness: materialReadiness,
          reference: materialReference || 'Material readiness has not been reviewed.',
        },
        lines: Object.entries(lines)
          .filter(([, quantity]) => quantity > 0)
          .map(([artisanProfileId, quantity]) => ({ artisanProfileId, quantity })),
      };
      if (!payload.lines.length) throw new Error('Add at least one group quantity.');
      await apiFetch(
        `/api/v1/procurement/orders/${encodeURIComponent(data.orderId)}/allocation-plans`,
        {
          method: 'POST',
          body: payload,
          idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        },
      );
      setMessage('Draft allocation plan saved. It is not a production commitment.');
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="allocation">
      <h2 id="allocation">Multi-group allocation</h2>
      <label>
        Material readiness assumption
        <select
          aria-label="Material readiness assumption"
          value={materialReadiness}
          onChange={(event) =>
            setMaterialReadiness(event.target.value as 'READY' | 'NOT_READY' | 'UNKNOWN')
          }
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="NOT_READY">Not ready</option>
          <option value="READY">Ready under recorded assumption</option>
        </select>
      </label>
      <label>
        Material readiness evidence or assumption reference
        <input
          value={materialReference}
          onChange={(event) => setMaterialReference(event.target.value)}
        />
      </label>
      <p>
        Unknown material inputs can be saved in a draft. Review requires a ready assumption with its
        source; it does not record a physical receipt.
      </p>
      <p>
        Allocated {allocated} of {data.requiredQuantity}. Unallocated {unallocated}. A draft plan
        creates no reservation until offers are reviewed and issued.
      </p>
      {!recommended.length && (
        <p className="notice" role="status">
          No group has confirmed free capacity. Resolve review items before allocating.
        </p>
      )}
      {recommended.length > 0 && (
        <table className="data-table">
          <caption className="visually-hidden">Allocation editor</caption>
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Known free</th>
              <th scope="col">Allocate</th>
            </tr>
          </thead>
          <tbody>
            {recommended.map((candidate: RankedCandidate) => (
              <tr key={candidate.artisanProfileId}>
                <th scope="row">{candidate.displayName}</th>
                <td>{candidate.allocatablePieces}</td>
                <td>
                  <label className="visually-hidden" htmlFor={`qty-${candidate.artisanProfileId}`}>
                    Quantity for {candidate.displayName}
                  </label>
                  <input
                    id={`qty-${candidate.artisanProfileId}`}
                    type="number"
                    min={0}
                    max={candidate.allocatablePieces ?? 0}
                    step={1}
                    value={lines[candidate.artisanProfileId] ?? 0}
                    onChange={(event) =>
                      setQuantity(candidate.artisanProfileId, Number(event.target.value))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.suggestion.notes.map((note) => (
        <p key={note} className="notice" role="status">
          {note}
        </p>
      ))}
      <button type="button" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Save draft plan'}
      </button>
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
      {data.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          candidates={data.candidates}
          orderId={data.orderId}
          reload={reload}
        />
      ))}
    </section>
  );
}

function PlanCard({
  plan,
  candidates,
  orderId,
  reload,
}: {
  plan: AllocationPlanView;
  candidates: RankedCandidate[];
  orderId: string;
  reload: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [alternative, setAlternative] = useState(plan.items[0]?.artisanProfileId ?? '');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(path, {
        method: 'POST',
        body,
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
      });
      setMessage(success);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
    } finally {
      setBusy(false);
    }
  }

  const expiresAt = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString();
  }, []);

  return (
    <article className="plan-card" aria-labelledby={`plan-${plan.id}`}>
      <h3 id={`plan-${plan.id}`}>
        Plan v{plan.version} — {humanize(plan.state)}
      </h3>
      <dl className="summary">
        <div>
          <dt>Allocated</dt>
          <dd>{plan.totals.allocated}</dd>
        </div>
        <div>
          <dt>Unallocated</dt>
          <dd>{plan.totals.unallocated}</dd>
        </div>
        <div>
          <dt>Accepted</dt>
          <dd>{plan.totals.accepted}</dd>
        </div>
        <div>
          <dt>Reconciles</dt>
          <dd>{plan.totals.reconciles ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
      <ul>
        {plan.items.map((item) => (
          <li key={item.id}>
            {item.displayName}: {item.quantity} pieces — {humanize(item.state)}
          </li>
        ))}
      </ul>
      {['DRAFT', 'REVIEWED'].includes(plan.state) && (
        <details>
          <summary>Record a human selection override</summary>
          <p>
            Hard capacity, qualification and consent rules still apply. This change returns the plan
            to draft and creates no commitment.
          </p>
          <label>
            Override participant
            <select
              aria-label="Override participant"
              value={alternative}
              onChange={(event) => setAlternative(event.target.value)}
            >
              {candidates
                .filter((candidate) => candidate.decision === 'ELIGIBLE')
                .map((candidate) => (
                  <option key={candidate.artisanProfileId} value={candidate.artisanProfileId}>
                    {candidate.displayName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Override quantity
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label>
            Reason for alternative selection
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || reason.trim().length < 10 || !alternative}
            onClick={() =>
              act(
                '/api/v1/procurement/allocation-overrides',
                {
                  planId: plan.id,
                  version: plan.version,
                  artisanProfileId: alternative,
                  quantity: Number(quantity),
                  reason,
                },
                'Override recorded. Re-review this draft before issuing offers.',
              )
            }
          >
            Record selection override
          </button>
        </details>
      )}
      <div className="actions">
        {plan.state === 'DRAFT' && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/procurement/allocation-plans/${encodeURIComponent(plan.id)}/review`,
                { version: plan.version, confirm: true },
                'Plan reviewed. It is still not a production commitment.',
              )
            }
          >
            Review plan
          </button>
        )}
        {plan.state === 'REVIEWED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/procurement/allocation-plans/${encodeURIComponent(plan.id)}/offers`,
                { version: plan.version, expiresAt },
                'Offers prepared. Each artisan must accept personally.',
              )
            }
          >
            Prepare offers
          </button>
        )}
        {['OFFERED', 'PARTIALLY_ACCEPTED'].includes(plan.state) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                `/api/v1/procurement/allocation-plans/${encodeURIComponent(plan.id)}/reallocate`,
                {
                  version: plan.version,
                  artisanProfileIds: plan.items.map((item) => item.artisanProfileId),
                },
                'Declined and expired quantity released. Replacement suggestions updated.',
              )
            }
          >
            Reallocate declined or expired
          </button>
        )}
      </div>
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
      {plan.overrides.length > 0 && (
        <details>
          <summary>Override history ({plan.overrides.length})</summary>
          <ul>
            {plan.overrides.map((override) => (
              <li key={override.id}>
                {override.explanation} — recorded {new Date(override.createdAt).toLocaleString()} at
                decision version {override.decisionVersion}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="visually-hidden">Order {orderId}</p>
    </article>
  );
}

function PricingPanel({ data }: { data: PlanningWorkspaceView }) {
  const [values, setValues] = useState({
    quantity: String(data.requiredQuantity),
    artisanUnitTnd: '12.000',
    materialsUnitTnd: '5.000',
    qualityUnitTnd: '1.000',
    packagingUnitTnd: '1.000',
    transportFixedTnd: '80.000',
    overheadFixedTnd: '120.000',
    contingencyPercent: '5',
    effortMinutesPerPiece: '',
    effortMinimum: '',
    effortMaximum: '',
    assumptionSource: 'ILLUSTRATIVE: editable synthetic planning inputs, not validated rates.',
  });
  const [suggestion, setSuggestion] = useState<PricingSuggestion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function calculate() {
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<PricingSuggestion>(
        `/api/v1/procurement/orders/${encodeURIComponent(data.orderId)}/pricing-suggestion`,
        {
          method: 'POST',
          body: {
            quantity: Number(values.quantity),
            artisanUnitTnd: values.artisanUnitTnd,
            materialsUnitTnd: values.materialsUnitTnd,
            qualityUnitTnd: values.qualityUnitTnd,
            packagingUnitTnd: values.packagingUnitTnd,
            transportFixedTnd: values.transportFixedTnd,
            overheadFixedTnd: values.overheadFixedTnd,
            contingencyPercent: Number(values.contingencyPercent),
            effortRange:
              values.effortMinimum && values.effortMaximum
                ? { min: Number(values.effortMinimum), max: Number(values.effortMaximum) }
                : null,
            assumptionSource: values.assumptionSource,
            effortMinutesPerPiece: values.effortMinutesPerPiece
              ? Number(values.effortMinutesPerPiece)
              : null,
          },
        },
      );
      setSuggestion(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to calculate a suggestion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pricing">
      <h2 id="pricing">Pricing suggestion</h2>
      <p>
        Advisory only. This never changes the accepted quotation; a revision uses the versioned
        quotation workflow.
      </p>
      <div className="form-grid">
        {(
          [
            ['quantity', 'Quantity (pieces)'],
            ['artisanUnitTnd', 'Artisan compensation per piece (TND)'],
            ['materialsUnitTnd', 'Materials per piece (TND)'],
            ['qualityUnitTnd', 'Quality per piece (TND)'],
            ['packagingUnitTnd', 'Packaging per piece (TND)'],
            ['transportFixedTnd', 'Transport per order (TND)'],
            ['overheadFixedTnd', 'Overheads per order (TND)'],
            ['contingencyPercent', 'Contingency (%)'],
            ['effortMinutesPerPiece', 'Minutes per piece (optional)'],
            ['effortMinimum', 'Minimum minutes per piece (optional)'],
            ['effortMaximum', 'Maximum minutes per piece (optional)'],
            ['assumptionSource', 'Pricing evidence or illustrative source'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="text"
              inputMode="decimal"
              value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <button type="button" onClick={calculate} disabled={busy}>
        {busy ? 'Calculating…' : 'Calculate suggestion'}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {suggestion && (
        <div>
          <table className="data-table">
            <caption>Advisory cost breakdown</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Basis</th>
                <th scope="col">Amount (TND)</th>
              </tr>
            </thead>
            <tbody>
              {suggestion.components.map((component) => (
                <tr key={component.code}>
                  <th scope="row">{component.label}</th>
                  <td>{humanize(component.basis)}</td>
                  <td>{component.amountTnd}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="summary">
            <div>
              <dt>Subtotal</dt>
              <dd>{tnd(suggestion.subtotalTnd)}</dd>
            </div>
            <div>
              <dt>Contingency</dt>
              <dd>{tnd(suggestion.contingencyTnd)}</dd>
            </div>
            <div>
              <dt>Total cost</dt>
              <dd>{tnd(suggestion.totalCostTnd)}</dd>
            </div>
            <div>
              <dt>Effective hourly pay</dt>
              <dd>
                {suggestion.effectiveHourlyTnd ? tnd(suggestion.effectiveHourlyTnd) : 'Unavailable'}
              </dd>
            </div>
          </dl>
          <p>
            Effort range:{' '}
            {suggestion.effortRange
              ? `${suggestion.effortRange.min}–${suggestion.effortRange.max} minutes per piece`
              : 'Unavailable'}
            . Source: {suggestion.assumptionSource}
          </p>
          <p>
            An authorized quotation operator must review these inputs through the existing
            cost-estimate approval and versioned quotation workflow before issuing terms.
          </p>
          <ul>
            {suggestion.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SimulationPanel({ data }: { data: PlanningWorkspaceView }) {
  const [result, setResult] = useState<DeliveryComparison | null>(null);
  const [weekly, setWeekly] = useState('');
  const [materialDate, setMaterialDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [bufferDays, setBufferDays] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const start = startDate ? new Date(startDate) : new Date();
      const ready = materialDate ? new Date(materialDate).toISOString() : null;
      const lines = data.suggestion.lines.map((candidate) => ({
        artisanProfileId: candidate.artisanProfileId,
        quantity: candidate.quantity,
        weeklyPieces: weekly ? Number(weekly) : null,
        materialReadiness: ready ? 'READY' : 'UNKNOWN',
        materialReadyAt: ready,
        committedPieces: 0,
        committedWeeks: 1,
        availableFrom: start.toISOString(),
      }));
      if (!lines.length) throw new Error('No recommended group is available to simulate.');
      const computed = await apiFetch<DeliveryComparison>(
        `/api/v1/procurement/orders/${encodeURIComponent(data.orderId)}/delivery-simulation`,
        {
          method: 'POST',
          body: {
            version: data.orderVersion,
            startDate: start.toISOString(),
            deadline: data.deadline,
            scenarios: [
              { name: 'Recorded planning assumptions', lines },
              {
                name: 'Material buffer comparison',
                lines: lines.map((line) => ({
                  ...line,
                  materialReadyAt: ready
                    ? new Date(
                        new Date(ready).getTime() + Number(bufferDays) * 86400000,
                      ).toISOString()
                    : null,
                })),
              },
            ],
          },
          idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        },
      );
      setResult(computed);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to simulate delivery.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="simulation">
      <h2 id="simulation">Delivery simulation</h2>
      <p>
        Deterministic weekly arithmetic. A group with no supported weekly throughput is reported as
        unknown rather than assumed.
      </p>
      <div className="form-grid">
        <label>
          Scenario start
          <input
            type="datetime-local"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          Assumed weekly pieces per group (unknown when blank)
          <input
            type="number"
            min="1"
            value={weekly}
            onChange={(event) => setWeekly(event.target.value)}
          />
        </label>
        <label>
          Assumed material ready date
          <input
            type="datetime-local"
            value={materialDate}
            onChange={(event) => setMaterialDate(event.target.value)}
          />
        </label>
        <label>
          Comparison material buffer (days)
          <input
            type="number"
            min="0"
            max="365"
            value={bufferDays}
            onChange={(event) => setBufferDays(event.target.value)}
          />
        </label>
      </div>
      <p>
        All edited values are scenario assumptions. Calendar: seven-day weeks, rounded up. No
        time-per-unit or physical material readiness is inferred.
      </p>
      <button type="button" onClick={run} disabled={busy}>
        {busy ? 'Simulating…' : 'Simulate deadline'}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {result?.scenarios.map((scenario) => (
        <article key={scenario.name}>
          <h3>{scenario.name}</h3>
          <p>
            Deadline feasibility: <strong>{humanize(scenario.deadlineFeasible)}</strong>
            {scenario.earliestCompletion
              ? ` — earliest plausible completion ${new Date(scenario.earliestCompletion).toLocaleDateString()}`
              : ' — completion cannot be estimated from the available data.'}
          </p>
          <p>
            Capacity shortage: {scenario.capacityShortage ? 'Yes' : 'No'} · Unallocated work:{' '}
            {scenario.unallocated}
          </p>
          {scenario.unknowns.length > 0 && (
            <ul>
              {scenario.unknowns.map((code) => (
                <li key={code}>{humanize(code.split(':')[0])}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
      {result && (
        <details>
          <summary>Assumptions used</summary>
          <ul>
            {result.assumptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PlanningAudit({ orderId }: { orderId: string }) {
  type Review = {
    purpose: string;
    snapshots: {
      id: string;
      policy: { version: number };
      candidates: unknown;
      createdAt: string;
    }[];
    overrides: {
      id: string;
      actingUserId: string;
      createdAt: string;
      decisionVersion: number;
      explanation: string;
      originalRecommendation: unknown;
      selectedAlternative: unknown;
    }[];
    findings: {
      id: string;
      actorId: string;
      createdAt: string;
      reason: string | null;
      after: { finding?: string; correctiveDecision?: string };
    }[];
  };
  const [purpose, setPurpose] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState('');
  const [corrective, setCorrective] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setReview(
        await apiFetch<Review>(
          `/api/v1/procurement/orders/${orderId}/planning/audit?purpose=${encodeURIComponent(purpose)}`,
        ),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Audit review unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="planning-audit">
      <h2 id="planning-audit">Scoped recommendation and override review</h2>
      <p>
        Review requires a permitted auditor and a recorded purpose. Sparse exposure is not evidence
        of systematic bias, and findings never penalize workers automatically.
      </p>
      <label>
        Audit review purpose
        <input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
      </label>
      <button type="button" disabled={busy || purpose.trim().length < 10} onClick={load}>
        Review recorded recommendations
      </button>
      {error && <p role="alert">{error}</p>}
      {review && (
        <>
          <p>
            Review purpose: {review.purpose}. Recommendation snapshots: {review.snapshots.length}.
            Human overrides: {review.overrides.length}.
          </p>
          <ul>
            {review.overrides.map((row) => (
              <li key={row.id}>
                Plan version {row.decisionVersion}, actor {row.actingUserId}, {row.createdAt}.
                Reason: {row.explanation}
                <details>
                  <summary>Original and selected allocation</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {JSON.stringify(
                      { original: row.originalRecommendation, selected: row.selectedAlternative },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
          <details>
            <summary>Recorded ranking inputs and weight configuration</summary>
            {review.snapshots.map((row) => (
              <details key={row.id}>
                <summary>
                  Policy {row.policy.version} recorded {row.createdAt}
                </summary>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(row.candidates, null, 2)}
                </pre>
              </details>
            ))}
          </details>
          <label>
            Audit finding
            <textarea value={finding} onChange={(event) => setFinding(event.target.value)} />
          </label>
          <label>
            Human corrective decision
            <textarea value={corrective} onChange={(event) => setCorrective(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || finding.trim().length < 10 || corrective.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await apiFetch('/api/v1/intelligence/ranking-audit/findings', {
                  method: 'POST',
                  idempotencyKey: crypto.randomUUID(),
                  body: { orderId, purpose, finding, correctiveDecision: corrective },
                });
                await load();
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Unable to record finding.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Record reviewed finding
          </button>
          <ul aria-label="Review findings">
            {review.findings.map((row) => (
              <li key={row.id}>
                Owner {row.actorId} · {row.createdAt}. {row.after.finding} Decision:{' '}
                {row.after.correctiveDecision}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
