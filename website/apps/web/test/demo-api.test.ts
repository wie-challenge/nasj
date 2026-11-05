import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoRequest, demoSessionRequest } from '../src/lib/demo-api';

test('anonymous demo bootstrap uses only same-origin visitor cookies, without commercial credentials', async () => {
  const original = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/demo/session');
    request = options;
    return Response.json({ available: true, scenario: null });
  };
  try {
    await demoRequest('session');
    assert.equal(request?.method, 'GET');
    assert.equal(request?.credentials, 'same-origin');
    assert.equal(request?.redirect, 'error');
    assert.equal(request?.cache, 'no-store');
    assert.equal(request?.body, undefined);
    assert.deepEqual(request?.headers, { Accept: 'application/json' });
  } finally {
    globalThis.fetch = original;
  }
});
test('demo switching forwards its visitor CSRF proof and retry key, never a password or role grant', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/demo/switch');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(options?.body)), { persona: 'buyer' });
    const headers = options?.headers as Record<string, string>;
    assert.equal(headers['X-Demo-CSRF'], 'visitor-proof');
    assert.equal(headers['Idempotency-Key'], 'stable-retry-key');
    assert.equal(headers.Authorization, undefined);
    return Response.json({ activePersona: 'buyer' });
  };
  try {
    await demoRequest('switch', {
      body: { persona: 'buyer' },
      csrfToken: 'visitor-proof',
      idempotencyKey: 'stable-retry-key',
    });
  } finally {
    globalThis.fetch = original;
  }
});
test('demo errors retain useful safe API messages and redact non-JSON upstream failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { code: 'SCENARIO_CHANGED', message: 'Refresh the current generation.' },
        { status: 409 },
      );
    await assert.rejects(demoRequest('session'), /Refresh the current generation/);
    globalThis.fetch = async () => new Response('private upstream details', { status: 500 });
    await assert.rejects(
      demoRequest('session'),
      (error) => error instanceof Error && !error.message.includes('private upstream'),
    );
    globalThis.fetch = async () => {
      throw new Error('private connection details');
    };
    await assert.rejects(
      demoRequest('session'),
      (error) => error instanceof Error && !error.message.includes('private connection'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('overlapping showroom effects bootstrap one visitor session and proof', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ available: true, csrfToken: 'one-visitor-proof', scenario: null });
  };
  try {
    const [first, second] = await Promise.all([demoSessionRequest(), demoSessionRequest()]);
    assert.equal(calls, 1);
    assert.equal(first.csrfToken, second.csrfToken);
  } finally {
    globalThis.fetch = original;
  }
});
