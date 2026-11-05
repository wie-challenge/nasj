'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { SectionShell, ResourceState, ActionForm, Input, useResource, text } from './workspace-ui';
type Security = {
  sessionVerified: boolean;
  twoFactorEnabled: boolean;
  privilegedMfaRequired: boolean;
  hasPrivilegedAccess: boolean;
};
type Enrollment = { totpURI: string; backupCodes: string[] };
export function MfaSettings({ embedded = false }: { embedded?: boolean }) {
  const resource = useResource<Security>('/api/v1/settings/security');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  return (
    <SectionShell
      embedded={embedded}
      title="Account security."
      description="Protect your account with an authenticator app and recovery codes."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <section className="panel">
          <h2>Two-factor authentication</h2>
          <p>
            {resource.data.twoFactorEnabled
              ? 'Two-factor authentication is enabled.'
              : 'Two-factor authentication is not enabled.'}
          </p>
          {resource.data.privilegedMfaRequired && (
            <p className="notice">
              Two-factor authentication is required for privileged actions. Complete enrollment
              before managing organization access or administration.
            </p>
          )}
          {!resource.data.twoFactorEnabled && !enrollment && (
            <ActionForm
              label="Set up authenticator"
              action={async (data) =>
                setEnrollment(
                  await apiFetch<Enrollment>('/api/auth/two-factor/enable', {
                    method: 'POST',
                    body: { password: text(data, 'password') },
                  }),
                )
              }
            >
              <Input name="password" label="Current password" type="password" required />
            </ActionForm>
          )}
          {enrollment && (
            <>
              <h3>Add to your authenticator</h3>
              <p>Import this setup URI into your authenticator app. Keep it private.</p>
              <label className="field">
                <span className="label">Authenticator setup URI</span>
                <input readOnly value={enrollment.totpURI} autoComplete="off" />
              </label>
              <h3>Save your recovery codes</h3>
              <p>
                Store these codes somewhere private. Each code can be used once if you lose access
                to the authenticator.
              </p>
              <pre className="recovery-codes">{enrollment.backupCodes.join('\n')}</pre>
              <ActionForm
                label="Confirm authenticator code"
                action={async (data) => {
                  await apiFetch('/api/auth/two-factor/verify-totp', {
                    method: 'POST',
                    body: { code: text(data, 'code') },
                  });
                  setEnrollment(null);
                  await resource.reload();
                }}
              >
                <Input name="code" label="Six-digit authenticator code" required />
              </ActionForm>
            </>
          )}
          {resource.data.twoFactorEnabled && !resource.data.sessionVerified && (
            <ActionForm
              label="Verify this session"
              onSuccess={resource.reload}
              action={(data) =>
                apiFetch('/api/auth/two-factor/verify-totp', {
                  method: 'POST',
                  body: { code: text(data, 'code') },
                })
              }
            >
              <Input name="code" label="Authenticator code for this session" required />
            </ActionForm>
          )}
          {resource.data.twoFactorEnabled &&
            resource.data.hasPrivilegedAccess &&
            resource.data.privilegedMfaRequired && (
              <p>Your privileged access requires two-factor authentication to remain enabled.</p>
            )}
          {resource.data.twoFactorEnabled &&
            !(resource.data.hasPrivilegedAccess && resource.data.privilegedMfaRequired) && (
              <ActionForm
                label="Disable two-factor authentication"
                confirm="Disable two-factor authentication? Privileged operations will require re-enrollment."
                onSuccess={resource.reload}
                action={(data) =>
                  apiFetch('/api/auth/two-factor/disable', {
                    method: 'POST',
                    body: { password: text(data, 'password') },
                  })
                }
              >
                <Input
                  name="password"
                  label="Password to disable two-factor authentication"
                  type="password"
                  required
                />
              </ActionForm>
            )}
        </section>
      )}
    </SectionShell>
  );
}
