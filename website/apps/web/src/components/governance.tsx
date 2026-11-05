'use client';
import { NativeSelect } from './ui/native-select';
import { Label } from './ui/label';
import Link from 'next/link';
import { useState } from 'react';
import type { Page, OrganizationView, MeView } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  Workspace,
  SectionShell,
  ResourceState,
  ActionForm,
  Input,
  Select,
  useResource,
  text,
  humanize,
} from './workspace-ui';
type PrivacyRequest = {
  id: string;
  type: string;
  status: string;
  details: string;
  submittedAt: string;
  resolutionNotes: string | null;
  retentionExceptions: string | null;
};
type Audit = {
  id: string;
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  timestamp: string;
  reason: string | null;
  organizationId: string | null;
  correlationId: string;
};
type SupportCase = {
  id: string;
  subject: string;
  description: string;
  status: string;
  organizationId: string | null;
  resolution: string | null;
  assignedToUserId: string | null;
  dueAt: string | null;
  canManage?: boolean;
};
type Consent = {
  id: string;
  purpose: string;
  policyVersion: string;
  decision: boolean;
  collectedAt: string;
  withdrawnAt: string | null;
};
type Preference = { category: string; channel: 'EMAIL'; language: string; optedIn: boolean };
export function Privacy({ admin = false }: { admin?: boolean }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<PrivacyRequest>>(
    `/api/v1/${admin ? 'admin/privacy-requests' : 'privacy/requests/me'}?page=${page}`,
  );
  return (
    <Workspace
      title={admin ? 'Privacy request review.' : 'Your data and privacy.'}
      description={
        admin
          ? 'Review requests and record outcomes and any retention exceptions.'
          : 'Request a correction, export or deletion and track its progress.'
      }
    >
      {!admin && (
        <div className="settings-grid">
          <section className="panel">
            <h2>Submit a request</h2>
            <ActionForm
              label="Submit privacy request"
              onSuccess={resource.reload}
              action={(data) =>
                apiFetch('/api/v1/privacy/requests', {
                  method: 'POST',
                  body: { type: text(data, 'type'), details: text(data, 'details') },
                })
              }
            >
              <Select
                name="type"
                label="Request type"
                options={['EXPORT', 'CORRECTION', 'DELETION']}
              />
              <Input name="details" label="Request details" required />
            </ActionForm>
          </section>
          <section className="panel">
            <h2>Personal data export</h2>
            <p>
              Download your own account, membership, artisan and consent records. Required retained
              history is reviewed separately from account deactivation.
            </p>
            <ActionForm
              label="Download my data"
              action={async () => {
                const payload = await apiFetch('/api/v1/privacy/export');
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'nasj-personal-data.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            />
          </section>
          <section className="panel wide">
            <Consents />
          </section>
        </div>
      )}
      <section className="panel section-gap">
        <h2>{admin ? 'Request queue' : 'Your requests'}</h2>
        <ResourceState {...resource} retry={resource.reload} />
        <ul className="record-list">
          {resource.data?.items.map((request) => (
            <li key={request.id}>
              <h3>
                {humanize(request.type)} · {humanize(request.status)}
              </h3>
              <p>{request.details}</p>
              <p>Submitted {new Date(request.submittedAt).toLocaleString()}</p>
              {request.resolutionNotes && <p>Resolution: {request.resolutionNotes}</p>}
              {request.retentionExceptions && (
                <p>Retention exceptions: {request.retentionExceptions}</p>
              )}
              {admin && (
                <ActionForm
                  label="Save request review"
                  onSuccess={resource.reload}
                  action={(data) =>
                    apiFetch(`/api/v1/admin/privacy-requests/${request.id}`, {
                      method: 'PATCH',
                      body: {
                        status: text(data, 'status'),
                        resolutionNotes: text(data, 'resolutionNotes'),
                        retentionExceptions: text(data, 'retentionExceptions'),
                      },
                    })
                  }
                >
                  <Select
                    name="status"
                    label="Review status"
                    value={request.status === 'SUBMITTED' ? 'IN_REVIEW' : request.status}
                    options={['IN_REVIEW', 'RESOLVED', 'REJECTED']}
                  />
                  <Input
                    name="resolutionNotes"
                    label="Resolution notes"
                    value={request.resolutionNotes}
                    required
                  />
                  <Input
                    name="retentionExceptions"
                    label="Applicable retention exceptions"
                    value={request.retentionExceptions}
                  />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {resource.data?.items.length === 0 && <p>No privacy requests.</p>}
        <Pagination data={resource.data} page={page} change={setPage} />
      </section>
    </Workspace>
  );
}
function Consents() {
  const resource = useResource<{ items: Consent[] }>('/api/v1/consents');
  return (
    <>
      <h2>Your consent history</h2>
      <ResourceState {...resource} retry={resource.reload} />
      <ul className="record-list">
        {resource.data?.items.map((consent) => (
          <li key={consent.id}>
            <strong>{consent.purpose}</strong>
            <p>
              Policy {consent.policyVersion} ·{' '}
              {consent.withdrawnAt ? 'Withdrawn' : consent.decision ? 'Granted' : 'Declined'}
            </p>
            {consent.decision && !consent.withdrawnAt && (
              <ActionForm
                label="Withdraw consent"
                confirm="Withdraw this consent? Related assistance permissions may be revoked."
                onSuccess={resource.reload}
                action={() => apiFetch(`/api/v1/consents/${consent.id}`, { method: 'DELETE' })}
              />
            )}
          </li>
        ))}
      </ul>
      {resource.data?.items.length === 0 && <p>No consent records yet.</p>}
    </>
  );
}
export function Notifications({ embedded = false }: { embedded?: boolean }) {
  const resource = useResource<{ items: Preference[] }>('/api/v1/notifications/preferences');
  const language = useResource<{ preferredLanguage: string }>('/api/v1/settings/preferences');
  const categories = ['PRODUCT_UPDATES', 'OPPORTUNITIES', 'SUPPORT_UPDATES'];
  return (
    <SectionShell
      embedded={embedded}
      title="Language and notifications."
      description="Choose your communication language and which optional emails you receive."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Preferred language</h2>
          <ResourceState {...language} retry={language.reload} />
          {language.data && (
            <ActionForm
              label="Save language preference"
              onSuccess={language.reload}
              action={(data) =>
                apiFetch('/api/v1/settings/preferences', {
                  method: 'PATCH',
                  body: { preferredLanguage: text(data, 'preferredLanguage') },
                })
              }
            >
              <Select
                name="preferredLanguage"
                label="Preferred communication language"
                value={language.data.preferredLanguage}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'fr', label: 'Français' },
                  { value: 'ar', label: 'العربية' },
                ]}
              />
              <p className="hint">
                The interface currently uses English. French and Arabic interface translations are
                pending.
              </p>
            </ActionForm>
          )}
        </section>
        <section className="panel">
          <h2>Optional email notifications</h2>
          <ResourceState {...resource} retry={resource.reload} />
          {resource.data && (
            <ActionForm
              key={JSON.stringify(resource.data)}
              label="Save notification preferences"
              onSuccess={resource.reload}
              action={(data) =>
                apiFetch('/api/v1/notifications/preferences', {
                  method: 'PUT',
                  body: {
                    items: categories.map((category) => ({
                      category,
                      channel: 'EMAIL',
                      language: language.data?.preferredLanguage ?? 'en',
                      optedIn: data.has(category),
                    })),
                  },
                })
              }
            >
              {categories.map((category) => (
                <label className="check-label" key={category}>
                  <input
                    name={category}
                    type="checkbox"
                    defaultChecked={
                      resource.data?.items.find((item) => item.category === category)?.optedIn ??
                      false
                    }
                  />
                  {humanize(category)}
                </label>
              ))}
              <p className="hint">
                Saving preferences does not indicate notification delivery. Security and
                verification messages follow account policy.
              </p>
            </ActionForm>
          )}
        </section>
      </div>
    </SectionShell>
  );
}
export function AuditLog({ organizationId }: { organizationId?: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Audit>>(
    `/api/v1/${organizationId ? `organizations/${encodeURIComponent(organizationId)}/audit-events` : 'admin/audit-events'}?page=${page}`,
  );
  return (
    <Workspace
      title="Audit history."
      description="Review scoped access changes and sensitive actions. Records do not include session or invitation secrets."
    >
      <ResourceState {...resource} retry={resource.reload} />
      <section className="panel">
        <ul className="record-list">
          {resource.data?.items.map((event) => (
            <li key={event.id}>
              <strong>{event.action}</strong>
              <p>
                {new Date(event.timestamp).toLocaleString()} · Actor {event.actorId}
              </p>
              <p>
                {event.targetType} {event.targetId}
                {event.organizationId && ` · Organization ${event.organizationId}`}
              </p>
              {event.reason && <p>{event.reason}</p>}
              <small>Reference {event.correlationId}</small>
            </li>
          ))}
        </ul>
        {resource.data?.items.length === 0 && <p>No audit events found.</p>}
        <Pagination data={resource.data} page={page} change={setPage} />
      </section>
    </Workspace>
  );
}
export function SupportCases() {
  const [organizationId, setOrganizationId] = useState('');
  const [page, setPage] = useState(1);
  const me = useResource<MeView>('/api/v1/me');
  const memberships =
    useResource<Page<OrganizationView & { permissions?: string[] }>>('/api/v1/organizations');
  const resource = useResource<Page<SupportCase>>(
    organizationId === '__platform'
      ? `/api/v1/admin/support/cases?page=${page}`
      : `/api/v1/support/cases?page=${page}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ''}`,
  );
  return (
    <Workspace
      title="Support cases."
      description="Create a private support case and follow its resolution. Organization support staff can review cases within their assigned scope."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Create a case</h2>
          <ActionForm
            label="Create support case"
            onSuccess={resource.reload}
            action={(data) =>
              apiFetch('/api/v1/support/cases', {
                method: 'POST',
                body: {
                  subject: text(data, 'subject'),
                  description: text(data, 'description'),
                  ...(organizationId && organizationId !== '__platform' ? { organizationId } : {}),
                },
              })
            }
          >
            <Input name="subject" label="Subject" required />
            <Input name="description" label="What do you need help with?" required />
          </ActionForm>
          <p>
            <Link href="/support/privacy">Manage personal-data requests</Link>
          </p>
        </section>
        <section className="panel">
          <h2>Case scope</h2>
          <label className="field">
            <span className="label">View cases for</span>
            <select
              aria-label="View cases for"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">My personal cases</option>
              {me.data?.user.role === 'ADMIN' && (
                <option value="__platform">Platform account support</option>
              )}
              {memberships.data?.items.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <p>The server checks your organization support permissions before returning cases.</p>
        </section>
        <section className="panel wide">
          <h2>Cases</h2>
          <ResourceState {...resource} retry={resource.reload} />
          <ul className="record-list">
            {resource.data?.items.map((item) => (
              <li key={item.id}>
                <h3>{item.subject}</h3>
                <p>{item.description}</p>
                <p>{humanize(item.status)}</p>
                {item.resolution && <p>Resolution: {item.resolution}</p>}
                {item.canManage && (
                  <ActionForm
                    label="Update support case"
                    onSuccess={resource.reload}
                    action={(data) =>
                      apiFetch(`/api/v1/support/cases/${item.id}`, {
                        method: 'PATCH',
                        body: {
                          status: text(data, 'status'),
                          resolution: text(data, 'resolution'),
                          ...(data.has('assignSelf') ? { assignedToUserId: me.data?.user.id } : {}),
                          ...(text(data, 'dueAt')
                            ? { dueAt: new Date(text(data, 'dueAt')).toISOString() }
                            : {}),
                        },
                      })
                    }
                  >
                    <Select
                      name="status"
                      label="Case status"
                      value={item.status}
                      options={['OPEN', 'IN_PROGRESS', 'RESOLVED']}
                    />
                    <Input name="resolution" label="Resolution notes" value={item.resolution} />
                    <Input name="dueAt" label="Response due" type="datetime-local" />
                    <label className="check-label">
                      <input type="checkbox" name="assignSelf" />
                      Assign this case to me
                    </label>
                  </ActionForm>
                )}
                {item.canManage && (
                  <ActionForm
                    label="Send case update email"
                    successMessage="Email accepted by the mail service. Delivery is not confirmed."
                    action={async () => {
                      const response = await apiFetch<{ status: string; delivered: boolean }>(
                        `/api/v1/support/cases/${item.id}/notify`,
                        { method: 'POST' },
                      );
                      if (response.status !== 'ACCEPTED_BY_SMTP')
                        throw new Error(
                          'Notification was not accepted for sending. Check recipient preferences and email service configuration.',
                        );
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {resource.data?.items.length === 0 && <p>No support cases found.</p>}
          <Pagination data={resource.data} page={page} change={setPage} />
        </section>
      </div>
    </Workspace>
  );
}
export function AdminOrganizations({ pending = false, id }: { pending?: boolean; id?: string }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const resource = useResource<Page<OrganizationView> | OrganizationView>(
    id
      ? `/api/v1/admin/organizations/${encodeURIComponent(id)}`
      : `/api/v1/admin/organizations${pending ? '/pending' : ''}?page=${page}${!pending && type ? `&type=${type}` : ''}`,
  );
  const items = resource.data
    ? 'items' in resource.data
      ? resource.data.items
      : [resource.data]
    : undefined;
  return (
    <Workspace
      title={pending ? 'Organization approvals.' : 'Organization administration.'}
      description="Review organization profiles and record approval decisions with a reason."
    >
      <nav className="workspace-tabs">
        <Link href="/admin/organizations">All organizations</Link>
        <Link href="/admin/approvals">Pending approval</Link>
        <Link href="/admin/users">User accounts</Link>
        <Link href="/admin/audit">Audit history</Link>
        <Link href="/admin/privacy-requests">Privacy requests</Link>
      </nav>
      {!id && !pending && (
        <div className="field">
          <Label htmlFor="organization-type-filter">Organization type</Label>
          <NativeSelect
            id="organization-type-filter"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All organization types</option>
            {['BUYER_BUSINESS', 'ASSOCIATION', 'PARTNER_COOPERATIVE', 'INTERNAL'].map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <ResourceState {...resource} retry={resource.reload} />
      <ul className="record-list">
        {items?.map((org) => (
          <li className="panel" key={org.id}>
            <h2>{org.name}</h2>
            <p>
              {humanize(org.type)} · {humanize(org.approvalStatus)}
            </p>
            <p>{org.description}</p>
            <p>
              {org.representativeName} · {org.contactEmail} · {org.region}
            </p>
            {org.approvalReason && <p>Latest review: {org.approvalReason}</p>}
            {['PENDING_REVIEW', 'APPROVED', 'SUSPENDED'].includes(org.approvalStatus) && (
              <ActionForm
                label="Record approval decision"
                confirm="Apply this organization approval decision?"
                onSuccess={resource.reload}
                action={(data) =>
                  apiFetch(`/api/v1/admin/organizations/${org.id}/${text(data, 'decision')}`, {
                    method: 'POST',
                    body: { reason: text(data, 'reason') },
                  })
                }
              >
                <Select
                  name="decision"
                  label={`Decision for ${org.name}`}
                  options={
                    org.approvalStatus === 'PENDING_REVIEW'
                      ? ['approve', 'reject']
                      : org.approvalStatus === 'APPROVED'
                        ? ['suspend']
                        : ['approve']
                  }
                />
                <Input name="reason" label="Review reason" required />
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
      {items?.length === 0 && <p>No organizations found.</p>}
      <Pagination
        data={resource.data && 'items' in resource.data ? resource.data : null}
        page={page}
        change={setPage}
      />
    </Workspace>
  );
}
export function Pagination({
  data,
  page,
  change,
}: {
  data: { total: number; pageSize: number } | null;
  page: number;
  change: (page: number) => void;
}) {
  if (!data || data.total <= data.pageSize) return null;
  return (
    <nav className="pagination" aria-label="Results pages">
      <button
        type="button"
        className="button secondary"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} · {data.total} results
      </span>
      <button
        type="button"
        className="button secondary"
        disabled={page * data.pageSize >= data.total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
