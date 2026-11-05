import { redirect } from 'next/navigation';
import { getIdentityContext } from '@/lib/server-api';
export default async function Page() {
  const context = await getIdentityContext();
  if (!context)
    return (
      <>
        <h1>Access unavailable</h1>
        <a href="/settings/security">Review security settings</a>
      </>
    );
  if (context.landingPath !== '/dashboard') redirect(context.landingPath);
  redirect('/welcome');
}
