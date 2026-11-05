import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';
import { runCommercialScenarios } from './commercial.scenarios.js';

// Reuse the commercial fixture journey that calls all collaboration invariants; never use .env.
logger.level = 'silent';
const database = await disposableDatabase();
const mail = await captureMail();
const config = testConfig(database.url, mail.port, { RATE_API_MAX: 3000 });
const app = await createApp({ config });
let checks = 0;
try {
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  function client() {
    const cookies = new Map<string, string>();
    return {
      async request(
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL, ...extra };
        if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        const response = await fetch(origin + path, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          redirect: 'manual',
        });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          if (pair.slice(at + 1)) cookies.set(pair.slice(0, at), pair.slice(at + 1));
          else cookies.delete(pair.slice(0, at));
        }
        return {
          status: response.status,
          body: response.headers.get('content-type')?.includes('application/json')
            ? await response.json()
            : await response.text(),
        };
      },
    };
  }
  async function register(email: string, name: string) {
    const identity = client();
    const password = 'Synthetic-collaboration-focused-2026!';
    assert.equal(
      (await identity.request('/api/auth/sign-up/email', 'POST', { email, name, password })).status,
      202,
    );
    const token = await mail.token(email, '/auth/verify-email');
    assert.equal(
      (await identity.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status,
      200,
    );
    assert.equal(
      (await identity.request('/api/auth/sign-in/email', 'POST', { email, password })).status,
      200,
    );
    const me = await identity.request('/api/v1/me');
    assert.equal(me.status, 200);
    return { client: identity, me: me.body };
  }
  await runCommercialScenarios({
    db: app.get(PrismaService),
    register,
    check: async (name, run) => {
      await run();
      checks++;
      console.log(`PASS ${name}`);
    },
  });
  console.log(
    `Collaboration focused suite passed: ${checks} scenarios on disposable PostgreSQL and local SMTP.`,
  );
} finally {
  await app.close();
  await mail.stop();
  await database.stop();
}
