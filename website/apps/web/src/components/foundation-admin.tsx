'use client';
import { useState } from 'react';
import type { Page as PageData } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  Checkboxes,
  useResource,
  text,
  humanize,
} from './workspace-ui';
import { EvidenceFields, evidence } from './foundation-workspace';
import { Card } from './ui/card';
import { Pagination } from './governance';
type Organization = { id: string; name: string; type: string; approvalStatus: string };
type Coordinator = {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  organization: { name: string };
  user: { name: string; email: string };
};
const post = (path: string, body: unknown) => apiFetch(`/api/v1/${path}`, { method: 'POST', body });
export function PersonnelAdmin({ coordinators = false }: { coordinators?: boolean }) {
  const organizations = useResource<PageData<Organization>>(
    '/api/v1/admin/organizations?pageSize=100',
  );
  const [page, setPage] = useState(1);
  const members = useResource<PageData<Coordinator>>(
    `/api/v1/admin/${coordinators ? 'coordinators' : 'operators'}?page=${page}`,
  );
  const approved =
    organizations.data?.items.filter(
      (o) =>
        o.approvalStatus === 'APPROVED' &&
        (coordinators
          ? ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(o.type)
          : o.type === 'INTERNAL'),
    ) ?? [];
  return (
    <Workspace
      title={coordinators ? 'Coordinator access' : 'Internal operator access'}
      description="Privileged personnel require an administrator invitation and a verified account."
    >
      <ResourceState {...organizations} retry={organizations.reload} />
      <Card className="panel block p-5">
        <h2>Invite {coordinators ? 'a coordinator' : 'an operator'}</h2>
        <ActionForm
          label="Send personnel invitation"
          action={(d) =>
            post('admin/personnel/invite', {
              organizationId: text(d, 'organizationId'),
              email: text(d, 'email'),
              persona: coordinators ? 'ASSOCIATION_COORDINATOR' : 'NASJ_OPERATOR',
              reason: text(d, 'reason'),
            })
          }
        >
          <Select
            name="organizationId"
            label="Approved organization"
            required
            options={[
              { value: '', label: 'Choose an approved organization' },
              ...approved.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <Input name="email" label="Personnel email" type="email" required />
          <Input name="reason" label="Invitation reason" required />
        </ActionForm>
      </Card>
      {coordinators ? (
        <>
          <ResourceState {...members} retry={members.reload} />
          {members.data?.items.map((m) => (
            <Card key={m.id} className="panel block p-5">
              <h2>{m.user.name}</h2>
              <p>
                {m.organization.name} · {humanize(m.status)}
              </p>
              <ActionForm
                label="Change coordinator affiliation status"
                action={(d) =>
                  apiFetch(`/api/v1/admin/coordinators/${m.userId}/status`, {
                    method: 'PATCH',
                    body: {
                      organizationId: m.organizationId,
                      status: text(d, 'status'),
                      reason: text(d, 'reason'),
                    },
                  })
                }
                onSuccess={members.reload}
              >
                <Select
                  name="status"
                  label="Affiliation status"
                  options={['ACTIVE', 'SUSPENDED', 'REVOKED']}
                />
                <Input name="reason" label="Affiliation change reason" required />
              </ActionForm>
              <details>
                <summary>Transfer to another association</summary>
                <p>
                  Existing artisan assignments end and require explicit reassignment. History is
                  retained.
                </p>
                <ActionForm
                  label="Transfer coordinator"
                  action={(d) =>
                    post(`admin/coordinators/${m.userId}/transfer`, {
                      organizationId: text(d, 'organizationId'),
                      reason: text(d, 'reason'),
                    })
                  }
                  onSuccess={members.reload}
                >
                  <Select
                    name="organizationId"
                    label="Destination association"
                    required
                    options={[
                      { value: '', label: 'Choose destination' },
                      ...approved
                        .filter((o) => o.id !== m.organizationId)
                        .map((o) => ({ value: o.id, label: o.name })),
                    ]}
                  />
                  <Input name="reason" label="Transfer reason" required />
                </ActionForm>
              </details>
            </Card>
          ))}
          <Pagination data={members.data} page={page} change={setPage} />
          <ArtisanGovernance
            organizations={organizations.data?.items ?? []}
            coordinators={members.data?.items ?? []}
          />
        </>
      ) : (
        <>
          <ResourceState {...members} retry={members.reload} />
          {members.data?.items.map((m) => (
            <Card key={m.id} className="panel block p-5">
              <h2>{m.user.name}</h2>
              <p>
                {m.organization.name} · {humanize(m.status)}
              </p>
              <p>
                User reference: {m.userId} · Membership reference: {m.id}
              </p>
              <ActionForm
                label="Change operator access"
                action={(d) =>
                  apiFetch(`/api/v1/organizations/${m.organizationId}/members/${m.id}`, {
                    method: 'PATCH',
                    body: { status: text(d, 'status'), reason: text(d, 'reason') },
                  })
                }
                onSuccess={members.reload}
              >
                <Select
                  name="status"
                  label="Operator membership status"
                  options={['ACTIVE', 'SUSPENDED', 'REVOKED']}
                />
                <Input name="reason" label="Operator access change reason" required />
              </ActionForm>
            </Card>
          ))}
          <Pagination data={members.data} page={page} change={setPage} />
          <OperatorAssignments organizations={organizations.data?.items ?? []} />
        </>
      )}
    </Workspace>
  );
}
function OperatorAssignments({ organizations }: { organizations: Organization[] }) {
  return (
    <Card className="panel block p-5">
      <h2>Assign buyer and partner accounts</h2>
      <p>
        Use the verified user reference from account administration. Only active internal operators
        can receive account assignments.
      </p>
      <ActionForm
        label="Save operator account assignment"
        action={(d) =>
          post('admin/operator-assignments', {
            operatorId: text(d, 'operatorId'),
            organizationId: text(d, 'organizationId'),
            enabled: text(d, 'enabled') === 'true',
            reason: text(d, 'reason'),
          })
        }
      >
        <Input name="operatorId" label="Operator user reference" required />
        <Select
          name="organizationId"
          label="Buyer or partner account"
          required
          options={[
            { value: '', label: 'Choose approved account' },
            ...organizations
              .filter((o) => o.type !== 'INTERNAL' && o.approvalStatus === 'APPROVED')
              .map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
        <Select
          name="enabled"
          label="Assignment access"
          options={[
            { value: 'true', label: 'Grant' },
            { value: 'false', label: 'Revoke' },
          ]}
        />
        <Input name="reason" label="Assignment reason" required />
      </ActionForm>
      <h2>Financial authority</h2>
      <p>
        Real payouts remain disabled. A separate administrator must grant sensitive authority;
        granting a permission does not enable a real payment system.
      </p>
      <PermissionGrant />
    </Card>
  );
}
export function PermissionGrant() {
  return (
    <ActionForm
      label="Save explicit permission"
      action={(d) =>
        apiFetch(
          `/api/v1/organizations/${text(d, 'organizationId')}/members/${text(d, 'memberId')}/permissions`,
          {
            method: 'PUT',
            body: {
              permission: text(d, 'permission'),
              enabled: text(d, 'enabled') === 'true',
              reason: text(d, 'reason'),
            },
          },
        )
      }
    >
      <Input name="organizationId" label="Organization reference" required />
      <Input name="memberId" label="Membership reference" required />
      <Select
        name="permission"
        label="Explicit authority"
        options={['buyer.quotation.approve', 'operator.payout.initiate', 'operator.payout.approve']}
      />
      <Select
        name="enabled"
        label="Permission access"
        options={[
          { value: 'true', label: 'Grant' },
          { value: 'false', label: 'Revoke' },
        ]}
      />
      <Input name="reason" label="Permission review reason" required />
    </ActionForm>
  );
}
function ArtisanGovernance({
  organizations,
  coordinators,
}: {
  organizations: Organization[];
  coordinators: Coordinator[];
}) {
  const policies = useResource<{ id: string; version: string; methods: string[] }[]>(
    '/api/v1/authorization-policies',
  );
  return (
    <Card className="panel block p-5">
      <h2>Participant access governance</h2>
      <p>
        Use a reviewed artisan reference. These actions do not expose private participant or
        financial records.
      </p>
      <ActionForm
        label="Reassign responsible coordinator"
        action={(d) =>
          post(`admin/artisans/${text(d, 'artisanId')}/assignment`, {
            coordinatorId: text(d, 'coordinatorId'),
            reason: text(d, 'reason'),
          })
        }
      >
        <Input name="artisanId" label="Artisan reference" required />
        <Select
          name="coordinatorId"
          label="Responsible coordinator"
          required
          options={[
            { value: '', label: 'Choose active coordinator' },
            ...coordinators
              .filter((c) => c.status === 'ACTIVE')
              .map((c) => ({ value: c.userId, label: `${c.user.name} — ${c.organization.name}` })),
          ]}
        />
        <Input name="reason" label="Reassignment reason" required />
      </ActionForm>
      <details>
        <summary>Link a verified participant account</summary>
        <ActionForm
          label="Link reviewed account"
          action={(d) =>
            post(`admin/artisans/${text(d, 'artisanId')}/link-account`, {
              userId: text(d, 'userId'),
              verificationReference: text(d, 'verificationReference'),
              reason: text(d, 'reason'),
            })
          }
        >
          <Input name="artisanId" label="Existing artisan reference" required />
          <Input name="userId" label="Verified user reference" required />
          <Input
            name="verificationReference"
            label="Reviewed identity verification evidence"
            required
          />
          <Input name="reason" label="Account-link review reason" required />
        </ActionForm>
      </details>
      <details>
        <summary>Transfer artisan to another managing association</summary>
        {policies.data && (
          <ActionForm
            label="Transfer artisan with authorization"
            action={(d) =>
              post(`admin/artisans/${text(d, 'artisanId')}/transfer`, {
                organizationId: text(d, 'organizationId'),
                coordinatorId: text(d, 'coordinatorId'),
                authorization: evidence(d),
                reason: text(d, 'reason'),
              })
            }
          >
            <Input name="artisanId" label="Participant reference to transfer" required />
            <Select
              name="organizationId"
              label="New managing association"
              required
              options={[
                { value: '', label: 'Choose approved destination' },
                ...organizations
                  .filter(
                    (o) =>
                      ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(o.type) &&
                      o.approvalStatus === 'APPROVED',
                  )
                  .map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <Input
              name="coordinatorId"
              label="New responsible coordinator user reference"
              required
            />
            <EvidenceFields policies={policies.data} />
            <Input name="reason" label="Artisan transfer review reason" required />
          </ActionForm>
        )}
      </details>
      <p>
        Transfers between managing associations require new documented participation authorization.
        Approved destinations:{' '}
        {organizations
          .filter(
            (o) =>
              ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(o.type) &&
              o.approvalStatus === 'APPROVED',
          )
          .map((o) => o.name)
          .join(', ') || 'none'}
        .
      </p>
    </Card>
  );
}
export function AuthorizationPolicies() {
  const policies = useResource<{ id: string; version: string; methods: string[] }[]>(
    '/api/v1/authorization-policies',
  );
  return (
    <Workspace
      title="Assisted authorization policies"
      description="Record a legally reviewed policy reference before coordinators can onboard participants. Software does not replace legal review."
    >
      <ResourceState {...policies} retry={policies.reload} />
      <Card className="panel block p-5">
        <ActionForm
          label="Record reviewed authorization policy"
          action={(d) =>
            post('admin/authorization-policies', {
              version: text(d, 'version'),
              methods: d.getAll('methods'),
              reviewReference: text(d, 'reviewReference'),
            })
          }
          onSuccess={policies.reload}
        >
          <Input name="version" label="Policy version" required />
          <Input name="reviewReference" label="Legal review reference" required />
          <Checkboxes
            name="methods"
            options={['SIGNED', 'WITNESSED_VERBAL', 'SMS_CONFIRMATION', 'APPROVED_ACCESSIBLE']}
          />
        </ActionForm>
      </Card>
      {policies.data?.map((p) => (
        <Card className="panel block p-5" key={p.id}>
          <h2>{p.version}</h2>
          <p>{p.methods.map(humanize).join(', ')}</p>
          <ActionForm
            label="Withdraw authorization policy"
            action={(d) =>
              apiFetch(`/api/v1/admin/authorization-policies/${p.id}`, {
                method: 'PATCH',
                body: { active: false, reason: text(d, 'reason') },
              })
            }
            onSuccess={policies.reload}
          >
            <Input name="reason" label="Policy withdrawal reason" required />
          </ActionForm>
        </Card>
      ))}
    </Workspace>
  );
}

export function AccessReport() {
  const [page, setPage] = useState(1);
  const r = useResource<
    PageData<{
      id: string;
      user: { name: string; status: string };
      organization: { name: string; type: string; status: string };
      roles: string[];
      permissions: string[];
      status: string;
    }>
  >(`/api/v1/admin/access-report?page=${page}`);
  return (
    <Workspace
      title="Access diagnostics"
      description="Effective account, organization, role and permission boundaries. No financial or wearable records appear here."
    >
      <ResourceState {...r} retry={r.reload} />
      {r.data?.items.map((m) => (
        <Card key={m.id} className="panel block p-5">
          <h2>
            {m.user.name} · {m.organization.name}
          </h2>
          <p>
            {humanize(m.status)} membership · {humanize(m.user.status)} account ·{' '}
            {humanize(m.organization.status)} organization
          </p>
          <p>Membership reference: {m.id}</p>
          <p>Roles: {m.roles.map(humanize).join(', ') || 'None'}</p>
          <details>
            <summary>Effective permissions</summary>
            <ul>
              {m.permissions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {!m.permissions.length && <p>No effective permissions.</p>}
          </details>
        </Card>
      ))}
      <Pagination data={r.data} page={page} change={setPage} />
    </Workspace>
  );
}
