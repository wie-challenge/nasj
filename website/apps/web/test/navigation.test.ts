import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, safeApiPath } from '../src/lib/navigation';
import { apiFetch, ApiError } from '../src/lib/api';
test('login redirect allowlist rejects external, encoded and unsupported destinations', () => {
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%5cevil.example',
    '/%2f%2fevil.example',
    '/auth/login',
    'javascript:alert(1)',
  ])
    assert.equal(safeNext(value), '/dashboard');
  assert.equal(safeNext('/admin/users?page=2'), '/admin/users?page=2');
  assert.equal(safeApiPath('/api/v1/../auth/sign-out'), false);
  assert.equal(safeApiPath('/api/v1/%ZZ'), false);
  assert.equal(safeApiPath('/api/v1/%5csecrets'), false);
});
test('browser mutations obtain a session-bound CSRF proof and never store session credentials', async () => {
  const original = globalThis.fetch;
  const calls: [string, RequestInit | undefined][] = [];
  globalThis.fetch = async (url, options) => {
    calls.push([String(url), options]);
    return Response.json(calls.length === 1 ? { csrfToken: 'test-proof' } : { name: 'Updated' });
  };
  try {
    await apiFetch('/api/v1/me', { method: 'PATCH', body: { name: 'Updated' } });
    assert.equal(calls[0][0], '/api/v1/me');
    assert.equal((calls[1][1]!.headers as Record<string, string>)['X-CSRF-Token'], 'test-proof');
    assert.equal(calls[1][1]?.credentials, 'same-origin');
    assert.equal(calls[1][1]?.cache, 'no-store');
  } finally {
    globalThis.fetch = original;
  }
});
test('API failures and network errors become safe user-facing errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ code: 'CSRF_REJECTED', message: 'Refresh and try again.' }, { status: 403 });
    await assert.rejects(
      apiFetch('/api/v1/me'),
      (error) => error instanceof ApiError && error.status === 403,
    );
    globalThis.fetch = async () => {
      throw new Error('private upstream credentials');
    };
    await assert.rejects(
      apiFetch('/api/v1/me'),
      (error) => error instanceof ApiError && !error.message.includes('credentials'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('workspace redirects allow scoped destinations and discard invitation secrets', () => {
  for (const path of [
    '/settings/organizations',
    '/settings/security',
    '/artisan/capacity',
    '/artisan/assisted/artisan_123',
    '/organizations/org-123/settings',
    '/organizations/org-123/audit',
    '/admin/approvals',
    '/support/privacy',
    '/operator/planning',
    '/operator/planning/order_123',
    '/catalog',
    '/intelligence',
    '/collaboration',
  ])
    assert.equal(safeNext(path), path);
  assert.equal(safeNext('/invitations/accept#token=private'), '/invitations/accept');
  for (const path of [
    '/organizations/id/private',
    '/admin/organizations/id/private',
    '/artisan/assisted/id/private',
  ])
    assert.equal(safeNext(path), '/dashboard');
});

test('PUT mutations use the same CSRF and credential protections as other writes', async () => {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options ?? {});
    return Response.json(calls.length === 1 ? { csrfToken: 'put-proof' } : { items: [] });
  };
  try {
    await apiFetch('/api/v1/artisans/me/skills', { method: 'PUT', body: { items: [] } });
    assert.equal(calls[1].method, 'PUT');
    assert.equal((calls[1].headers as Record<string, string>)['X-CSRF-Token'], 'put-proof');
    assert.equal(calls[1].credentials, 'same-origin');
    assert.equal(calls[1].redirect, 'error');
  } finally {
    globalThis.fetch = original;
  }
});
