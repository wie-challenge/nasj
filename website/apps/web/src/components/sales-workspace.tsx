'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  Input,
  Choice,
  ResourceState,
  Workspace,
  useResource,
  text,
  humanize,
} from './workspace-ui';
type Details = {
  stageProvenance?: string;
  acceptedOrderId?: string;
  segment: string;
  needs: string;
  qualificationNotes: string;
  status: string;
  ownerId: string;
  nextAction: string;
  followUpAt: string | null;
  contactBasis: string;
  basisEvidence: string;
  contactReviewAt: string;
  reason: string;
};
type Proposal = {
  id: string;
  groupId: string;
  version: number;
  snapshot: Record<string, string | number | null>;
};
type Prospect = {
  id: string;
  version: number;
  snapshot: Details;
  organization: { name: string; approvalStatus: string; contactEmail: string | null };
  contactAllowed: boolean;
  revisions: { id: string; version: number; snapshot: Details }[];
  proposals: Proposal[];
};
type View = {
  organizationIds: string[];
  owners: { id: string; name: string; organizationId: string }[];
  prospects: Prospect[];
};
const post = (path: string, body: unknown) =>
  apiFetch(`/api/v1/sales${path}`, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
const iso = (value: string) => (value ? new Date(value).toISOString() : null);
const localDate = (value: string | null | undefined) =>
  value
    ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : undefined;
function details(f: FormData) {
  return {
    segment: text(f, 'segment'),
    needs: text(f, 'needs'),
    qualificationNotes: text(f, 'qualificationNotes'),
    status: text(f, 'status'),
    ownerId: text(f, 'ownerId'),
    nextAction: text(f, 'nextAction'),
    followUpAt: iso(text(f, 'followUpAt')),
    contactBasis: text(f, 'contactBasis'),
    basisEvidence: text(f, 'basisEvidence'),
    contactReviewAt: iso(text(f, 'contactReviewAt')),
    reason: text(f, 'reason'),
  };
}
function Fields({ data, owners }: { data?: Details; owners: View['owners'] }) {
  return (
    <>
      <Input name="segment" label="Commercial segment" value={data?.segment} required />
      <Input name="needs" label="Buyer needs" value={data?.needs} required />
      <Input
        name="qualificationNotes"
        label="Qualification notes"
        value={data?.qualificationNotes}
        required
      />
      <Choice name="status" label="Qualification stage" defaultValue={data?.status ?? 'LEAD'}>
        {(data?.status === 'CONTRACTED'
          ? ['CONTRACTED']
          : ['LEAD', 'QUALIFIED', 'PROPOSAL', 'LOST']
        ).map((v) => (
          <option key={v} value={v}>
            {humanize(v)}
          </option>
        ))}
      </Choice>
      <Choice name="ownerId" label="Sales owner" defaultValue={data?.ownerId}>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Choice>
      <Input name="nextAction" label="Next action" value={data?.nextAction} required />
      <Input
        name="followUpAt"
        label="Follow-up date"
        type="datetime-local"
        value={localDate(data?.followUpAt)}
      />
      <Choice
        name="contactBasis"
        label="Contact permission basis"
        defaultValue={data?.contactBasis ?? 'CONSENT'}
      >
        {['CONSENT', 'DOCUMENTED_OTHER_BASIS', 'DO_NOT_CONTACT'].map((v) => (
          <option key={v} value={v}>
            {humanize(v)}
          </option>
        ))}
      </Choice>
      <Input
        name="basisEvidence"
        label="Permission evidence"
        value={data?.basisEvidence}
        required
      />
      <Input
        name="contactReviewAt"
        label="Contact permission review date"
        type="datetime-local"
        value={localDate(data?.contactReviewAt)}
        required
      />
      <Input name="reason" label="Change reason" required />
    </>
  );
}
export function SalesWorkspace() {
  const r = useResource<View>('/api/v1/sales');
  return (
    <Workspace
      title="Commercial pipeline"
      description="Qualification and pilot proposals. Discovery is not buyer verification; a proposal creates no production or payment commitment."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data && (
        <>
          <details>
            <summary>Add prospect organization</summary>
            <ActionForm
              label="Create prospect"
              onSuccess={r.reload}
              action={(f) =>
                post('/prospects', {
                  ...details(f),
                  operatorOrganizationId: text(f, 'operatorOrganizationId'),
                  ...(text(f, 'buyerOrganizationId')
                    ? { buyerOrganizationId: text(f, 'buyerOrganizationId') }
                    : {
                        organizationName: text(f, 'organizationName'),
                        ...(text(f, 'contactEmail')
                          ? { contactEmail: text(f, 'contactEmail') }
                          : {}),
                      }),
                })
              }
            >
              <Choice name="operatorOrganizationId" label="Sales organization">
                {r.data.organizationIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </Choice>
              <Input name="organizationName" label="New prospect organization name" />
              <Input
                name="buyerOrganizationId"
                label="Existing assigned buyer reference (instead of new name)"
              />
              <Input name="contactEmail" label="Permitted contact email" type="email" />
              <Fields owners={r.data.owners} />
            </ActionForm>
          </details>
          {!r.data.prospects.length && <p>No prospects in your authorized sales organizations.</p>}
          {r.data.prospects.map((p) => (
            <section key={p.id} className="section-gap">
              <h2>{p.organization.name}</h2>
              <p>
                {humanize(p.snapshot.status)} · version {p.version} · buyer verification:{' '}
                {humanize(p.organization.approvalStatus)}
              </p>
              {p.snapshot.stageProvenance && (
                <p>
                  Customer stage source: {p.snapshot.stageProvenance}. Accepted order:{' '}
                  {p.snapshot.acceptedOrderId}. No legal signature or payment verification is
                  inferred.
                </p>
              )}
              <p>
                Contact:{' '}
                {p.contactAllowed
                  ? (p.organization.contactEmail ?? 'No contact recorded')
                  : 'Unavailable: permission expired or contact declined'}
              </p>
              <p>
                Next: {p.snapshot.nextAction}. Follow up: {p.snapshot.followUpAt ?? 'Not scheduled'}
                .
              </p>
              <details>
                <summary>Update qualification and contact permission</summary>
                <ActionForm
                  key={p.version}
                  label="Save qualification"
                  onSuccess={r.reload}
                  action={(f) =>
                    post(`/prospects/${p.id}`, {
                      ...details(f),
                      ...(text(f, 'organizationName')
                        ? { organizationName: text(f, 'organizationName') }
                        : {}),
                      version: p.version,
                    })
                  }
                >
                  {p.organization.approvalStatus === 'PENDING_REVIEW' && (
                    <Input
                      name="organizationName"
                      label="Correct unverified prospect organization name"
                      value={p.organization.name}
                    />
                  )}
                  <Fields data={p.snapshot} owners={r.data!.owners} />
                </ActionForm>
              </details>
              <details>
                <summary>Activity history ({p.revisions.length})</summary>
                <ol>
                  {p.revisions.map((h) => (
                    <li key={h.id}>
                      Version {h.version}: {humanize(h.snapshot.status)} — {h.snapshot.reason}
                    </li>
                  ))}
                </ol>
              </details>
              <ProposalForm prospect={p} reload={r.reload} />
              <details>
                <summary>Proposal history ({p.proposals.length})</summary>
                {p.proposals.map((v) => (
                  <p key={v.id}>
                    Version {v.version}: {humanize(String(v.snapshot.status))},{' '}
                    {v.snapshot.proposedPriceTnd} TND; {v.snapshot.reason}.{' '}
                    {v.snapshot.rfqId ? (
                      <Link href={`/procurement/rfqs/${v.snapshot.rfqId}`}>Linked RFQ</Link>
                    ) : null}
                  </p>
                ))}
              </details>
            </section>
          ))}
        </>
      )}
    </Workspace>
  );
}
function ProposalForm({ prospect: p, reload }: { prospect: Prospect; reload: () => unknown }) {
  const [revise, setRevise] = useState('');
  const previous = p.proposals.find((v) => v.id === revise);
  return (
    <details>
      <summary>Pilot proposal</summary>
      <Choice
        label="Proposal to revise"
        name="revision"
        value={revise}
        onChange={(e) => setRevise(e.target.value)}
      >
        <option value="">New proposal</option>
        {p.proposals
          .filter((v, i, a) => a.findIndex((o) => o.groupId === v.groupId) === i)
          .map((v) => (
            <option key={v.id} value={v.id}>
              {v.groupId} · version {v.version}
            </option>
          ))}
      </Choice>
      <ActionForm
        key={revise}
        label="Save proposal revision"
        onSuccess={async () => {
          await reload();
          setRevise('');
        }}
        action={(f) =>
          post(`/prospects/${p.id}/proposals`, {
            ...(previous ? { groupId: previous.groupId } : {}),
            version: previous ? previous.version + 1 : 1,
            specificationRevisionId: text(f, 'specificationRevisionId'),
            quantity: Number(text(f, 'quantity')),
            proposedPriceTnd: text(f, 'proposedPriceTnd'),
            estimatedCostTnd: text(f, 'estimatedCostTnd') || null,
            validUntil: iso(text(f, 'validUntil')),
            timing: text(f, 'timing'),
            responsibilities: text(f, 'responsibilities'),
            status: text(f, 'status'),
            buyerResponse: text(f, 'buyerResponse'),
            reason: text(f, 'reason'),
            feedback: text(f, 'feedback'),
            decisionAt: iso(text(f, 'decisionAt')),
            ...(text(f, 'rfqId') ? { rfqId: text(f, 'rfqId') } : {}),
          })
        }
      >
        <Input
          name="specificationRevisionId"
          label="Product specification revision reference"
          value={String(previous?.snapshot.specificationRevisionId ?? '')}
          required
        />
        <Input
          name="quantity"
          label="Proposed quantity"
          type="number"
          min="1"
          value={String(previous?.snapshot.quantity ?? 1)}
          required
        />
        <Input
          name="proposedPriceTnd"
          label="Proposed total price (TND)"
          value={String(previous?.snapshot.proposedPriceTnd ?? '')}
          required
        />
        <Input
          name="estimatedCostTnd"
          label="Estimated total costs (TND, optional)"
          value={String(previous?.snapshot.estimatedCostTnd ?? '')}
        />
        <Input name="validUntil" label="Proposal valid until" type="datetime-local" required />
        <Input name="timing" label="Proposed timing" required />
        <Input name="responsibilities" label="Proposed responsibilities" required />
        <Choice name="status" label="Proposal status">
          {['DRAFT', 'SENT', 'WON', 'LOST', 'NO_DECISION'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Choice>
        <Input name="buyerResponse" label="Buyer response or pending response" required />
        <Input name="reason" label="Outcome or revision reason" required />
        <Input name="feedback" label="Buyer feedback" />
        <Input name="decisionAt" label="Buyer decision date" type="datetime-local" />
        <Input name="rfqId" label="Authorized RFQ reference (required for won)" />
      </ActionForm>
    </details>
  );
}
