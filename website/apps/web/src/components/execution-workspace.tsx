'use client';
import Image from 'next/image';
import type * as C from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  Input,
  ResourceState,
  Select,
  Workspace,
  humanize,
  text,
  useResource,
} from './workspace-ui';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const root = '/api/v1/procurement';
function key() {
  return crypto.randomUUID();
}
async function post<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body, idempotencyKey: key() });
}
function Facts({ rows }: { rows: [string, string | number][] }) {
  return (
    <dl className="commerce-facts">
      {rows.map(([label, value]) => (
        <span key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </span>
      ))}
    </dl>
  );
}
function Summary({ summary }: { summary: C.ExecutionSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Production quantities</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p>
          Commercial status: {humanize(summary.commercialStatus)}. Production stage:{' '}
          {humanize(summary.productionStage)}.
        </p>
        <Facts
          rows={[
            ['Requested', summary.requested],
            ['Accepted commitment', summary.committed],
            ['Reported', summary.reported],
            ['Submitted', summary.submitted],
            ['Quality approved', summary.approved],
            ['Rejected', summary.rejected],
            ['Pending inspection', summary.pendingInspection],
            ['Prepared for shipment', summary.consolidated],
            ['Ready to prepare', summary.shippable],
            ['Shipped', summary.shipped],
            ['Delivered', summary.delivered],
            ['Buyer accepted', summary.buyerAccepted],
          ]}
        />
        {summary.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </CardContent>
    </Card>
  );
}
export function ExecutionOrder({ orderId }: { orderId: string }) {
  const resource = useResource<C.ExecutionView>(`${root}/orders/${orderId}/execution`);
  const data = resource.data;
  return (
    <section className="section-gap" aria-labelledby="production-execution-heading">
      <h2 id="production-execution-heading">Production execution</h2>
      <p>
        Reported production, inspection and shipment preparation stay separate. A prepared group is
        not a shipment.
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <div className="grid gap-4">
          <Summary summary={data.summary} />
          {data.revisionId && (
            <Card>
              <CardHeader>
                <CardTitle>Specification version {data.specificationVersion ?? ''}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {!data.materials.length && (
                  <ActionForm
                    label="Save material requirements"
                    action={(form) =>
                      post(`${root}/orders/${orderId}/material-lines`, {
                        revisionId: data.revisionId,
                        lines: [
                          {
                            materialCode: text(form, 'materialCode'),
                            name: text(form, 'materialName'),
                            unit: text(form, 'unit'),
                            perItemMilli: Number(text(form, 'perItemMilli')),
                            wastageBps: Number(text(form, 'wastageBps') || 0),
                          },
                        ],
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <p>These are requirements, not a record that materials were received.</p>
                    <Input name="materialCode" label="Material code" required />
                    <Input name="materialName" label="Material name" required />
                    <Select
                      name="unit"
                      label="Material unit"
                      options={['METERS', 'PIECES', 'UNITS']}
                      required
                    />
                    <Input
                      name="perItemMilli"
                      label="Thousandths per finished piece"
                      type="number"
                      min="1"
                      required
                    />
                    <Input
                      name="wastageBps"
                      label="Wastage basis points (0 to 1000)"
                      type="number"
                      min="0"
                      max="1000"
                      value="0"
                    />
                  </ActionForm>
                )}
                {data.materials.map((line) => (
                  <p key={line.materialCode}>
                    {line.name}: {line.perItem} {humanize(line.unit).toLowerCase()} per piece,{' '}
                    {line.required} for the reviewed quantity. Readiness: {humanize(line.readiness)}
                    .
                  </p>
                ))}
                {!data.criteria.length && (
                  <ActionForm
                    label="Save inspection checklist"
                    action={(form) =>
                      post(`${root}/orders/${orderId}/inspection-criteria`, {
                        revisionId: data.revisionId,
                        criteria: [
                          {
                            code: text(form, 'criterionCode'),
                            description: text(form, 'description'),
                            expected: text(form, 'expected'),
                            tolerance: text(form, 'tolerance'),
                            required: form.get('required') === 'on',
                            evidenceRequired: false,
                          },
                        ],
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Input name="criterionCode" label="Criterion code" required />
                    <Input name="description" label="What to inspect" required />
                    <Input name="expected" label="Expected result" required />
                    <Input name="tolerance" label="Tolerance" />
                    <label>
                      <input name="required" type="checkbox" defaultChecked /> Required criterion
                    </label>
                  </ActionForm>
                )}
                {data.criteria.map((row) => (
                  <p key={row.id}>
                    {row.description}: {row.expected}
                    {row.required ? ' (required)' : ''}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
          {data.batches.map((batch) => (
            <Card
              key={batch.id}
              role="article"
              aria-label={`Batch ${batch.artisanName ?? batch.id} ${batch.status}`}
            >
              <CardHeader>
                <CardTitle>
                  {batch.artisanName} · {humanize(batch.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Facts
                  rows={[
                    ['Accepted pieces', batch.quantity],
                    ['Reported', batch.produced],
                    ['Submitted', batch.submitted],
                    ['Quality approved', batch.approved],
                    ['Rejected', batch.rejected],
                    ['Pending inspection', batch.pending],
                    ['Prepared for shipment', batch.consolidated],
                  ]}
                />
                {batch.blockers.map((blocker) => (
                  <p key={blocker}>Blocked: {humanize(blocker)}.</p>
                ))}
                {batch.status === 'ACCEPTED' && (
                  <ActionForm
                    label={`Release ${batch.artisanName ?? 'batch'}`}
                    confirm="Release this accepted batch with a synthetic funding and material attestation?"
                    action={(form) => {
                      if (form.get('attest') !== 'on')
                        throw new Error('Confirm the synthetic attestation.');
                      return post(`${root}/batches/${batch.id}/release`, {
                        version: batch.version,
                        fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
                        materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
                      });
                    }}
                    onSuccess={resource.reload}
                  >
                    <label>
                      <input name="attest" type="checkbox" required /> This is a synthetic
                      demonstration. It is not buyer payment and it is not physical material
                      receipt.
                    </label>
                  </ActionForm>
                )}
                {batch.status === 'SUBMITTED' && data.criteria[0] && (
                  <ActionForm
                    label={`Record inspection for ${batch.artisanName ?? 'batch'}`}
                    confirm="Save this inspection? Rejected pieces stay out of shipment preparation."
                    action={(form) =>
                      post(`${root}/batches/${batch.id}/inspections`, {
                        version: batch.version,
                        approved: Number(text(form, 'approved')),
                        rejected: Number(text(form, 'rejected')),
                        pending: Number(text(form, 'pending')),
                        defectReason: text(form, 'defectReason'),
                        results: [
                          {
                            criterionId: data.criteria[0].id,
                            outcome: text(form, 'outcome'),
                            note: text(form, 'note'),
                          },
                        ],
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <p>
                      Approved, rejected and pending must equal {batch.submitted} submitted pieces.
                    </p>
                    <Input
                      name="approved"
                      label="Approved pieces"
                      type="number"
                      min="0"
                      max={String(batch.submitted)}
                      required
                    />
                    <Input name="rejected" label="Rejected pieces" type="number" min="0" required />
                    <Input name="pending" label="Pending pieces" type="number" min="0" required />
                    <Input name="defectReason" label="Defect reason" />
                    <Select
                      name="outcome"
                      label={`${data.criteria[0].description} result`}
                      options={['PASS', 'FAIL']}
                      required
                    />
                    <Input name="note" label="Inspection note" />
                  </ActionForm>
                )}
                {batch.status === 'INSPECTION' && batch.rejected > 0 && data.criteria[0] && (
                  <ActionForm
                    label={`Reinspect rejected pieces for ${batch.artisanName ?? 'batch'}`}
                    action={(form) =>
                      post(`${root}/batches/${batch.id}/reinspections`, {
                        version: batch.version,
                        scope: Number(text(form, 'scope')),
                        approved: Number(text(form, 'approved')),
                        rejected: Number(text(form, 'rejected')),
                        pending: Number(text(form, 'pending')),
                        defectReason: text(form, 'defectReason'),
                        results: [
                          {
                            criterionId: data.criteria[0].id,
                            outcome: text(form, 'outcome'),
                            note: 'Synthetic reinspection note',
                          },
                        ],
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <p>
                      Reinspection does not add newly manufactured pieces. Scope cannot exceed{' '}
                      {batch.rejected} rejected pieces.
                    </p>
                    <Input
                      name="scope"
                      label="Rejected pieces reinspected"
                      type="number"
                      min="1"
                      max={String(batch.rejected)}
                      required
                    />
                    <Input
                      name="approved"
                      label="Approved from this scope"
                      type="number"
                      min="0"
                      required
                    />
                    <Input name="rejected" label="Still rejected" type="number" min="0" required />
                    <Input
                      name="pending"
                      label="Pending from this scope"
                      type="number"
                      min="0"
                      required
                    />
                    <Input name="defectReason" label="Defect reason" />
                    <Select
                      name="outcome"
                      label="Reinspection result"
                      options={['PASS', 'FAIL']}
                      required
                    />
                  </ActionForm>
                )}
                {batch.shippable > 0 && (
                  <ActionForm
                    label={`Prepare approved pieces for ${batch.artisanName ?? 'batch'}`}
                    confirm="Prepare these approved pieces? This does not ship them."
                    action={(form) =>
                      post(`${root}/orders/${orderId}/consolidations`, {
                        items: [{ batchId: batch.id, quantity: Number(text(form, 'quantity')) }],
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Input
                      name="quantity"
                      label="Approved pieces to prepare"
                      type="number"
                      min="1"
                      max={String(batch.shippable)}
                      required
                    />
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ))}
          {!data.batches.length && <p>No accepted production batches yet.</p>}
        </div>
      )}
    </section>
  );
}
function WorkList({ title, path, assisted }: { title: string; path: string; assisted: boolean }) {
  const resource = useResource<{ items: C.WorkInstruction[] }>(path);
  const items = resource.data?.items ?? [];
  return (
    <Workspace
      title={title}
      description={
        assisted
          ? 'Record progress only for artisans assigned to you. Recording progress is not artisan acceptance and not quality approval.'
          : 'Your accepted batches, versioned instructions, and cumulative progress. Reported pieces are not quality-approved.'
      }
    >
      <ResourceState {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && !items.length && (
        <p>No production work is assigned.</p>
      )}
      {items.map((item) => (
        <Card
          key={item.batchId}
          role="article"
          aria-label={`Work ${item.productTitle} ${item.status}`}
        >
          <CardHeader>
            <CardTitle>{item.productTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {assisted && (
              <p>
                You are recording this for the artisan. This is not a submission from the
                artisan&apos;s own account.
              </p>
            )}
            {!assisted && <ObservedProductionTime batchId={item.batchId} />}
            {item.progressSource === 'COORDINATOR' && (
              <p>The latest progress was recorded by a coordinator.</p>
            )}
            {item.translationNotice && <p role="status">{item.translationNotice}</p>}
            {item.instructionAmendment && <p role="note">{item.instructionAmendment}</p>}
            <button type="button" className="instruction-print" onClick={() => window.print()}>
              Print approved instructions
            </button>
            <Facts
              rows={[
                ['Status', humanize(item.status)],
                ['Quantity', `${item.quantity} ${item.unit.toLowerCase()}`],
                ['Deadline', new Date(item.deadline).toLocaleDateString()],
                ['Specification version', item.specificationVersion ?? 'Missing'],
                ['Reported', item.produced],
                ['Quality approved', item.approved],
                ['Rejected', item.rejected],
                [
                  'Compensation',
                  item.compensationTnd ? `${item.compensationTnd} TND` : 'Restricted',
                ],
              ]}
            />
            <p>{item.specification}</p>
            <p lang={item.termsLanguage} dir={item.termsLanguage === 'ar' ? 'rtl' : undefined}>
              {item.instructions}
            </p>
            {!item.materials.length && <p>Material requirements are not on file.</p>}
            {item.materials.map((line) => (
              <p key={line.materialCode}>
                {line.name}: {line.required} {humanize(line.unit).toLowerCase()}.{' '}
                {humanize(line.readiness)}.
              </p>
            ))}
            {!item.qualityCriteria.length && <p>Quality checklist is not on file.</p>}
            {item.qualityCriteria.map((row) => (
              <p key={row.id}>
                {row.description}. Expected: {row.expected}.
              </p>
            ))}
            {!item.images.length && <p>No reference images are on file.</p>}
            {item.images.map((image) => (
              <figure key={image.sha256} className="instruction-figure">
                {image.dataUrl ? (
                  <Image
                    unoptimized
                    src={image.dataUrl}
                    alt={image.caption}
                    width={480}
                    height={320}
                  />
                ) : (
                  <p>Approved image unavailable: {image.filename}</p>
                )}
                <figcaption>{image.caption}</figcaption>
              </figure>
            ))}
            <p>Support: {item.supportContact}.</p>
            {item.flags.map((flag) => (
              <p key={flag.id}>Flagged report: {flag.reason}</p>
            ))}
            {item.status === 'MATERIAL_READY' && (
              <ActionForm
                label="Start this batch"
                action={() =>
                  post(`${root}/batches/${item.batchId}/start`, { version: item.version })
                }
                onSuccess={resource.reload}
              />
            )}
            {item.status === 'IN_PROGRESS' && (
              <>
                <ActionForm
                  label="Save cumulative progress"
                  action={(form) =>
                    post(`${root}/batches/${item.batchId}/progress`, {
                      version: item.version,
                      produced: Number(text(form, 'produced')),
                      occurredAt: new Date().toISOString(),
                      note: text(form, 'note'),
                    })
                  }
                  onSuccess={resource.reload}
                >
                  <p>Enter the total pieces finished so far, including pieces already reported.</p>
                  <Input
                    name="produced"
                    label="Total pieces produced so far"
                    type="number"
                    min={String(item.produced)}
                    max={String(item.quantity)}
                    required
                  />
                  <Input name="note" label="Note" />
                </ActionForm>
                <ActionForm
                  label="Submit reported pieces for inspection"
                  confirm="Submit the reported total for inspection?"
                  action={() =>
                    post(`${root}/batches/${item.batchId}/submit`, { version: item.version })
                  }
                  onSuccess={resource.reload}
                />
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </Workspace>
  );
}
export function MyProduction() {
  return <WorkList title="Your production work" path={`${root}/my-batches`} assisted={false} />;
}
export function CoordinatorProduction() {
  return <WorkList title="Assigned production work" path={`${root}/assigned-batches`} assisted />;
}

function ObservedProductionTime({ batchId }: { batchId: string }) {
  type TimeRow = {
    id: string;
    periodFrom: string;
    periodTo: string;
    observedMinutes: number | null;
    observedUnits: number;
    unitContext: string;
    provenance: string;
    evidence: string;
    consented: boolean;
    correctionOfId: string | null;
    superseded: boolean;
  };
  const history = useResource<{ items: TimeRow[] }>(
    `/api/v1/intelligence/batches/${batchId}/time-records`,
  );
  const earnings = useResource<{
    compensation: { agreed: string; earned: string; simulatedPaid: string; verifiedPaid: string };
    estimate: { status: string; reason?: string | null; hourlyTnd?: string | null };
  }>(`/api/v1/intelligence/batches/${batchId}/earnings`);
  return (
    <details className="production-time-report">
      <summary>Voluntary observed time and earnings</summary>
      <p>
        Reporting time is optional and requires your consent. No wearable reading is used. A
        correction preserves the original record. Unknown time does not become zero.
      </p>
      <ResourceState loading={history.loading} error={history.error} retry={history.reload} />
      <ResourceState loading={earnings.loading} error={earnings.error} retry={earnings.reload} />
      {earnings.data && (
        <>
          <Facts
            rows={[
              ['Agreed compensation', `${earnings.data.compensation.agreed} TND`],
              ['Recognized earned compensation', `${earnings.data.compensation.earned} TND`],
              ['Simulated settlement', `${earnings.data.compensation.simulatedPaid} TND`],
              ['Verified paid', `${earnings.data.compensation.verifiedPaid} TND`],
            ]}
          />
          <p>
            Hourly estimate:{' '}
            {earnings.data.estimate.status === 'AVAILABLE'
              ? `${earnings.data.estimate.hourlyTnd ?? 'Unavailable'} TND/hour`
              : `Unavailable. ${earnings.data.estimate.reason ?? 'Consented measured time with complete unit coverage is required.'}`}
          </p>
        </>
      )}
      <ActionForm
        label="Record consented production time"
        action={(form) =>
          apiFetch(`/api/v1/intelligence/batches/${batchId}/time-records`, {
            method: 'POST',
            idempotencyKey: crypto.randomUUID(),
            body: {
              consented: form.get('consented') === 'on',
              periodFrom: new Date(text(form, 'periodFrom')).toISOString(),
              periodTo: new Date(text(form, 'periodTo')).toISOString(),
              unitContext: text(form, 'unitContext'),
              observedMinutes: text(form, 'observedMinutes')
                ? Number(text(form, 'observedMinutes'))
                : null,
              observedUnits: Number(text(form, 'observedUnits') || '0'),
              evidence: text(form, 'evidence'),
              provenance: text(form, 'provenance'),
              ...(text(form, 'correctionOfId')
                ? { correctionOfId: text(form, 'correctionOfId') }
                : {}),
            },
          })
        }
        onSuccess={async () => {
          await Promise.all([history.reload(), earnings.reload()]);
        }}
      >
        <Input name="periodFrom" label="Observed period start" type="datetime-local" required />
        <Input name="periodTo" label="Observed period end" type="datetime-local" required />
        <Input
          name="observedMinutes"
          label="Observed minutes (leave blank when unknown)"
          type="number"
          min="1"
        />
        <Input
          name="observedUnits"
          label="Units covered by this time record"
          type="number"
          min="0"
          required
        />
        <Input name="unitContext" label="Task and unit context" required />
        <Select
          name="evidence"
          label="Time evidence class"
          options={[
            { value: 'SYNTHETIC', label: 'Synthetic demonstration observation' },
            { value: 'OBSERVED', label: 'Personally observed duration' },
          ]}
        />
        <Input name="provenance" label="Observation source and evidence reference" required />
        <Select
          name="correctionOfId"
          label="Correct an existing record (optional)"
          options={[
            { value: '', label: 'New reporting period' },
            ...(history.data?.items
              .filter((row) => !row.superseded)
              .map((row) => ({
                value: row.id,
                label: `${row.periodFrom}: ${row.observedMinutes ?? 'unknown'} minutes`,
              })) ?? []),
          ]}
        />
        <label>
          <input type="checkbox" name="consented" required />I consent to reporting this time for
          this batch.
        </label>
      </ActionForm>
      {!!history.data?.items.length && (
        <ul aria-label="Production time correction history">
          {history.data.items.map((row) => (
            <li key={row.id}>
              {row.periodFrom} to {row.periodTo}: {row.observedMinutes ?? 'Unknown'} minutes for{' '}
              {row.observedUnits} units. {row.evidence}.{' '}
              {row.superseded
                ? 'Preserved original, corrected by a later record.'
                : 'Current record.'}{' '}
              Source: {row.provenance}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
