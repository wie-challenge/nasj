import Link from 'next/link';
import { getIdentityContext } from '@/lib/server-api';
import type { OperationalPersona } from '@nasj/contracts';
export function DeniedWorkspace() {
  return (
    <>
      <h1>Access denied</h1>
      <p>This workspace requires an active approved affiliation and the appropriate permission.</p>
      <p>
        <Link href="/dashboard">Access overview</Link> ·{' '}
        <Link href="/settings/security">Security settings</Link>
      </p>
    </>
  );
}
export async function FoundationGate({
  persona,
  children,
}: {
  persona: OperationalPersona;
  children: React.ReactNode;
}) {
  const context = await getIdentityContext();
  return context?.personas.includes(persona) ? children : <DeniedWorkspace />;
}
export async function CommerceGate({
  mode,
  children,
}: {
  mode: 'buyer' | 'artisan' | 'operator';
  children: React.ReactNode;
}) {
  const context = await getIdentityContext();
  const allowed =
    mode === 'buyer'
      ? context?.personas.includes('BUYER_REPRESENTATIVE')
      : mode === 'artisan'
        ? Boolean(context?.linkedArtisanProfileId)
        : context?.organizations.some(
            (o) =>
              o.type === 'INTERNAL' &&
              o.permissions.some((p) =>
                [
                  'production.manage',
                  'finance.payout.read',
                  'quality.inspection.create',
                  'inventory.manage',
                ].includes(p),
              ),
          );
  return allowed ? children : <DeniedWorkspace />;
}
