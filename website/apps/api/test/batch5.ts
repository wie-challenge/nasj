import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';
import { runExecutionScenarios } from './execution.scenarios.js';
import { runInventoryScenarios } from './inventory.scenarios.js';
import { runBatch5UpgradeScenario } from './batch5-upgrade.scenarios.js';
logger.level = 'error';
const database = await disposableDatabase();
const mail = await captureMail();
const config = testConfig(database.url, mail.port, { RATE_API_MAX: 3000 });
const app = await createApp({ config });
try {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const db = app.get(PrismaService);
  const register = async (email: string, name: string) => {
    const jar = new Map<string, string>();
    const client = {
      async request(
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL, ...extra };
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        const res = await fetch(base + path, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        });
        for (const cookie of res.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
          else jar.delete(pair.slice(0, at));
        }
        return {
          status: res.status,
          body: res.headers.get('content-type')?.includes('application/json')
            ? await res.json()
            : await res.text(),
        };
      },
    };
    const password = 'Synthetic-batch5-test-password!';
    assert.equal(
      (await client.request('/api/auth/sign-up/email', 'POST', { email, name, password })).status,
      202,
    );
    const token = await mail.token(email, '/auth/verify-email');
    assert.equal(
      (await client.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status,
      200,
    );
    assert.equal(
      (await client.request('/api/auth/sign-in/email', 'POST', { email, password })).status,
      200,
    );
    return { client, me: (await client.request('/api/v1/me')).body };
  };
  const check = async (name: string, fn: () => Promise<void>) => {
    await fn();
    console.log(`PASS ${name}`);
  };
  await runExecutionScenarios({ db, register, check });
  await runInventoryScenarios({ db, register, check });
  await runBatch5UpgradeScenario(check);
} finally {
  await app.close();
  await mail.stop();
  await database.stop();
}
