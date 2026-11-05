import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';
import { Profile } from '@/components/profile';
export default async function ProfilePage() {
  const me = await getMe();
  if (!me) redirect('/auth/login');
  return <Profile initial={me} />;
}
