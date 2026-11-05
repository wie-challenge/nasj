import { redirect } from 'next/navigation';
import { getMe, getIdentityContext } from '@/lib/server-api';
import { AppShell } from '@/components/app-shell';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  const context = await getIdentityContext();
  return (
    <AppShell
      context={context}
      name={me.user.name}
      capabilities={{
        buyer: Boolean(context?.personas.includes('BUYER_REPRESENTATIVE')),
        artisan: Boolean(context?.linkedArtisanProfileId),
        operator: Boolean(
          context?.organizations.some(
            (o) =>
              o.type === 'INTERNAL' &&
              o.permissions.some((p) =>
                [
                  'production.manage',
                  'finance.payout.read',
                  'buyer.relationship.manage',
                  'quality.inspection.create',
                  'inventory.manage',
                ].includes(p),
              ),
          ),
        ),
        admin: me.user.role === 'ADMIN',
      }}
    >
      {children}
    </AppShell>
  );
}
