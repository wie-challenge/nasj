'use client';
import { AssociationCapacitySummary } from './association-capacity-summary';
import { CapacityWorkspace } from './capacity-workspace';
import Link from 'next/link';
import { useState } from 'react';
import type { CapacityDeclarationView, IdentityContext, Page as PageData } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { dashboardActions } from '@/lib/app-navigation';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Workspace,
  WorkspaceActions,
  ResourceState,
  ActionForm,
  Input,
  Select,
  Checkboxes,
  useResource,
  text,
  humanize,
} from './workspace-ui';
import { Pagination } from './governance';
type Organization = { id: string; name: string; type: string; approvalStatus: string };
type Policy = { id: string; version: string; methods: string[] };
type Skill = { id: string; name: string };
type Participant = {
  id: string;
  displayName: string;
  region: string;
  participantStatus: string;
  availabilityStatus: string;
  userId: string | null;
};
type Detail = {
  profile: Participant & {
    contactPhone: string | null;
    preferredLanguage: string;
    equipment: string[];
    experienceDescription: string;
  };
  skills: { craftSkillId: string; craftSkill: Skill }[];
  capacity: CapacityDeclarationView[];
  authorizations: {
    id: string;
    purpose: string;
    method: string;
    occurredAt: string;
    evidenceReference: string;
    withdrawnAt: string | null;
    policy: { version: string; active: boolean };
  }[];
  assignments: { id: string; coordinatorId: string; startedAt: string; endedAt: string | null }[];
};
const post = (path: string, data: unknown) =>
  apiFetch(`/api/v1/${path}`, { method: 'POST', body: data });
