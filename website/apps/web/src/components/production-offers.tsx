'use client';
import { useId } from 'react';
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
  useFieldError,
  useResource,
} from './workspace-ui';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

const root = '/api/v1/procurement';
const tunis = (value: string) => (value ? new Date(`${value}:00+01:00`).toISOString() : value);
function key() {
  return crypto.randomUUID();
}
async function post<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body, idempotencyKey: key() });
}
function LongText({ name, label }: { name: string; label: string }) {
  const id = useId();
  const errors = useFieldError(name);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        required
        rows={3}
        minLength={2}
        maxLength={2000}
        aria-invalid={errors.length ? true : undefined}
      />
    </div>
  );
}
function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="commerce-facts">
      {rows.map(([label, value]) => (
        <span key={label} className="contents">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </span>
      ))}
    </dl>
  );
}
export function ProductionPanel({ orderId }: { orderId: string }) {
  const resource = useResource<C.ProductionWorkspace>(`${root}/orders/${orderId}/production`);
  const data = resource.data;
  return (
    <div>
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Production commitment summary</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Eligibility is a review of who may be suitable. It is not a commitment. An offer is
                proposed work until the artisan accepts it.
              </p>
              <Facts
                rows={[
                  ['Required quantity', String(data.summary.required)],
                  ['Prepared quantity', String(data.summary.prepared)],
                  ['Reserved quantity', String(data.summary.reserved)],
                  ['Accepted quantity', String(data.summary.accepted)],
                  ['Uncovered quantity', String(data.summary.uncovered)],
                  ['Declined offers', String(data.summary.declined)],
                  ['Expired offers', String(data.summary.expired)],
                ]}
              />
              {data.summary.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Eligibility for {humanize(data.summary.craftSkillId)}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Results use craft, participation, the production period and known capacity. Unknown
                capacity is not treated as available. Health and wearable data are not used.
              </p>
              <ActionForm
                label="Assess eligibility"
                action={(form) =>
                  post(`${root}/orders/${orderId}/eligibility-assessments`, {
                    version: data.summary.orderVersion,
                    restrictionsReviewed: form.get('restrictionsReviewed') === 'on',
                    ...(text(form, 'restrictionSource')
                      ? { restrictionSource: text(form, 'restrictionSource') }
                      : {}),
                    ...(text(form, 'equipment') ? { equipment: text(form, 'equipment') } : {}),
                  })
                }
                onSuccess={resource.reload}
              >
                <label className="field">
                  <input name="restrictionsReviewed" type="checkbox" /> I reviewed the product
                  requirements and no further restriction is recorded
                </label>
                <Input name="restrictionSource" label="Restriction review source" />
                <Input name="equipment" label="Required equipment, if any" />
              </ActionForm>
              {!data.assessments.length && <p>No eligibility assessment yet.</p>}
              {data.assessments.map((row) => (
                <article key={row.id} aria-label={`${row.decision} ${row.displayName}`}>
                  <h3>
                    {humanize(row.decision)} · {row.displayName}
                  </h3>
                  <Facts
                    rows={[
                      ['Association', row.associationName ?? 'Independent participation'],
                      ['Account', row.accountLinked ? 'Linked account' : 'No digital account'],
                      ['Known remaining', row.knownRemaining ?? 'Unknown'],
                      ['Unit', row.unitType ?? 'Unknown'],
                      [
                        'Production period',
                        row.periodFrom
                          ? `${new Date(row.periodFrom).toLocaleDateString()} to ${new Date(row.periodTo ?? row.periodFrom).toLocaleDateString()}`
                          : 'Unknown',
                      ],
                    ]}
                  />
                  <ul>
                    {row.reasons.map((reason) => (
                      <li key={reason.code}>
                        {humanize(reason.code)}: {reason.detail}
                      </li>
                    ))}
                  </ul>
                  {row.decision === 'ELIGIBLE' && (
                    <ActionForm
                      label={`Save offer for ${row.displayName}`}
                      action={(form) =>
                        post(`${root}/orders/${orderId}/offers`, {
                          version: data.summary.orderVersion,
                          eligibilityId: row.id,
                          quantity: Number(text(form, 'quantity')),
                          expiresAt: tunis(text(form, 'expiresAt')),
                          materials: text(form, 'materials'),
                          reworkTerms: text(form, 'reworkTerms'),
                          paymentConditions: text(form, 'paymentConditions'),
                          collectionArrangement: text(form, 'collectionArrangement'),
                          instructions: text(form, 'instructions'),
                        })
                      }
                      onSuccess={resource.reload}
                    >
                      <Input name="quantity" label="Offer quantity" type="number" required />
                      <Input
                        name="expiresAt"
                        label="Offer expires"
                        type="datetime-local"
                        required
                      />
                      <LongText name="materials" label="Materials responsibility" />
                      <LongText name="reworkTerms" label="Quality and rework" />
                      <LongText name="paymentConditions" label="Payment conditions" />
                      <LongText name="collectionArrangement" label="Collection arrangement" />
                      <LongText name="instructions" label="Instructions" />
                      <p>
                        Compensation is calculated from the approved artisan-labor cost. A lower
                        rate cannot be entered here. Saving a draft does not reserve capacity.
                      </p>
                    </ActionForm>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Production offers</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data.offers.length && <p>No production offers yet.</p>}
              {data.offers.map((offer) => (
                <article key={offer.id} aria-label={`Offer ${offer.displayName} ${offer.status}`}>
                  <h3>
                    {offer.displayName} · {humanize(offer.status)}
                  </h3>
                  <Facts
                    rows={[
                      ['Quantity', `${offer.quantity} pieces`],
                      ['Unit pay', `${offer.unitPayTnd} TND`],
                      ['Total pay', `${offer.totalPayTnd} TND`],
                      ['Compensation', offer.compensationMethod ?? 'Recorded on the offer'],
                      ['Estimated effort', `${offer.estimatedHours} hours`],
                      ['Expires', new Date(offer.expiresAt).toLocaleString()],
                      ['Decision', humanize(offer.decisionState)],
                    ]}
                  />
                  {offer.status === 'PREPARED' && (
                    <ActionForm
                      label={`Issue offer to ${offer.displayName}`}
                      confirm="Issue this offer and reserve the quantity?"
                      action={() =>
                        post(`${root}/offers/${offer.id}/issue`, { version: offer.version })
                      }
                      onSuccess={resource.reload}
                    />
                  )}
                </article>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
export function CoordinatorOffers() {
  const resource = useResource<{
    verificationPolicy: string;
    offers: C.ProductionOfferView[];
  }>(`${root}/assigned-offers`);
  const data = resource.data;
  return (
    <Workspace
      title="Assigned production offers"
      description="Explain the offer in person. Recording a report does not accept the work."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {data && (
        <>
          <p>
            Verification status: {humanize(data.verificationPolicy)}. Final assisted acceptance is
            blocked until an approved verification method exists.
          </p>
          {!data.offers.length && <p>No offers for your currently assigned artisans.</p>}
          {data.offers.map((offer) => (
            <Card key={offer.id} role="article" aria-label={`${offer.displayName} ${offer.status}`}>
              <CardHeader>
                <CardTitle>
                  <h2>
                    {offer.displayName} · {humanize(offer.status)}
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Facts
                  rows={[
                    ['Quantity', `${offer.quantity} pieces`],
                    ['Unit pay', `${offer.unitPayTnd} TND`],
                    ['Total pay', `${offer.totalPayTnd} TND`],
                    ['Effort', `${offer.estimatedHours} hours`],
                    ['Deadline', new Date(offer.deliveryAt).toLocaleString()],
                    ['Expires', new Date(offer.expiresAt).toLocaleString()],
                    ['Materials', offer.materials],
                    ['Quality', offer.reworkTerms],
                    ['Payment', offer.paymentConditions],
                    ['Collection', offer.collectionArrangement ?? 'Not recorded'],
                    ['Follow-up', humanize(offer.decisionState)],
                  ]}
                />
                {offer.preferredLanguage !== 'en' && (
                  <p>
                    These terms are recorded in English. A reviewed translation is not available.
                    The preferred language on the artisan profile is {offer.preferredLanguage}.
                  </p>
                )}
                <p>Declining has no penalty and does not change unrelated access.</p>
                {offer.assisted && (
                  <p>
                    Reported {humanize(offer.assisted.reportedDecision)} by the recording
                    coordinator. This is not acceptance. Verification remains{' '}
                    {humanize(offer.assisted.verificationStatus)}.
                  </p>
                )}
                {offer.status === 'OFFERED' && !offer.assisted && (
                  <ActionForm
                    label={`Record reported decision for ${offer.displayName}`}
                    action={(form) =>
                      post(`${root}/offers/${offer.id}/assisted-decisions`, {
                        version: offer.version,
                        decision: text(form, 'decision'),
                        evidenceReference: text(form, 'evidenceReference'),
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Select
                      name="decision"
                      label="Reported artisan choice"
                      options={[
                        { value: 'ACCEPT', label: 'Accept' },
                        { value: 'DECLINE', label: 'Decline' },
                      ]}
                      required
                    />
                    <Input name="evidenceReference" label="Confirmation reference" required />
                  </ActionForm>
                )}
                {offer.assisted && (
                  <ActionForm
                    label="Request verification"
                    action={() =>
                      apiFetch(
                        `${root}/offers/${offer.id}/assisted-decisions/${offer.assisted?.id}/verify`,
                        {
                          method: 'POST',
                          body: {},
                        },
                      )
                    }
                    onSuccess={resource.reload}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Workspace>
  );
}
