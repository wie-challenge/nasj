'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Page as PageData } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  useResource,
  text,
  humanize,
} from './workspace-ui';
import { Card } from './ui/card';
import { Pagination } from './governance';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
export function ParticipantSupport() {
  return (
    <Workspace
      title="Independent participant support"
      description="You do not need an account to report an incorrect authorization, work decision or access record."
    >
      <p>
        NASJ administrators receive this concern independently of the association. Include a
        participant or offer reference where available. A trusted person may help you complete the
        form. Do not include medical or wearable readings.
      </p>
      <Card className="panel block p-5">
        <ActionForm
          label="Send concern for independent review"
          action={async (data) => {
            const response = await fetch('/api/v1/participant-concerns', {
              method: 'POST',
              credentials: 'omit',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subjectReference: text(data, 'subjectReference'),
                concernType: text(data, 'concernType'),
                description: text(data, 'description'),
                ...(text(data, 'contactMethod')
                  ? { contactMethod: text(data, 'contactMethod') }
                  : {}),
              }),
            });
            if (!response.ok) throw new Error('Unable to submit the concern. Please retry.');
          }}
          successMessage="Your concern has been sent for independent NASJ review."
        >
          <Input name="subjectReference" label="Participant or offer reference" required />
          <Select
            name="concernType"
            label="What needs review?"
            options={['AUTHORIZATION', 'OFFER_DECISION', 'ACCESS', 'OTHER']}
          />
          <div className="field">
            <Label htmlFor="concern-description">Describe the concern</Label>
            <Textarea
              id="concern-description"
              name="description"
              minLength={20}
              maxLength={2000}
              required
            />
          </div>
          <Input name="contactMethod" label="Safe way to contact you (optional)" />
        </ActionForm>
      </Card>
      <p>
        <Link href="/auth/login">Sign in</Link>
      </p>
    </Workspace>
  );
}
export function ParticipantConcernsAdmin() {
  const [page, setPage] = useState(1);
  const r = useResource<
    PageData<{
      id: string;
      subjectReference: string;
      concernType: string;
      description: string;
      contactMethod: string | null;
      status: string;
    }>
  >(`/api/v1/admin/participant-concerns?page=${page}`);
  return (
    <Workspace
      title="Independent participant concerns"
      description="Review concerns separately from the person who recorded the disputed authorization or decision."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data?.items.map((c) => (
        <Card key={c.id} className="panel block p-5">
          <h2>
            {humanize(c.concernType)} · {humanize(c.status)}
          </h2>
          <p>Reference: {c.subjectReference}</p>
          <p>{c.description}</p>
          {c.contactMethod && <p>Safe contact: {c.contactMethod}</p>}
          {c.status !== 'RESOLVED' && (
            <ActionForm
              label="Record independent concern review"
              action={(d) =>
                apiFetch(`/api/v1/admin/participant-concerns/${c.id}`, {
                  method: 'PATCH',
                  body: { status: text(d, 'status'), resolution: text(d, 'resolution') },
                })
              }
              onSuccess={r.reload}
            >
              <Select
                name="status"
                label="Concern review status"
                options={['IN_REVIEW', 'RESOLVED']}
              />
              <Input name="resolution" label="Review findings and next steps" required />
            </ActionForm>
          )}
        </Card>
      ))}
      {r.data?.items.length === 0 && <p>No participant concerns received.</p>}
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}