export function evidence(data: FormData) {
  return {
    policyId: text(data, 'policyId'),
    purpose: text(data, 'purpose') || 'PARTICIPATION',
    method: text(data, 'method'),
    occurredAt: new Date(text(data, 'occurredAt')).toISOString(),
    language: text(data, 'language'),
    evidenceReference: text(data, 'evidenceReference'),
    ...(text(data, 'witnessReference') ? { witnessReference: text(data, 'witnessReference') } : {}),
  };
}
function profile(data: FormData) {
  return {
    displayName: text(data, 'displayName'),
    region: text(data, 'region'),
    preferredLanguage: text(data, 'preferredLanguage'),
    contactPhone: text(data, 'contactPhone'),
    equipment: text(data, 'equipment')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    experienceDescription: text(data, 'experienceDescription'),
    availabilityStatus: text(data, 'availabilityStatus'),
  };
}
function ProfileFields({ initial }: { initial?: Detail['profile'] }) {
  return (
    <>
      <Input name="displayName" label="Artisan name" required value={initial?.displayName} />
      <Input name="region" label="Region" required value={initial?.region} />
      <Select
        name="preferredLanguage"
        label="Preferred language"
        value={initial?.preferredLanguage ?? 'fr'}
        options={['fr', 'ar', 'en']}
      />
      <Input name="contactPhone" label="Contact phone (optional)" value={initial?.contactPhone} />
      <Input
        name="equipment"
        label="Equipment (comma separated)"
        value={initial?.equipment.join(', ')}
      />
      <Input
        name="experienceDescription"
        label="Experience and capabilities"
        value={initial?.experienceDescription}
      />
      <Select
        name="availabilityStatus"
        label="Availability"
        value={initial?.availabilityStatus ?? 'AVAILABLE'}
        options={['AVAILABLE', 'PAUSED']}
      />
    </>
  );
}
export function EvidenceFields({ policies }: { policies: Policy[] }) {
  return (
    <>
      <p>
        Record the artisan’s authorization using an approved accessible method. A checkbox alone is
        insufficient. Use evidence references, without uploading private documents here.
      </p>
      <Select
        name="policyId"
        label="Reviewed authorization policy"
        required
        options={[
          { value: '', label: 'Choose a reviewed policy' },
          ...policies.map((p) => ({ value: p.id, label: p.version })),
        ]}
      />
      <Select
        name="method"
        label="Authorization method"
        options={['SIGNED', 'WITNESSED_VERBAL', 'SMS_CONFIRMATION', 'APPROVED_ACCESSIBLE']}
      />
      <Input name="occurredAt" label="Authorization date and time" type="datetime-local" required />
      <Input name="language" label="Language used" required value="fr" />
      <Input name="evidenceReference" label="Authorization evidence reference" required />
      <Input
        name="witnessReference"
        label="Separate witness reference (required for verbal authorization)"
      />
    </>
  );
}
export function FoundationDashboard({
  context,
  mode,
}: {
  context: IdentityContext;
  mode: 'onboarding' | 'buyer' | 'admin' | 'association';
}) {
  const titles = {
    onboarding: 'Welcome to NASJ',
    buyer: 'Your company workspace',
    admin: 'Platform administration',
    association: 'Association workspace',
  };
  const orgs = context.organizations.filter((o) =>
    mode === 'buyer'
      ? o.type === 'BUYER_BUSINESS'
      : mode === 'association'
        ? o.id === context.coordinatorOrganizationId
        : true,
  );
  return (
    <Workspace
      title={titles[mode]}
      description={
        mode === 'onboarding'
          ? 'Complete organization verification or accept your invitation to start.'
          : mode === 'admin'
            ? 'Manage people, review organization requests and oversee platform access.'
            : mode === 'association'
              ? 'Manage your assigned artisans and record their participation and capacity.'
              : 'Request handmade products and follow your company’s procurement.'
      }
    >
      {mode === 'onboarding' && (
        <Card className="panel block p-5">
          <h2>Set up your access</h2>
          <p>
            Create a buyer business or partner association and submit it for review. Internal
            operator and coordinator access is governed by administrators.
          </p>
          <Link href="/settings/organizations">Organizations and approval requests</Link>
          <p>
            <Link href="/settings/profile">Your account settings</Link>
          </p>
        </Card>
      )}
      {mode !== 'onboarding' && <WorkspaceActions actions={dashboardActions[mode]} />}
      {orgs.length > 0 && mode !== 'admin' && (
        <h2 className="workspace-section-title">Your organization</h2>
      )}
      {orgs
        .filter(() => mode !== 'admin')
        .map((o) => (
          <Card key={o.id} className="panel block p-5">
            <h2>{o.name}</h2>
            <Badge variant="secondary">{humanize(o.approvalStatus)}</Badge>
            <p>{humanize(o.type)}</p>
            <Link href={`/organizations/${o.id}/settings`}>
              Organization details and authorized settings
            </Link>
          </Card>
        ))}
      {mode === 'admin' && (
        <p className="workspace-scope-note">
          Commercial requests are coordinated by assigned NASJ operators. Administrator access
          covers user management, organization approvals and independent governance.
        </p>
      )}
      {mode === 'association' && context.coordinatorOrganizationId && (
        <AssociationCapacitySummary organizationId={context.coordinatorOrganizationId} />
      )}
      {mode === 'association' && (
        <p>
          Offers and production updates will be available after the assisted decision workflow is
          implemented. Each offer requires the artisan’s own recorded decision.
        </p>
      )}
    </Workspace>
  );
}
export function ArtisanRegistry() {
  const [page, setPage] = useState(1);
  const resource = useResource<PageData<Participant>>(
    `/api/v1/associations/me/artisans?page=${page}`,
  );
  return (
    <Workspace
      title="Artisan registry"
      description="Only artisans assigned to you in your active association appear here."
    >
      <WorkspaceActions
        label="Artisan registry actions"
        actions={[dashboardActions.association[1]]}
      />
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data?.items.map((p) => (
        <Card key={p.id} className="panel block p-5">
          <h2>
            <Link href={`/association/artisans/${p.id}`}>{p.displayName}</Link>
          </h2>
          <p>
            {p.region} · {humanize(p.availabilityStatus)} · {humanize(p.participantStatus)}
          </p>
          <span className="hint">
            {p.userId ? 'Account linked' : 'Assisted participation — no login required'}
          </span>
        </Card>
      ))}
      {resource.data?.items.length === 0 && <p>No artisans assigned to you yet.</p>}
      <Pagination data={resource.data} page={page} change={setPage} />
    </Workspace>
  );
}
export function AddArtisan() {
  const policies = useResource<Policy[]>('/api/v1/authorization-policies');
  const skills = useResource<PageData<Skill>>('/api/v1/craft-skills');
  const [created, setCreated] = useState('');
  return (
    <Workspace
      title="Add artisan"
      description="Register an artisan without requiring an email, smartphone or account."
    >
      <ResourceState {...policies} retry={policies.reload} />
      <ResourceState {...skills} retry={skills.reload} />
      {policies.data?.length === 0 ? (
        <p>
          An administrator must record a reviewed authorization policy before onboarding can
          proceed.
        </p>
      ) : (
        policies.data &&
        skills.data && (
          <Card className="panel block p-5">
            <ActionForm
              label="Create authorized artisan"
              action={async (data) => {
                const result = (await post('associations/me/artisans', {
                  ...profile(data),
                  skills: data.getAll('skills'),
                  authorization: evidence(data),
                  ...(text(data, 'duplicateReviewId')
                    ? { duplicateReviewId: text(data, 'duplicateReviewId') }
                    : {}),
                })) as { id: string };
                setCreated(result.id);
              }}
            >
              <div className="settings-grid">
                <ProfileFields />
              </div>
              <h2>Craft skills</h2>
              <Checkboxes name="skills" options={skills.data.items.map((s) => s.id)} />
              <h2>Participation authorization</h2>
              <EvidenceFields policies={policies.data} />
              <Input
                name="duplicateReviewId"
                label="Operator duplicate review reference (if requested)"
              />
            </ActionForm>
          </Card>
        )
      )}
      {created && (
        <p role="status">
          Artisan created.{' '}
          <Link href={`/association/artisans/${created}`}>Open artisan record</Link>
        </p>
      )}
    </Workspace>
  );
}
export function ArtisanRecord({ id }: { id: string }) {
  const resource = useResource<Detail>(`/api/v1/associations/me/artisans/${id}`);
  const association = useResource<{ permissions: string[] }>('/api/v1/associations/me');
  const policies = useResource<Policy[]>('/api/v1/authorization-policies');
  const value = resource.data;
  return (
    <Workspace
      title={value?.profile.displayName ?? 'Artisan record'}
      description="Profile, declared capacity and participation authorization."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {value && (
        <>
          <Card className="panel block p-5">
            <h2>Profile and availability</h2>
            <ActionForm
              label="Save artisan profile"
              action={(data) =>
                apiFetch(`/api/v1/associations/me/artisans/${id}`, {
                  method: 'PATCH',
                  body: { ...profile(data), reason: text(data, 'reason') },
                })
              }
              onSuccess={resource.reload}
            >
              <div className="settings-grid">
                <ProfileFields initial={value.profile} />
              </div>
              <Input name="reason" label="Reason for profile change" required />
            </ActionForm>
            <h3>Craft skills</h3>
            <ul>
              {value.skills.map((s) => (
                <li key={s.craftSkillId}>{s.craftSkill.name}</li>
              ))}
            </ul>
            <SkillEditor
              id={id}
              selected={value.skills.map((s) => s.craftSkillId)}
              reload={resource.reload}
            />
          </Card>
          <Card className="panel block p-5">
            <CapacityWorkspace
              rows={value.capacity}
              skills={value.skills}
              path={`/api/v1/associations/me/artisans/${id}`}
              reload={resource.reload}
              canUpdate={Boolean(
                association.data?.permissions.includes('association.capacity.record'),
              )}
              authorizations={value.authorizations
                .filter((a) => !a.withdrawnAt && a.policy.active && a.purpose === 'CAPACITY')
                .map((a) => ({ id: a.id, label: `${humanize(a.purpose)} · ${a.policy.version}` }))}
            />
          </Card>
          <Card className="panel block p-5">
            <h2>Authorization history</h2>
            <p>
              <Link href={`/association/artisans/${id}/history`}>
                Browse complete authorization, capacity and assignment history
              </Link>
            </p>
            {value.authorizations.map((a) => (
              <div key={a.id}>
                <p>
                  {humanize(a.purpose)} · {humanize(a.method)} · {a.policy.version} ·{' '}
                  {a.withdrawnAt ? 'Withdrawn' : a.policy.active ? 'Current' : 'Policy inactive'}
                </p>
                <p>Evidence reference: {a.evidenceReference}</p>
                {!a.withdrawnAt && (
                  <ActionForm
                    label="Record authorization withdrawal"
                    action={(data) =>
                      post(`associations/me/artisans/${id}/authorization/${a.id}/withdraw`, {
                        reason: text(data, 'withdrawalReason'),
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Input name="withdrawalReason" label="Withdrawal reason" required />
                  </ActionForm>
                )}
              </div>
            ))}
            <details>
              <summary>Record new worker authorization</summary>
              {policies.data && (
                <ActionForm
                  label="Record worker authorization"
                  action={(data) =>
                    post(`associations/me/artisans/${id}/authorization`, evidence(data))
                  }
                  onSuccess={resource.reload}
                >
                  <Select
                    name="purpose"
                    label="Authorization purpose"
                    options={['PARTICIPATION', 'CAPACITY', 'OFFER_DECISION']}
                  />
                  <EvidenceFields policies={policies.data} />
                </ActionForm>
              )}
            </details>
          </Card>
          <Card className="panel block p-5">
            <h2>Coordinator assignment history</h2>
            <ul>
              {value.assignments.map((a) => (
                <li key={a.id}>
                  {a.coordinatorId} · {new Date(a.startedAt).toLocaleDateString()} ·{' '}
                  {a.endedAt ? 'Ended' : 'Current'}
                </li>
              ))}
            </ul>
            <p>Reassignment and association transfers require an administrator’s review.</p>
          </Card>
          <p>
            An incorrect participation or work-decision record can be disputed through the{' '}
            <Link href="/participant-support">independent NASJ support contact</Link>. An artisan
            without an account can contact NASJ directly; the coordinator should provide the contact
            details during onboarding.
          </p>
        </>
      )}
    </Workspace>
  );
}
function SkillEditor({
  id,
  selected,
  reload,
}: {
  id: string;
  selected: string[];
  reload: () => unknown;
}) {
  const skills = useResource<PageData<Skill>>('/api/v1/craft-skills');
  return (
    <details>
      <summary>Update craft skills</summary>
      {skills.data && (
        <ActionForm
          label="Save artisan skills"
          action={(data) =>
            apiFetch(`/api/v1/associations/me/artisans/${id}/skills`, {
              method: 'PUT',
              body: { skills: data.getAll('skills'), reason: text(data, 'skillReason') },
            })
          }
          onSuccess={reload}
        >
          <Checkboxes
            name="skills"
            selected={selected}
            options={skills.data.items.map((s) => s.id)}
          />
          <Input name="skillReason" label="Reason for skill change" required />
        </ActionForm>
      )}
    </details>
  );
}
export function AssociationCoordinators() {
  const [page, setPage] = useState(1);
  const r = useResource<
    PageData<{ id: string; user: { id: string; name: string }; status: string }>
  >(`/api/v1/associations/me/coordinators?page=${page}`);
  return (
    <Workspace
      title="Association coordinators"
      description="Active coordinators in your approved association. Artisan access follows explicit assignments."
    >
      <ResourceState {...r} retry={r.reload} />
      <ul>
        {r.data?.items.map((m) => (
          <li key={m.id}>
            {m.user.name} · {humanize(m.status)}
          </li>
        ))}
      </ul>
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}
export function OperatorDashboard() {
  const [page, setPage] = useState(1);
  const r = useResource<{
    organizations: Organization[];
    network: { organizationId: string; participants: number }[];
    total: number;
    pageSize: number;
  }>(`/api/v1/operator/dashboard?page=${page}`);
  return (
    <Workspace
      title="NASJ operations"
      description="Your assigned buyer accounts and partner organizations."
    >
      <WorkspaceActions actions={dashboardActions.operator} />
      <h2 className="workspace-section-title">Assigned buyers and partner organizations</h2>
      <ResourceState {...r} retry={r.reload} />
      {r.data?.organizations.map((o) => (
        <Card key={o.id} className="panel block p-5">
          <h2>{o.name}</h2>
          <p>
            {humanize(o.type)} · {humanize(o.approvalStatus)}
          </p>
          {r.data?.network
            .filter((n) => n.organizationId === o.id)
            .map((n) => (
              <p key={n.organizationId}>{n.participants} participating artisans</p>
            ))}
          {['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(o.type) && (
            <Link href={`/operator/partners/${o.id}`}>Review participant references</Link>
          )}
        </Card>
      ))}
      {r.data?.organizations.length === 0 && (
        <p>No approved organizations are assigned to you yet. Contact a platform administrator.</p>
      )}
      <Pagination data={r.data} page={page} change={setPage} />
      <p className="workspace-scope-note">
        Coordinate requests and quotations for assigned buyers, and review assigned partner
        organizations. Assisted offer decisions, production planning and payment reconciliation
        remain in the backlog.
      </p>
    </Workspace>
  );
}
export function PartnerReview({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const r = useResource<PageData<Pick<Participant, 'id' | 'displayName' | 'region'>>>(
    `/api/v1/operator/organizations/${id}/participants?page=${page}`,
  );
  const [review, setReview] = useState('');
  return (
    <Workspace
      title="Participant duplicate review"
      description="Scoped participant references for an assigned partner. Contact and financial information are excluded."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data?.items.map((p) => (
        <Card key={p.id} className="panel block p-5">
          <h2>{p.displayName}</h2>
          <p>
            {p.region} · Reference: {p.id}
          </p>
          <ActionForm
            label="Record independent duplicate review"
            action={async (d) => {
              const result = (await post(`operator/organizations/${id}/duplicate-reviews`, {
                artisanId: p.id,
                reason: text(d, 'reason'),
              })) as { reviewId: string };
              setReview(result.reviewId);
            }}
          >
            <Input name="reason" label="Review findings and reason" required />
          </ActionForm>
        </Card>
      ))}
      {review && <p role="status">Duplicate review reference: {review}</p>}
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}

export function RegistryHistory({ id }: { id: string }) {
  const [kind, setKind] = useState<'authorization' | 'capacity' | 'assignments'>('authorization');
  const [page, setPage] = useState(1);
  const r = useResource<
    PageData<{
      id: string;
      purpose?: string;
      method?: string;
      createdAt?: string;
      quantity?: string;
      unitType?: string;
      version?: number;
      recordingMode?: CapacityDeclarationView['recordingMode'];
      coordinatorId?: string;
      startedAt?: string;
      endedAt?: string | null;
      withdrawnAt?: string | null;
      policy?: { version: string };
    }>
  >(`/api/v1/associations/me/artisans/${id}/${kind}?page=${page}`);
  return (
    <Workspace
      title="Participant history"
      description="Retained records for your assigned participant, with pagination."
    >
      <p>
        <Link href={`/association/artisans/${id}`}>Back to participant</Link>
      </p>
      <nav className="workspace-tabs" aria-label="History views">
        {(['authorization', 'capacity', 'assignments'] as const).map((k) => (
          <button
            className="button secondary"
            type="button"
            key={k}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
          >
            {humanize(k)}
          </button>
        ))}
      </nav>
      <ResourceState {...r} retry={r.reload} />
      {r.data?.items.map((row) => (
        <Card key={row.id} className="panel block p-5">
          {kind === 'authorization' ? (
            <>
              <h2>{humanize(row.purpose ?? 'Authorization')}</h2>
              <p>
                {humanize(row.method ?? '')} · {row.policy?.version} ·{' '}
                {row.withdrawnAt ? 'Withdrawn' : 'Recorded'}
              </p>
            </>
          ) : kind === 'capacity' ? (
            <>
              <h2>
                {row.quantity} {row.unitType}
              </h2>
              {row.version != null && (
                <p>
                  Version {row.version} ·{' '}
                  {row.recordingMode === 'SELF' ? 'Artisan self-recorded' : 'Coordinator-assisted'}
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Coordinator: {row.coordinatorId}</h2>
              <p>{row.endedAt ? 'Ended assignment' : 'Current assignment'}</p>
            </>
          )}
          <p>{new Date(row.createdAt ?? row.startedAt ?? '').toLocaleString()}</p>
        </Card>
      ))}
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}

export function OperatorActivity() {
  const [page, setPage] = useState(1);
  const r = useResource<
    PageData<{
      id: string;
      action: string;
      targetType: string;
      targetId: string;
      organizationId: string;
      timestamp: string;
    }>
  >(`/api/v1/operator/activity?page=${page}`);
  return (
    <Workspace
      title="Assigned account activity"
      description="Scoped activity metadata for your currently assigned approved buyer and partner accounts. Private audit snapshots are excluded."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data?.items.map((e) => (
        <Card key={e.id} className="panel block p-5">
          <h2>{humanize(e.action.replaceAll('.', ' '))}</h2>
          <p>
            {e.targetType} · Reference: {e.targetId}
          </p>
          <p>{new Date(e.timestamp).toLocaleString()}</p>
        </Card>
      ))}
      {r.data?.items.length === 0 && <p>No scoped activity yet.</p>}
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}
