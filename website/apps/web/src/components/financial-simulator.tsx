'use client';

import { useId, useState } from 'react';
import {
  calculateFinancialScenario,
  financialScenarioPresets,
  scenarioPercentage,
  signedScenarioTnd,
  type FinancialScenarioInput,
} from '@nasj/contracts';

const fields: {
  key: Exclude<keyof FinancialScenarioInput, 'compensationMode'>;
  label: string;
  unit: string;
}[] = [
  { key: 'quantity', label: 'Order quantity', unit: 'pieces, 0–1,000,000' },
  { key: 'sellingPrice', label: 'Buyer unit selling price', unit: 'TND / piece' },
  { key: 'unitCompensation', label: 'Artisan unit compensation', unit: 'TND / piece; unit mode' },
  { key: 'hourlyRate', label: 'Artisan hourly rate', unit: 'TND / hour; hourly mode' },
  { key: 'effortMinutes', label: 'Labor effort per piece', unit: 'whole minutes, 0–100,000' },
  { key: 'materialPerUnit', label: 'Materials per piece', unit: 'TND / piece' },
  { key: 'qaPerUnit', label: 'QA per piece', unit: 'TND / piece' },
  { key: 'packagingPerUnit', label: 'Packaging per piece', unit: 'TND / piece' },
  { key: 'transportFixed', label: 'Fixed transport per order', unit: 'TND' },
  { key: 'overheadFixed', label: 'Fixed overhead per order', unit: 'TND' },
  { key: 'contingencyPercent', label: 'Contingency on all costs', unit: 'percent, 0–100' },
  { key: 'rejectionPercent', label: 'Expected rejection', unit: 'percent, 0–100' },
];
type Result = ReturnType<typeof calculateFinancialScenario>;
function ModelResult({
  name,
  result,
  error,
  baseline,
}: {
  name: string;
  result?: Result;
  error?: string;
  baseline?: Result;
}) {
  const items = result
    ? ([
        ['Expected buyer revenue', result.revenue],
        ['Direct artisan compensation', result.artisanCompensation],
        ['Materials', result.materials],
        ['QA', result.qa],
        ['Packaging', result.packaging],
        ['Logistics', result.transport],
        ['Overheads', result.overhead],
        ['Contingency', result.contingency],
        ['Total modeled costs', result.costs],
        ['Planned contribution', result.contribution],
      ] as const)
    : [];
  return (
    <article
      className="rounded-2xl border border-current/15 p-4 min-w-0"
      aria-label={`${name} scenario`}
    >
      <h3 className="text-xl font-semibold">{name}</h3>
      <p className="text-sm">SYNTHETIC assumptions · TND</p>
      {error && <p role="alert">{error} Results withheld until all inputs are valid.</p>}
      {result && (
        <>
          <dl className="my-4 space-y-2">
            {items.map(([label, value]) => (
              <div className="flex justify-between gap-3 text-sm" key={label}>
                <dt>{label}</dt>
                <dd className="font-mono text-right">{signedScenarioTnd(value)}</dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>Contribution: {scenarioPercentage(result.contributionBasisPoints)}</strong>
          </p>
          <p>
            Estimated break-even:{' '}
            {result.breakEvenQuantity === null
              ? 'UNAVAILABLE — nonpositive unit margin'
              : `${result.breakEvenQuantity} pieces`}
          </p>
          <p>Modeled producer share: {scenarioPercentage(result.producerShareBasisPoints)}</p>
          <p>
            Estimated effective pay:{' '}
            {result.effectiveHourlyMillimes === null
              ? 'UNAVAILABLE — zero effort or quantity'
              : `${signedScenarioTnd(result.effectiveHourlyMillimes)} TND/hour`}
          </p>
          {baseline && (
            <p className="mt-2">
              Contribution difference from baseline:{' '}
              {signedScenarioTnd(result.contribution - baseline.contribution)} TND
            </p>
          )}
        </>
      )}
    </article>
  );
}
export function FinancialSimulator({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [input, setInput] = useState<FinancialScenarioInput>({
    ...financialScenarioPresets.Baseline,
  });
  let custom: Result | undefined;
  let error: string | undefined;
  try {
    custom = calculateFinancialScenario(input);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : 'Invalid assumptions.';
  }
  const presets = Object.entries(financialScenarioPresets).map(([name, value]) => ({
    name,
    result: calculateFinancialScenario(value),
  }));
  const baseline = presets[0].result;
  const chart = [...presets, ...(custom ? [{ name: 'Custom', result: custom }] : [])];
  const largest = chart.reduce((max, row) => {
    const value = row.result.contribution < 0n ? -row.result.contribution : row.result.contribution;
    if (value > max) return value;
    return max;
  }, 1n);
  const controls = (
    <>
      <div className="flex flex-wrap gap-3 my-4">
        {Object.entries(financialScenarioPresets).map(([name, value]) => (
          <button
            className="button secondary"
            type="button"
            key={name}
            onClick={() => setInput({ ...value })}
          >
            {name === 'Baseline' ? 'Reset to baseline' : `Load ${name.toLowerCase()}`}
          </button>
        ))}
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-0 p-0">
        <legend className="text-lg font-semibold mb-4">Custom assumptions</legend>
        <label className="flex flex-col gap-1" htmlFor={`${id}-mode`}>
          Compensation calculation
          <select
            id={`${id}-mode`}
            className="rounded border p-2 bg-transparent"
            value={input.compensationMode}
            onChange={(event) =>
              setInput({
                ...input,
                compensationMode: event.target.value as FinancialScenarioInput['compensationMode'],
              })
            }
          >
            <option value="UNIT">Agreed TND per piece</option>
            <option value="HOURLY">Hourly rate × effort minutes / 60</option>
          </select>
        </label>
        {fields.map(({ key, label, unit }) => (
          <label className="flex flex-col gap-1" key={key} htmlFor={`${id}-${key}`}>
            <span>{label}</span>
            <span className="text-sm opacity-75" id={`${id}-${key}-unit`}>
              {unit}
            </span>
            <input
              id={`${id}-${key}`}
              aria-describedby={`${id}-${key}-unit`}
              className="rounded border p-2 bg-transparent min-w-0"
              type="text"
              inputMode="decimal"
              value={input[key]}
              onChange={(event) => setInput({ ...input, [key]: event.target.value })}
            />
          </label>
        ))}
      </fieldset>
    </>
  );
  return (
    <section aria-label="Financial scenario simulator" className="space-y-6">
      <div>
        <p className="kicker">Challenge the assumptions</p>
        <h2 className="text-3xl font-semibold">Financial scenario comparison</h2>
        <p>
          Explore modeled contribution and effective pay. All presets are fictional; no quote,
          order, inventory or payable is changed. Inputs remain only in this view.
        </p>
      </div>
      {compact ? (
        <details>
          <summary className="cursor-pointer font-semibold">Change financial assumptions</summary>
          {controls}
        </details>
      ) : (
        controls
      )}
      <div aria-live="polite" aria-atomic="true">
        <ModelResult name="Custom" result={custom} error={error} baseline={baseline} />
      </div>
      <figure className="rounded-2xl border border-current/15 p-4">
        <figcaption className="font-semibold mb-3">
          Planned contribution comparison · TND · center line is zero
        </figcaption>
        <svg
          viewBox="0 0 620 220"
          role="img"
          aria-label="Calculated planned contributions, negative values extend left of zero"
          className="w-full max-h-64"
        >
          <title>Calculated synthetic contribution</title>
          <line x1="330" y1="5" x2="330" y2="210" stroke="currentColor" />
          {chart.map(({ name, result }, index) => {
            const width = Number(
              ((result.contribution < 0n ? -result.contribution : result.contribution) * 170n) /
                largest,
            );
            const negative = result.contribution < 0n;
            return (
              <g key={name}>
                <text x="5" y={30 + index * 50} fill="currentColor" fontSize="14">
                  {name}: {signedScenarioTnd(result.contribution)}
                </text>
                <rect
                  x={negative ? 330 - width : 330}
                  y={12 + index * 50}
                  width={width}
                  height="24"
                  fill={negative ? '#b93830' : '#247362'}
                />
                <text x="510" y={30 + index * 50} fill="currentColor" fontSize="12">
                  {negative ? 'Loss' : 'Contribution'}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-sm">
          Each bar uses the calculated contribution printed alongside it. Negative contribution
          remains visible.
        </p>
      </figure>
      {compact ? (
        <details>
          <summary className="cursor-pointer font-semibold">Compare all scenario totals</summary>
          <div className="grid gap-4 md:grid-cols-3 mt-4">
            {presets.map(({ name, result }) => (
              <ModelResult key={name} name={name} result={result} />
            ))}
          </div>
        </details>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {presets.map(({ name, result }) => (
            <ModelResult key={name} name={name} result={result} />
          ))}
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          Formulas, rounding and evidence limits
        </summary>
        <div className="space-y-3 mt-3 text-sm">
          <p>
            All TND inputs use exact bigint millimes (maximum 1,000,000 TND each). Quantity is whole
            pieces. Percentages allow two decimal places. No tax or interest is inferred.
          </p>
          <p>
            Expected revenue = quantity × selling price × (1 − rejection%). This is a revenue
            haircut for expected unsold pieces, not a refund or actual buyer acceptance. All
            produced pieces retain full artisan compensation, materials, QA and packaging costs,
            including rejected pieces.
          </p>
          <p>
            In hourly mode, compensation per piece = hourly rate × effort minutes / 60, rounded
            HALF_UP to a millime once. In unit mode it is the entered agreed amount. Effective
            pay/hour = unit compensation × 60 / effort minutes. Effort is an unmeasured assumption;
            this is neither verified income nor a fairness threshold.
          </p>
          <p>
            Variable costs = quantity × (artisan compensation + materials + QA + packaging). Fixed
            costs = transport + overhead. Contingency = (variable + fixed costs) × contingency%.
            Contribution = expected revenue − all modeled costs. Revenue and contingency round
            HALF_UP once to a millime; signed percentages round HALF_UP to 0.01%.
          </p>
          <p>
            Estimated break-even = ceiling(fixed costs × (1 + contingency%) / (selling price × (1 −
            rejection%) − variable unit cost × (1 + contingency%))). It is the continuous planning
            threshold before revenue/contingency millime rounding, not an order commitment. It is
            undefined when the unit margin is nonpositive.
          </p>
          <p>
            Modeled producer share uses agreed compensation / modeled net quotation revenue, with
            zero refunds. This reuses the agreed-not-paid producer-share denominator and rounding. A
            hypothetical cohort of three fictional artisans meets the public policy minimum; no real
            small-group information is disclosed. Ratios above the public policy ceiling of 1000%
            are shown as model arithmetic only and cannot be published by that policy. Zero revenue
            makes contribution percentage and producer share undefined; losses remain shown in TND.
          </p>
        </div>
      </details>
    </section>
  );
}
