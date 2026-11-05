'use client';
import { useHydrated } from '@/lib/use-hydrated';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ActionForm, Input, useResource } from './workspace-ui';
import {
  changePasswordSchema,
  deactivateSchema,
  profileSchema,
  type IdentityContext,
  type MeView,
  type SessionView,
} from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { workspaceRoleLabel } from '@/lib/app-navigation';
import { Field } from './field';
import { Notifications } from './governance';
import { MfaSettings } from './mfa-settings';
import { Card } from './ui/card';
const organizationTypes: Record<string, string> = {
  BUYER_BUSINESS: 'Company',
  ASSOCIATION: 'Association',
  PARTNER_COOPERATIVE: 'Association',
  INTERNAL: 'NASJ team',
};
export function Profile({ initial }: { initial: MeView }) {
  const router = useRouter();
  const responsibilities = useResource<{
    items: { organizationId: string; name: string; reason: string }[];
  }>('/api/v1/me/responsibilities');
  const identity = useResource<IdentityContext>('/api/v1/me/context');
  const organization =
    identity.data?.organizations.find(
      (org) => org.type !== 'INTERNAL' && org.approvalStatus !== 'REJECTED',
    ) ?? identity.data?.organizations.find((org) => org.type === 'INTERNAL');
  const ready = useHydrated();
  const [user, setUser] = useState(initial.user);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [pending, start] = useTransition();
  const report = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      router.replace('/auth/login');
      router.refresh();
    }
    setError(failure instanceof Error ? failure.message : 'Unable to complete this request.');
  };
  useEffect(() => {
    let active = true;
    apiFetch<{ items: SessionView[] }>('/api/v1/me/sessions')
      .then((data) => {
        if (active) setSessions(data.items);
      })
      .catch((failure) => {
        if (active)
          setError(failure instanceof Error ? failure.message : 'Unable to load sessions.');
      });
    return () => {
      active = false;
    };
  }, []);
  function submit(
    event: React.FormEvent<HTMLFormElement>,
    action: 'profile' | 'password' | 'deactivate',
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    const schema =
      action === 'profile'
        ? profileSchema
        : action === 'password'
          ? changePasswordSchema
          : deactivateSchema;
    const result = schema.safeParse(input);
    setError('');
    setMessage('');
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    start(async () => {
      try {
        if (action === 'profile') {
          const updated = await apiFetch<typeof user>('/api/v1/me', {
            method: 'PATCH',
            body: result.data,
          });
          setUser(updated);
          setMessage('Your profile has been saved.');
          router.refresh();
        } else if (action === 'password') {
          await apiFetch('/api/auth/change-password', { method: 'POST', body: result.data });
          form.reset();
          setMessage('Password updated. Other sessions have been signed out.');
          const current = await apiFetch<{ items: SessionView[] }>('/api/v1/me/sessions');
          setSessions(current.items);
        } else {
          await apiFetch('/api/v1/me/deactivate', { method: 'POST', body: result.data });
          router.replace('/auth/login');
          router.refresh();
        }
      } catch (failure) {
        report(failure);
      }
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your profile</h1>
          <p className="lead">Your details, password and security, all in one place.</p>
        </div>
      </div>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="profile-page">
        {organization && (
          <Card className="panel block gap-0 p-5">
            <h2>Your organization</h2>
            <p>
              <strong>{organization.name}</strong>
            </p>
            <p>
              {organizationTypes[organization.type] ?? 'Organization'} ·{' '}
              {workspaceRoleLabel(identity.data)}
            </p>
            {organization.type !== 'INTERNAL' && organization.approvalStatus === 'APPROVED' && (
              <p>
                <Link href="/team">Manage your team</Link>
              </p>
            )}
          </Card>
        )}
        <Card className="panel block gap-0 p-5">
          <div className="panel-heading">
            <div>
              <h2>Personal details</h2>
              <p>Your name is how we’ll address you.</p>
            </div>
          </div>
          <form method="post" onSubmit={(event) => submit(event, 'profile')}>
            <fieldset disabled={pending || !ready}>
              <Field name="name" label="Your name" defaultValue={user.name} autoComplete="name" />
              <div className="field">
                <span className="label">Email address</span>
                <p>{user.email}</p>
              </div>
              <button className="button" type="submit">
                Save profile
              </button>
            </fieldset>
          </form>
        </Card>
        <Card className="panel wide block gap-0 p-5">
          <h2>Change email address</h2>
          <p>
            Confirm the change through your current email, then verify the new address. Your login
            email stays unchanged until verification completes. A recent sign-in is required.
          </p>
          <ActionForm
            label="Request email change"
            action={(data) =>
              apiFetch('/api/auth/change-email', {
                method: 'POST',
                body: { newEmail: String(data.get('newEmail') ?? '').trim() },
              })
            }
          >
            <Input name="newEmail" label="New email address" type="email" required />
          </ActionForm>
        </Card>
        <Card className="panel block gap-0 p-5">
          <div className="panel-heading">
            <div>
              <h2>Password</h2>
              <p>A new password signs out your other devices.</p>
            </div>
          </div>
          <form method="post" onSubmit={(event) => submit(event, 'password')}>
            <fieldset disabled={pending || !ready}>
              <Field
                name="currentPassword"
                label="Current password"
                type="password"
                autoComplete="current-password"
              />
              <Field
                name="newPassword"
                label="New password"
                type="password"
                autoComplete="new-password"
                hint="At least 12 characters."
              />
              <button className="button secondary" type="submit">
                Update password
              </button>
            </fieldset>
          </form>
        </Card>
        <Card className="panel wide block gap-0 p-5">
          <div className="panel-heading">
            <div>
              <h2>Signed-in devices</h2>
              <p>Sign out everywhere except on this device.</p>
            </div>
          </div>
          <ActionForm
            label="Sign out other devices"
            action={async () => {
              await apiFetch('/api/v1/me/sessions/revoke-others', { method: 'POST' });
              setSessions((items) => items?.filter((item) => item.current) ?? []);
            }}
          />
          <p>
            {sessions === null
              ? 'Checking your devices…'
              : `You are signed in on ${sessions.length} ${sessions.length === 1 ? 'device' : 'devices'}.`}
          </p>
        </Card>
        <MfaSettings embedded />
        <Notifications embedded />
        <Card className="panel wide block gap-0 p-5">
          <details>
            <summary>Deactivate account</summary>
            <p>
              Deactivation prevents sign-in and ends all your sessions. Your records are retained.
              Contact an administrator if you need to restore access.
            </p>
            {responsibilities.data && responsibilities.data.items.length > 0 && (
              <div className="notice">
                <p>Assign another active manager before deactivating your account:</p>
                <ul>
                  {responsibilities.data.items.map((item) => (
                    <li key={item.organizationId}>
                      <Link href={`/organizations/${item.organizationId}/settings`}>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form method="post" onSubmit={(event) => submit(event, 'deactivate')}>
              <fieldset disabled={pending || !ready}>
                <Field name="confirmation" label="Type DEACTIVATE to confirm" autoComplete="off" />
                <button className="button danger" type="submit">
                  Deactivate my account
                </button>
              </fieldset>
            </form>
          </details>
        </Card>
        <p>
          <Link href="/support/privacy">Your data and privacy</Link>
        </p>
      </div>
    </>
  );
}
