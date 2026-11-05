'use client';
import { UserPlus } from 'lucide-react';
import type { IdentityContext } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Input, ResourceState, Workspace, text, useResource } from '../workspace-ui';
import { ModalAction } from './market-ui';
import styles from './market.module.css';

type Members = {
  items: {
    id: string;
    isManager: boolean;
    status: string;
    user: { name: string; email: string };
  }[];
};
type Invitations = {
  items: { id: string; email: string; status: string; expiresAt: string }[];
};

function TeamTables({ id, type }: { id: string; type: string }) {
  const members = useResource<Members>(`/api/v1/organizations/${id}/members`);
  const invitations = useResource<Invitations>(`/api/v1/organizations/${id}/invitations`);
  const pending = invitations.data?.items.filter((item) => item.status === 'PENDING') ?? [];
  const role = type === 'BUYER_BUSINESS' ? 'BUYER_REPRESENTATIVE' : 'ASSOCIATION_COORDINATOR';
  return (
    <Workspace
      title="Your team"
      description="The people who can act for your organization. Each person belongs to one organization."
      actions={
        <ModalAction
          label={
            <>
              <UserPlus size={16} aria-hidden="true" />
              Invite someone
            </>
          }
          title="Invite someone to your team"
          description="We will email them an invitation."
          submitLabel="Send invitation"
          successMessage="Invitation sent."
          onSuccess={invitations.reload}
          action={(data) =>
            apiFetch(`/api/v1/organizations/${id}/invitations`, {
              method: 'POST',
              body: { email: text(data, 'email'), roles: [role], isManager: false },
            })
          }
        >
          <Input name="email" label="Their email address" type="email" required />
        </ModalAction>
      }
    >
      <ResourceState {...members} retry={members.reload} />
      {members.data && (
        <div className={`panel ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {members.data.items.map((member) => (
                <tr key={member.id}>
                  <td>{member.user.name}</td>
                  <td>{member.user.email}</td>
                  <td>{member.isManager ? 'Manager' : 'Member'}</td>
                </tr>
              ))}
              {pending.map((invite) => (
                <tr key={invite.id}>
                  <td>
                    <span className={styles.badge}>Invited</span>
                  </td>
                  <td>{invite.email}</td>
                  <td className={styles.muted}>
                    Waiting until {new Date(invite.expiresAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Workspace>
  );
}

export function Team() {
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const own = context.data?.organizations.find((org) => org.type !== 'INTERNAL');
  if (!context.data) return <ResourceState {...context} retry={context.reload} />;
  if (!own) return <p>You are not part of a company or association yet.</p>;
  return <TeamTables id={own.id} type={own.type} />;
}
