import assert from 'node:assert/strict';
import type { ArcjetNest } from '@arcjet/nest';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { testConfig } from './support.js';

export async function runSecurityScenarios({
  databaseUrl,
  smtpPort,
  check,
}: {
  databaseUrl: string;
  smtpPort: number;
  check: (name: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const config = (overrides: Record<string, unknown> = {}) =>
    testConfig(databaseUrl, smtpPort, {
      NODE_ENV: 'production',
      PUBLIC_APP_URL: 'https://rate-test.invalid',
      REQUIRE_PRIVILEGED_MFA: 'true',
      ARCJET_ENABLED: 'true',
      ARCJET_KEY: 'synthetic-not-sent',
      ARCJET_MODE: 'LIVE',
      SMTP_REQUIRE_TLS: 'true',
      SMTP_USER: 'synthetic',
      SMTP_PASSWORD: 'synthetic',
      RATE_API_MAX: 2,
      RATE_LOGIN_MAX: 2,
      RATE_RESET_MAX: 2,
      ...overrides,
    });
  for (const mode of ['LIVE', 'DRY_RUN'] as const) {
    await check(
      `FPA-02 HTTP ${mode} preserves enforcement or nonproduction observation`,
      async () => {
        let kind: 'rate' | 'allow' = 'rate';
        let calls = 0;
        const reason = {
          type: 'RATE_LIMIT',
          reset: 20,
          isRateLimit: () => kind === 'rate',
          isBot: () => false,
          isShield: () => false,
          isEmail: () => false,
        };
        const provider = {
          withRule: () => provider,
          protect: async (request: { headers: Record<string, unknown> }) => {
            calls++;
            assert.equal(request.headers.cookie, undefined);
            assert.equal(request.headers.authorization, undefined);
            return {
              id: 'synthetic-rate',
              reason,
              results: [],
              isDenied: () => kind === 'rate',
              isErrored: () => false,
            };
          },
        };
        const cfg = config(mode === 'DRY_RUN' ? { NODE_ENV: 'test', ARCJET_MODE: mode } : {});
        const app = await createApp({ config: cfg, arcjet: provider as unknown as ArcjetNest });
        try {
          await app.listen(0, '127.0.0.1');
          const base = await app.getUrl();
          const db = app.get(PrismaService);
          const before = await db.rateBucket.count();
          for (const path of [
            '/api/v1/me',
            '/api/auth/sign-in/email',
            '/api/auth/request-password-reset',
          ]) {
            const auth = path.startsWith('/api/auth/');
            const response = await fetch(base + path, {
              method: auth ? 'POST' : 'GET',
              headers: { Origin: cfg.PUBLIC_APP_URL, 'Content-Type': 'application/json' },
              body: auth
                ? JSON.stringify({
                    email: 'missing@example.com',
                    password: 'Synthetic-password-2026!',
                    redirectTo: '/auth/reset-password',
                  })
                : undefined,
            });
            if (mode === 'LIVE') {
              assert.equal(response.status, 429);
              assert.equal((await response.json()).code, 'RATE_LIMITED');
              assert.ok(Number(response.headers.get('retry-after')) >= 1);
            } else {
              assert.notEqual(response.status, 429);
            }
          }
          assert.equal(calls, 3);
          assert.equal(
            await db.rateBucket.count(),
            before,
            'successful provider decisions do not double count locally',
          );
          kind = 'allow';
          assert.equal((await fetch(`${base}/api/v1/me`)).status, 401);
          const called = calls;
          assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
          assert.equal(calls, called, 'health probe bypass remains supported');
        } finally {
          await app.close();
        }
      },
    );
  }
  for (const failure of ['closed', 'open'] as const) {
    for (const thrown of [false, true]) {
      await check(
        `FPA-02 HTTP provider ${thrown ? 'throw' : 'error'} ${failure} fails safely`,
        async () => {
          const provider = {
            withRule: () => provider,
            protect: async () => {
              if (thrown) throw new Error('Synthetic provider unavailable');
              return {
                id: 'synthetic-error',
                results: [],
                isDenied: () => false,
                isErrored: () => true,
                reason: {
                  type: 'ERROR',
                  isRateLimit: () => false,
                  isBot: () => false,
                  isShield: () => false,
                  isEmail: () => false,
                },
              };
            },
          };
          const app = await createApp({
            config: config({ ARCJET_FAILURE_MODE: failure }),
            arcjet: provider as unknown as ArcjetNest,
          });
          try {
            await app.listen(0, '127.0.0.1');
            const base = await app.getUrl();
            const statuses = [];
            for (let n = 0; n < 3; n++) statuses.push((await fetch(`${base}/api/v1/me`)).status);
            assert.deepEqual(statuses, failure === 'closed' ? [503, 503, 503] : [401, 401, 429]);
          } finally {
            await app.close();
          }
        },
      );
    }
  }
  await check('FPA-02 disabled provider retains atomic local HTTP login limiting', async () => {
    const app = await createApp({ config: config({ NODE_ENV: 'test', ARCJET_ENABLED: 'false' }) });
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const statuses = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const response = await fetch(`${base}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: {
              Origin: 'https://rate-test.invalid',
              'Content-Type': 'application/json',
              'X-Forwarded-For': '203.0.113.9',
            },
            body: JSON.stringify({
              email: 'missing@example.com',
              password: 'Synthetic-password-2026!',
            }),
          });
          return response.status;
        }),
      );
      assert.equal(statuses.filter((status) => status === 429).length, 4);
      assert.equal(statuses.filter((status) => status === 401).length, 2);
    } finally {
      await app.close();
    }
  });
}
