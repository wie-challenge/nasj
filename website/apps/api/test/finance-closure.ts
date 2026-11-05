import { runOrderFeedbackScenarios } from './order-feedback.scenarios.js';
import { runClosureMigrationScenarios } from './closure-migration.scenarios.js';
import { runExecutionScenarios } from './execution.scenarios.js';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';
import { runFinanceClosureScenarios } from './finance-closure.scenarios.js';
logger.level = 'silent';
const database = await disposableDatabase();
const mail = await captureMail();
const config = testConfig(database.url, mail.port);
const app = await createApp({ config });
try {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function register(email: string, name: string) {
    const jar = new Map<string, string>();
    const client = {
      request: async (
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) => {
        const response = await fetch(base + path, {
          method,
          headers: {
            Origin: config.PUBLIC_APP_URL,
            'Content-Type': 'application/json',
            Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
            ...extra,
          },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          redirect: 'manual',
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(';');
          const at = pair.indexOf('=');
          if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
          else jar.delete(pair.slice(0, at));
        }
        return { status: response.status, body: await response.json() };
      },
    };
    const password = 'Synthetic-closure-test-2026!';
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
  }
  let total = 0;
  if (process.argv.includes('--feedback-only')) {
    await runOrderFeedbackScenarios({
      db: app.get(PrismaService),
      register,
      check: async (name, fn) => {
        await fn();
        total++;
        console.log(`PASS ${name}`);
      },
    });
  } else {
    await runFinanceClosureScenarios({
      db: app.get(PrismaService),
      register,
      check: async (name, fn) => {
        await fn();
        total++;
        console.log(`PASS ${name}`);
      },
    });
    if (process.argv.includes('--with-execution'))
      await runExecutionScenarios({
        db: app.get(PrismaService),
        register,
        check: async (name, fn) => {
          await fn();
          total++;
          console.log(`PASS ${name}`);
        },
      });
    await runClosureMigrationScenarios(async (name, fn) => {
      await fn();
      total++;
      console.log(`PASS ${name}`);
    });
  }
  console.log(`Focused scenarios passed: ${total}`);
} finally {
  await app.close();
  await mail.stop();
  await database.stop();
}
