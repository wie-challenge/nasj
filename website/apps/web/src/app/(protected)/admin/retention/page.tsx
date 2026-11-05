'use client';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  Input,
  ResourceState,
  Workspace,
  useResource,
  text,
} from '@/components/workspace-ui';
type View = {
  version: string;
  reviewStatus: string;
  purgeEnabled: boolean;
  boundary: string;
  inventory: {
    dataClass: string;
    purpose: string;
    accessRoles: string[];
    retentionTrigger: string;
    retentionDuration: null;
    preservationExceptions: string;
    deletionCorrectionProcess: string;
    operationalOwner: string;
    breachResponseOwner: string;
    technicalExpiry: string | null;
  }[];
  reviews: { id: string; actorId: string; timestamp: string }[];
};
export default function Page() {
  const r = useResource<View>('/api/v1/governance/retention');
  return (
    <Workspace
      title="Retention and purpose governance"
      description="Operational inventory with qualified retention-policy review pending. Destructive automated purging is disabled."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data && (
        <>
          <p>
            {r.data.reviewStatus}. {r.data.boundary}
          </p>
          {r.data.inventory.map((v) => (
            <section className="section-gap" key={v.dataClass}>
              <h2>{v.dataClass}</h2>
              <p>{v.purpose}</p>
              <p>Access: {v.accessRoles.join(', ')}.</p>
              <p>
                Retention trigger: {v.retentionTrigger}. Duration: pending qualified review.{' '}
                {v.technicalExpiry}
              </p>
              <p>Preserve: {v.preservationExceptions}.</p>
              <p>Correction/removal: {v.deletionCorrectionProcess}.</p>
              <p>
                Owner: {v.operationalOwner}. Incident response: {v.breachResponseOwner}.
              </p>
            </section>
          ))}
          <ActionForm
            label="Record operational inventory review"
            onSuccess={r.reload}
            action={(f) =>
              apiFetch('/api/v1/governance/retention/review', {
                method: 'POST',
                idempotencyKey: crypto.randomUUID(),
                body: {
                  version: r.data!.version,
                  purpose: text(f, 'purpose'),
                  reason: text(f, 'reason'),
                },
              })
            }
          >
            <Input name="purpose" label="Review purpose" required />
            <Input name="reason" label="Review findings and unresolved decisions" required />
          </ActionForm>
          <p>
            {r.data.reviews.length} operational reviews recorded. Legal policy approval remains
            pending.
          </p>
        </>
      )}
    </Workspace>
  );
}
