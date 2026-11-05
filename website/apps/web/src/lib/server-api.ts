import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import type { IdentityContext, MeView } from '@nasj/contracts';
export async function serverApi<T>(path: string): Promise<T | null> {
  if (!path.startsWith('/api/v1/')) throw new Error('Invalid server API destination.');
  const incoming = await headers();
  const origin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  const response = await fetch(new URL(path, origin), {
    headers: { Cookie: incoming.get('cookie') ?? '', Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('The account service is temporarily unavailable.');
  return response.json() as Promise<T>;
}
export const getMe = cache(() => serverApi<MeView>('/api/v1/me'));

export const getIdentityContext = cache(() => serverApi<IdentityContext>('/api/v1/me/context'));
