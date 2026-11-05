import type { ApiFailure, MeView } from '@nasj/contracts';
import { safeApiPath } from './navigation';
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiFailure,
  ) {
    super(detail.message);
  }
}
export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  if (!safeApiPath(path)) throw new Error('Invalid API destination.');
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (path.startsWith('/api/v1/'))
      headers['X-CSRF-Token'] = (await apiFetch<MeView>('/api/v1/me')).csrfToken;
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(503, {
      code: 'API_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Please try again.',
    });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.code && typeof body.message === 'string'
        ? body
        : { code: 'REQUEST_FAILED', message: 'Unable to complete this request.' },
    );
  return body as T;
}
