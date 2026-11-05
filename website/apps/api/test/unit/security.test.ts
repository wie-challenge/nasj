import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { ArcjetNest } from '@arcjet/nest';
import { SecurityService } from '../../src/security/security.service.js';
import { validateEnvironment } from '../../src/config/env.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { logger } from '../../src/common/logging.js';
logger.level = 'silent';
test('production requires enforcing Arcjet mode while nonproduction permits observation', () => {
  const production = {
    NODE_ENV: 'production',
    PUBLIC_APP_URL: 'https://security-test.invalid',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/security_test',
    BETTER_AUTH_SECRET: 'a'.repeat(64),
    REQUIRE_PRIVILEGED_MFA: 'true',
    ARCJET_ENABLED: 'true',
    ARCJET_KEY: 'synthetic-never-sent',
    SMTP_REQUIRE_TLS: 'true',
    SMTP_USER: 'synthetic',
    SMTP_PASSWORD: 'synthetic',
  };
  for (const mode of [undefined, 'DRY_RUN'])
    assert.throws(
      () => validateEnvironment({ ...production, ARCJET_MODE: mode }),
      /Production requires ARCJET_MODE=LIVE/,
    );
  assert.equal(validateEnvironment({ ...production, ARCJET_MODE: 'LIVE' }).ARCJET_MODE, 'LIVE');
  assert.throws(() =>
    validateEnvironment({ ...production, ARCJET_MODE: 'LIVE', ARCJET_ENABLED: 'false' }),
  );
  assert.throws(() => validateEnvironment({ ...production, ARCJET_MODE: 'LIVE', ARCJET_KEY: '' }));
  for (const mode of [undefined, 'DRY_RUN'])
    assert.equal(
      validateEnvironment({ ...production, NODE_ENV: 'development', ARCJET_MODE: mode })
        .ARCJET_MODE,
      'DRY_RUN',
    );
});
function fixture(
  mode: 'LIVE' | 'DRY_RUN',
  kind: 'allow' | 'rate' | 'bot' | 'error',
  failure: 'closed' | 'open' = 'closed',
) {
  const calls: unknown[][] = [],
    rules: unknown[] = [];
  const reason = {
    type: kind,
    reset: 20,
    isRateLimit: () => kind === 'rate',
    isBot: () => kind === 'bot',
    isShield: () => false,
    isEmail: () => false,
  };
  const client = {
    withRule: (rule: unknown) => {
      rules.push(rule);
      return client;
    },
    protect: async (...args: unknown[]) => {
      calls.push(args);
      return {
        id: 'test-decision',
        reason,
        results: [],
        isDenied: () => ['rate', 'bot'].includes(kind),
        isErrored: () => kind === 'error',
      };
    },
  } as unknown as ArcjetNest;
  let localCalls = 0;
  const db = {
    $queryRaw: async () => {
      localCalls++;
      return [{ count: 1, resetAt: new Date(Date.now() + 60000) }];
    },
  } as unknown as PrismaService;
  const config = validateEnvironment({
    NODE_ENV: 'test',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    BETTER_AUTH_SECRET: 'a'.repeat(64),
    ARCJET_ENABLED: 'true',
    ARCJET_KEY: 'test-only-never-sent',
    ARCJET_MODE: mode,
    ARCJET_FAILURE_MODE: failure,
  });
  const service = new SecurityService(config, db, client);
  const req = {
    method: 'POST',
    path: '/api/auth/sign-up/email',
    ip: '127.0.0.1',
    protocol: 'http',
    body: { email: 'maker+tag@example.com', password: 'credential' },
    headers: {
      cookie: 'private-cookie',
      authorization: 'private-token',
      'x-forwarded-for': '203.0.113.50',
      'user-agent': 'browser',
    },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const headers = new Map<string, unknown>();
  const res = {
    setHeader: (key: string, value: unknown) => headers.set(key, value),
    once: () => {},
    statusCode: 200,
  } as unknown as Response;
  return { service, req, res, calls, rules, localCalls: () => localCalls, headers };
}
test('legitimate Arcjet decisions pass without a second rate counter or credential forwarding', async () => {
  const f = fixture('LIVE', 'allow');
  await f.service.protect(f.req, f.res);
  assert.equal(f.calls.length, 1);
  assert.equal(f.localCalls(), 0);
  const [request, props] = f.calls[0] as [
    { headers: Record<string, string>; body?: unknown },
    { ipSrc: string; email: string },
  ];
  assert.equal(request.headers.cookie, undefined);
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.body, undefined);
  assert.equal(props.ipSrc, '127.0.0.1');
  assert.equal(props.email, 'maker+tag@example.com');
  assert.equal(f.rules.length, 3);
});
test('live rate decisions return 429 and bot decisions return 403', async () => {
  for (const [kind, status] of [
    ['rate', 429],
    ['bot', 403],
  ] as const) {
    const f = fixture('LIVE', kind);
    await assert.rejects(
      f.service.protect(f.req, f.res),
      (error) => (error as { getStatus(): number }).getStatus() === status,
    );
  }
});
test('dry-run deny remains observable without blocking normal authentication', async () => {
  const f = fixture('DRY_RUN', 'bot');
  await f.service.protect(f.req, f.res);
  assert.equal(f.calls.length, 1);
});
test('operational failure is closed by default; explicit open mode uses only the local fallback counter', async () => {
  const closed = fixture('LIVE', 'error');
  await assert.rejects(
    closed.service.protect(closed.req, closed.res),
    (error) => (error as { getStatus(): number }).getStatus() === 503,
  );
  assert.equal(closed.localCalls(), 0);
  const open = fixture('LIVE', 'error', 'open');
  await open.service.protect(open.req, open.res);
  assert.equal(open.localCalls(), 1);
});
test('health probes never invoke bot/provider rules', async () => {
  const f = fixture('LIVE', 'bot');
  f.req.method = 'GET';
  Object.defineProperty(f.req, 'path', { value: '/api/health/live' });
  await f.service.protect(f.req, f.res);
  assert.equal(f.calls.length, 0);
});
