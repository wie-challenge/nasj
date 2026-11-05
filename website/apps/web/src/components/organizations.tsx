'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthForm } from './auth-form';
import type {
  OrganizationMembershipView,
  OrganizationListView,
  OrganizationMemberView,
  InvitationView,
  Page,
  BusinessRole,
  MeView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Pagination } from './governance';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  Checkboxes,
  useResource,
  humanize,
  text,
} from './workspace-ui';

type Detail = OrganizationMembershipView & {
  permissions: string[];
  assignableRoles: BusinessRole[];
};
const organizationFields = [
  'name',
  'representativeName',
  'country',
  'region',
  'description',
  'contactEmail',
  'contactPhone',
] as const;
const fieldLabels = {
  name: 'Organization name',
  representativeName: 'Authorized representative',
  country: 'Country',
  region: 'Region',
  description: 'Organization description',
  contactEmail: 'Contact email',
  contactPhone: 'Contact phone',
};
function OrganizationFields({ initial }: { initial?: OrganizationMembershipView }) {
  return (
    <>
      {organizationFields.map((field) => (
        <Input
          key={field}
          name={field}
          label={fieldLabels[field]}
          value={initial?.[field] ?? (field === 'country' ? 'Tunisia' : '')}
          required={field !== 'contactPhone'}
          type={field === 'contactEmail' ? 'email' : 'text'}
        />
      ))}
    </>
  );
}
function organizationInput(data: FormData) {
  return Object.fromEntries(organizationFields.map((field) => [field, text(data, field)]));
}
export function Organizations() {
  const me = useResource<MeView>('/api/v1/me');
  const [page, setPage] = useState(1);
  const resource = useResource<Page<OrganizationListView>>(`/api/v1/organizations?page=${page}`);
  const router = useRouter();
  return (
    <Workspace
      title="Your organizations."
      description="Work with a buyer business or association. Each membership has its own access and roles."
    >
      <ResourceState {...resource} retry={resource.reload} />
      <div className="settings-grid">
        <section className="panel">
          <h2>Your memberships</h2>
          {resource.data?.items.length === 0 && <p>You have no organization memberships yet.</p>}
          <ul className="record-list">
            {resource.data?.items.map((org) => (
              <li key={org.id}>
                <h3>{org.name}</h3>
                <p>
                  {humanize(org.approvalStatus)} · Membership {humanize(org.myMembership.status)}
                </p>
                <p>
                  {org.myMembership.roles.map(humanize).join(', ')}
                  {org.myMembership.isManager ? ' · Organization manager' : ''}
                </p>
                <Link className="button secondary" href={`/organizations/${org.id}/settings`}>
                  Open organization
                </Link>
              </li>
            ))}
          </ul>
          <Pagination data={resource.data} page={page} change={setPage} />
        </section>
        <section className="panel">
          <h2>Create an organization</h2>
          <ActionForm
            label="Create organization"
            action={async (data) => {
              const org = await apiFetch<OrganizationMembershipView>('/api/v1/organizations', {
                method: 'POST',
                body: { ...organizationInput(data), type: text(data, 'type') },
              });
              router.push(`/organizations/${org.id}/settings`);
            }}
          >
            <Select
              name="type"
              label="Organization type"
              options={
                me.data?.user.role === 'ADMIN'
                  ? ['BUYER_BUSINESS', 'ASSOCIATION', 'PARTNER_COOPERATIVE', 'INTERNAL']
                  : ['BUYER_BUSINESS', 'ASSOCIATION', 'PARTNER_COOPERATIVE']
              }
            />
            <OrganizationFields />
          </ActionForm>
        </section>
      </div>
    </Workspace>
  );
}
export function OrganizationSettings({ id }: { id: string }) {
  const path = `/api/v1/organizations/${encodeURIComponent(id)}`;
  const resource = useResource<Detail>(path);
  const org = resource.data;
  const permissions = org?.permissions ?? [];
  return (
    <Workspace
      title={org?.name ?? 'Organization.'}
      description="Manage organization details, access and approval."
    >
      <p>
        <Link href="/settings/organizations">All organizations</Link>
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {org && (
        <>
          <p className="badge">
            Approval: {humanize(org.approvalStatus)} · Your membership:{' '}
            {humanize(org.myMembership.status)}
          </p>
          {org.approvalReason && <p>Latest review: {org.approvalReason}</p>}
          <div className="settings-grid">
            <section className="panel">
              <h2>Organization profile</h2>
              {permissions.includes('organization.update') &&
              ['DRAFT', 'REJECTED'].includes(org.approvalStatus) ? (
                <ActionForm
                  key={org.updatedAt}
                  label="Save organization"
                  onSuccess={resource.reload}
                  action={(data) =>
                    apiFetch(path, { method: 'PATCH', body: organizationInput(data) })
                  }
                >
                  <OrganizationFields initial={org} />
                </ActionForm>
              ) : (
                <>
                  <p>{org.description}</p>
                  <p>
                    {org.region}, {org.country}
                  </p>
                  <p>
                    {org.contactEmail}
                    {org.contactPhone ? ` · ${org.contactPhone}` : ''}
                  </p>
                  <p>Authorized representative: {org.representativeName}</p>
                  <p className="hint">
                    Organization details are locked during and after approval review. Contact
                    support if a correction is needed.
                  </p>
                </>
              )}
            </section>
            <section className="panel">
              <h2>Approval and membership</h2>
              {permissions.includes('audit.read') && (
                <p>
                  <Link href={`/organizations/${id}/audit`}>Organization audit history</Link>
                </p>
              )}
              <p>
                Approval is required before restricted organization operations become available.
              </p>
              {permissions.includes('organization.approval.request') &&
                ['DRAFT', 'REJECTED'].includes(org.approvalStatus) && (
                  <ActionForm
                    label="Request approval"
                    onSuccess={resource.reload}
                    action={() => apiFetch(`${path}/submit-approval`, { method: 'POST' })}
                  />
                )}
              {org.myMembership.status === 'ACTIVE' && (
                <ActionForm
                  label="Leave organization"
                  confirm="Leave this organization? Its permissions will be removed immediately."
                  onSuccess={resource.reload}
                  action={() =>
                    apiFetch(`${path}/members/${org.myMembership.id}`, {
                      method: 'DELETE',
                      body: { reason: 'Member chose to leave organization.' },
                    })
                  }
                />
              )}
            </section>
            {permissions.includes('organization.members.read') && (
              <section className="panel wide">
                <Members
                  path={path}
                  canUpdate={permissions.includes('organization.members.update')}
                  canAssign={permissions.includes('organization.roles.assign')}
                  canRemove={permissions.includes('organization.members.remove')}
                  roles={org.assignableRoles}
                />
              </section>
            )}
            {permissions.includes('organization.members.invite') && (
              <section className="panel wide">
                <Invitations path={path} roles={org.assignableRoles} />
              </section>
            )}
          </div>
        </>
      )}
    </Workspace>
  );
}
function Members({
  path,
  canUpdate,
  canAssign,
  canRemove,
  roles,
}: {
  path: string;
  canUpdate: boolean;
  canAssign: boolean;
  canRemove: boolean;
  roles: BusinessRole[];
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<OrganizationMemberView>>(`${path}/members?page=${page}`);
  return (
    <>
      <h2>Members</h2>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data?.items.length === 0 && <p>No members found.</p>}
      <ul className="record-list">
        {resource.data?.items.map((member) => (
          <li key={`${member.id}-${member.status}-${member.roles.join()}`}>
            <h3>{member.user.name}</h3>
            <p>
              {member.user.email} · {humanize(member.status)}
              {member.isManager ? ' · Organization manager' : ''}
            </p>
            <p>{member.roles.map(humanize).join(', ') || 'No business roles'}</p>
            {canUpdate && (
              <details>
                <summary>Change membership access</summary>
                <ActionForm
                  label="Update membership"
                  confirm="Apply this membership access change?"
                  onSuccess={resource.reload}
                  action={(data) =>
                    apiFetch(`${path}/members/${member.id}`, {
                      method: 'PATCH',
                      body: {
                        status: text(data, 'status'),
                        isManager: data.has('isManager'),
                        reason: text(data, 'reason'),
                      },
                    })
                  }
                >
                  <Select
                    name="status"
                    label={`Membership status for ${member.user.name}`}
                    value={member.status}
                    options={['ACTIVE', 'SUSPENDED', 'REVOKED', 'LEFT']}
                  />
                  <Checkboxes
                    name="isManager"
                    options={['Organization manager']}
                    selected={member.isManager ? ['Organization manager'] : []}
                  />
                  <Input name="reason" label="Reason for access change" required />
                </ActionForm>
              </details>
            )}
            {canAssign &&
              member.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r)) && (
                <details>
                  <summary>Quotation approval authority</summary>
                  <p>
                    Current authority:{' '}
                    {member.explicitPermissions?.includes('buyer.quotation.approve')
                      ? 'Authorized'
                      : 'Not authorized'}
                  </p>
                  <ActionForm
                    label="Save quotation approval authority"
                    action={(data) =>
                      apiFetch(`${path}/members/${member.id}/permissions`, {
                        method: 'PUT',
                        body: {
                          permission: 'buyer.quotation.approve',
                          enabled: text(data, 'enabled') === 'true',
                          reason: text(data, 'approvalReason'),
                        },
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Select
                      name="enabled"
                      label="Quotation approval access"
                      options={[
                        { value: 'true', label: 'Authorize approval' },
                        { value: 'false', label: 'Revoke approval' },
                      ]}
                    />
                    <Input
                      name="approvalReason"
                      label="Approval authority review reason"
                      required
                    />
                  </ActionForm>
                </details>
              )}
            {canAssign &&
              member.roles.some((r) => ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r)) && (
                <details>
                  <summary>Purchasing and negotiation authority</summary>
                  <ActionForm
                    label="Save purchasing authority"
                    action={(data) =>
                      apiFetch(`${path}/members/${member.id}/permissions`, {
                        method: 'PUT',
                        body: {
                          permission: text(data, 'purchasingPermission'),
                          enabled: text(data, 'purchasingEnabled') === 'true',
                          reason: text(data, 'purchasingReason'),
                        },
                      })
                    }
                    onSuccess={resource.reload}
                  >
                    <Select
                      name="purchasingPermission"
                      label="Purchasing permission"
                      options={[
                        { value: 'buyer.rfq.create', label: 'Prepare and submit RFQs' },
                        { value: 'buyer.quotation.negotiate', label: 'Negotiate quotations' },
                      ]}
                    />
                    <Select
                      name="purchasingEnabled"
                      label="Purchasing access"
                      options={[
                        { value: 'true', label: 'Authorize' },
                        { value: 'false', label: 'Remove authority' },
                      ]}
                    />
                    <Input
                      name="purchasingReason"
                      label="Purchasing authority review reason"
                      required
                    />
                  </ActionForm>
                </details>
              )}
            {canAssign && (
              <details>
                <summary>Manage business roles</summary>
                <ActionForm
                  label="Save roles"
                  confirm="Apply these role assignments?"
                  onSuccess={resource.reload}
                  action={(data) =>
                    apiFetch(`${path}/members/${member.id}/roles`, {
                      method: 'PUT',
                      body: { roles: data.getAll('roles'), reason: text(data, 'reason') },
                    })
                  }
                >
                  <Checkboxes name="roles" options={roles} selected={member.roles} />
                  <Input name="reason" label="Reason for role change" required />
                </ActionForm>
              </details>
            )}
            {canRemove && member.status === 'ACTIVE' && (
              <ActionForm
                label="Remove membership"
                confirm={`Remove ${member.user.name} from this organization?`}
                onSuccess={resource.reload}
                action={() =>
                  apiFetch(`${path}/members/${member.id}`, {
                    method: 'DELETE',
                    body: { reason: 'Organization manager removed membership.' },
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>
      <Pagination data={resource.data} page={page} change={setPage} />
    </>
  );
}
function Invitations({ path, roles }: { path: string; roles: BusinessRole[] }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<InvitationView>>(`${path}/invitations?page=${page}`);
  return (
    <>
      <h2>Invitations</h2>
      <p>
        Invitation links are emailed to their intended recipient and expire after a limited time.
      </p>
      <ActionForm
        label="Invite member"
        onSuccess={resource.reload}
        action={(data) =>
          apiFetch(`${path}/invitations`, {
            method: 'POST',
            body: {
              email: text(data, 'email'),
              roles: data.getAll('roles'),
              isManager: data.has('isManager'),
            },
          })
        }
      >
        <Input name="email" label="Invitee email" type="email" required />
        <p className="label">Business roles</p>
        <Checkboxes name="roles" options={roles} />
        <Checkboxes name="isManager" options={['Organization manager']} />
      </ActionForm>
      <ResourceState {...resource} retry={resource.reload} />
      <ul className="record-list">
        {resource.data?.items.map((invitation) => (
          <li key={invitation.id}>
            <strong>{invitation.email}</strong>
            <p>
              {humanize(invitation.status)} · Expires{' '}
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>
            {invitation.status === 'PENDING' && (
              <div className="action-row">
                <ActionForm
                  label="Resend invitation"
                  onSuccess={resource.reload}
                  action={() =>
                    apiFetch(`${path}/invitations/${invitation.id}/resend`, { method: 'POST' })
                  }
                />
                <ActionForm
                  label="Cancel invitation"
                  confirm="Cancel this invitation?"
                  onSuccess={resource.reload}
                  action={() =>
                    apiFetch(`${path}/invitations/${invitation.id}`, { method: 'DELETE' })
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {resource.data?.items.length === 0 && <p>No invitations yet.</p>}
      <Pagination data={resource.data} page={page} change={setPage} />
    </>
  );
}
export function AcceptInvitation() {
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [session, setSession] = useState<{ user: { email: string } } | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const initialized = useRef(false);
  const checkSession = useCallback(async () => {
    setSessionError('');
    try {
      setSession(await apiFetch<{ user: { email: string } } | null>('/api/auth/get-session'));
    } catch (failure) {
      setSessionError(failure instanceof Error ? failure.message : 'Unable to check sign-in.');
    }
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const url = new URL(window.location.href);
    const invitationToken = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
    url.hash = '';
    url.searchParams.delete('token');
    window.history.replaceState(null, '', url.pathname + url.search);
    setToken(invitationToken);
    void checkSession();
  }, [checkSession]);
  return (
    <Workspace
      title="Join your organization."
      description="Accept your invitation using the verified account with the invited email address."
    >
      {done ? (
        <p className="notice success" role="status">
          Invitation accepted. <Link href="/settings/organizations">Open your organizations</Link>.
        </p>
      ) : !token ? (
        <p>Open the invitation link from your email to continue.</p>
      ) : sessionError ? (
        <ResourceState loading={false} error={sessionError} retry={checkSession} />
      ) : session === undefined ? (
        <p role="status">Checking sign-in…</p>
      ) : session ? (
        <section className="panel">
          <p>
            Signed in as <strong>{session.user.email}</strong>.
          </p>
          <ActionForm
            label="Accept invitation"
            successMessage=""
            action={async () => {
              await apiFetch('/api/v1/invitations/accept', { method: 'POST', body: { token } });
              setToken('');
              setDone(true);
            }}
          />
          <ActionForm
            label="Use a different account"
            successMessage=""
            action={async () => {
              await apiFetch('/api/auth/sign-out', { method: 'POST' });
              setSession(null);
              setMode('login');
            }}
          />
        </section>
      ) : (
        <section className="panel invitation-auth">
          <p>
            Keep this page open while you sign in. Your invitation stays here until you accept it.
          </p>
          {registrationMessage && (
            <p className="notice success" role="status">
              {registrationMessage}
            </p>
          )}
          <AuthForm
            key={mode}
            mode={mode}
            next="/invitations/accept"
            embedded
            onAuthenticated={checkSession}
            onRegistered={() => {
              setMode('login');
              setRegistrationMessage(
                'If this address is eligible, a verification email has been sent. Open it in another tab, complete verification, then sign in here to accept your invitation.',
              );
            }}
          />
          <nav className="auth-links" aria-label="Invitation account options">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setRegistrationMessage('');
              }}
            >
              {mode === 'login' ? 'Create an account here' : 'I already have an account'}
            </button>
            <Link href="/auth/verify-email" target="_blank" rel="noopener noreferrer">
              Verify or resend email in another tab
            </Link>
            <Link href="/auth/forgot-password" target="_blank" rel="noopener noreferrer">
              Reset your password in another tab
            </Link>
          </nav>
        </section>
      )}
    </Workspace>
  );
}
