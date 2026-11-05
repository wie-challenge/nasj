import { runClosureMigrationScenarios } from './closure-migration.scenarios.js';
import { runFinanceClosureScenarios } from './finance-closure.scenarios.js';
import { runSecurityScenarios } from './security.scenarios.js';
import { runOrderFeedbackScenarios } from './order-feedback.scenarios.js';
import { runFeedbackMigrationScenarios } from './feedback-migration.scenarios.js';
import { runDemoFeedbackMigrationScenarios } from './demo-feedback-migration.scenarios.js';
import { runNotificationDeliveryScenarios } from './notification-delivery.scenarios.js';
import { runProductAuthorityScenarios } from './product-authority.scenarios.js';
import { runBatch811MigrationScenarios } from './batch811-migrations.scenarios.js';
import { runMigrationReadinessScenario } from './migration-readiness.scenarios.js';
import { runDemoScenarios } from './demo.scenarios.js';
import { runInventoryScenarios } from './inventory.scenarios.js';
import { runBatch5UpgradeScenario } from './batch5-upgrade.scenarios.js';
import { runCommercialScenarios } from './commercial.scenarios.js';
import { runExecutionScenarios } from './execution.scenarios.js';
import { runDirectoryScenarios } from './directory.scenarios.js';
import { runCapacityUpgradeScenario } from './capacity-upgrade.scenarios.js';
import { runCapacityScenarios } from './capacity.scenarios.js';
import { runProcurementScenarios } from './procurement.scenarios.js';
import { runBatch12Scenarios } from './batch12.scenarios.js';
import { runRoleUpgradeScenario } from './roles-upgrade.scenarios.js';
import { runRoleScenarios } from './roles.scenarios.js';
import { runCommerceScenarios } from './commerce.scenarios.js';
import { runCatalogScenarios } from './catalog.scenarios.js';
import { runRestoreScenario } from './restore.scenarios.js';
import { runE16Scenarios } from './e16.scenarios.js';
import { runUpgradeScenario } from './upgrade.scenarios.js';
import { runLifecycleScenarios } from './lifecycle.scenarios.js';
import { runMfaScenarios } from './mfa.scenarios.js';
import { runGovernanceScenarios } from './governance.scenarios.js';
import { readdir } from 'node:fs/promises';
import { runOrganizationScenarios } from './organizations.scenarios.js';
import { runArtisanScenarios } from './artisans.integration.js';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';
logger.level = 'silent';
const database = await disposableDatabase();
const mail = await captureMail();
// Aggregate suite traffic shares one loopback client. Dedicated rate-limit scenarios use their own low limits.
const config = testConfig(database.url, mail.port, { RATE_API_MAX: 3000 });
let app: INestApplication | undefined,
  limited: INestApplication | undefined,
  proxied: INestApplication | undefined;
let assertions = 0;
const password = 'Foundation-test-password-2026!';
try {
  app = await createApp({ config });
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const db = app.get(PrismaService);
  function client(base = origin) {
    const jar = new Map<string, string>();
    return {
      jar,
      async request(
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL, ...extra };
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        const response = await fetch(base + path, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          redirect: 'manual',
        });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          const name = pair.slice(0, at),
            value = pair.slice(at + 1);
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
        return {
          status: response.status,
          body: response.headers.get('content-type')?.includes('application/json')
            ? await response.json()
            : await response.text(),
          headers: response.headers,
        };
      },
    };
  }
  type TestClient = Pick<ReturnType<typeof client>, 'request'>;
  async function check(name: string, fn: () => Promise<void>) {
    await fn();
    assertions++;
    console.log(`PASS ${name}`);
  }
  async function register(email: string, name: string) {
    const user = client();
    const signup = await user.request('/api/auth/sign-up/email', 'POST', { email, name, password });
    assert.equal(signup.status, 202);
    const token = await mail.token(email, '/auth/verify-email');
    assert.equal(
      (await user.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status,
      200,
    );
    const login = await user.request('/api/auth/sign-in/email', 'POST', { email, password });
    assert.equal(login.status, 200);
    const me = await user.request('/api/v1/me');
    assert.equal(me.status, 200);
    return { client: user, me: me.body };
  }
  async function mutate(user: TestClient, path: string, method: string, body: unknown) {
    const me = await user.request('/api/v1/me');
    assert.equal(me.status, 200);
    return user.request(path, method, body, { 'X-CSRF-Token': me.body.csrfToken });
  }
  await check('startup, migrations, readiness and unauthenticated API denial', async () => {
    const anon = client();
    assert.equal((await anon.request('/api/health/live')).status, 200);
    assert.equal((await anon.request('/api/health/ready')).status, 200);
    assert.equal((await anon.request('/api/v1/me')).status, 401);
    assert.equal((await anon.request('/api/v1/commerce/catalog')).status, 401);
    assert.equal((await anon.request('/API/v1/me')).status, 404);
    assert.equal((await anon.request('/api/v1/me/')).status, 404);
    assert.equal(
      (
        await db.$queryRaw<
          { count: bigint }[]
        >`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      )[0].count,
      BigInt(
        (
          await readdir(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true })
        ).filter((entry) => entry.isDirectory()).length,
      ),
    );
  });
  const alice = await register('alice@example.com', 'Alice Maker');
  const bob = await register('bob@example.com', 'Bob Buyer');
  await check(
    'real signup, SMTP verification, login and safe cookie/session projections',
    async () => {
      assert.equal(alice.me.user.emailVerified, true);
      assert.equal(alice.me.user.role, 'USER');
      const cookie = alice.client.jar.get('nasj.session_token');
      assert.ok(cookie);
      const login = await alice.client.request('/api/auth/sign-in/email', 'POST', {
        email: 'alice@example.com',
        password,
      });
      assert.deepEqual(login.body, { ok: true });
      assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
      assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
      const raw = await db.session.findFirstOrThrow({ where: { userId: alice.me.user.id } });
      const safe = await alice.client.request('/api/auth/get-session');
      assert.equal(safe.status, 200);
      assert.equal(JSON.stringify(safe.body).includes(raw.token), false);
      assert.equal('token' in safe.body.session, false);
      const account = await db.account.findFirstOrThrow({ where: { userId: alice.me.user.id } });
      assert.notEqual(account.password, password);
      assert.ok(account.password);
    },
  );
  await check('generic registration and failed login avoid account enumeration', async () => {
    const duplicate = await client().request('/api/auth/sign-up/email', 'POST', {
      email: 'alice@example.com',
      name: 'Alice Again',
      password,
    });
    assert.equal(duplicate.status, 202);
    assert.deepEqual(duplicate.body, {
      ok: true,
      message: 'If this address can be registered, check your inbox to verify it.',
    });
    const existing = await client().request('/api/auth/sign-in/email', 'POST', {
      email: 'alice@example.com',
      password: 'not-the-right-password',
    });
    const unknown = await client().request('/api/auth/sign-in/email', 'POST', {
      email: 'missing@example.com',
      password: 'not-the-right-password',
    });
    assert.equal(existing.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(existing.body.message, unknown.body.message);
  });
  await check(
    'origin, CSRF, validation and object ownership protect profile and admin routes',
    async () => {
      assert.equal((await alice.client.request(`/api/v1/users/${bob.me.user.id}`)).status, 403);
      assert.equal((await alice.client.request('/api/v1/admin/users')).status, 403);
      assert.equal(
        (await alice.client.request('/api/v1/me', 'PATCH', { name: 'Changed' })).status,
        403,
      );
      assert.equal(
        (
          await alice.client.request(
            '/api/v1/me',
            'PATCH',
            { name: 'Changed' },
            { Origin: 'https://evil.example', 'X-CSRF-Token': alice.me.csrfToken },
          )
        ).status,
        403,
      );
      assert.equal(
        (await mutate(alice.client, '/api/v1/me', 'PATCH', { name: 'Changed', role: 'ADMIN' }))
          .status,
        400,
      );
      assert.equal(
        (
          await client().request('/api/auth/sign-up/email', 'POST', {
            name: 'Evil',
            email: 'evil@example.com',
            password,
            role: 'ADMIN',
          })
        ).status,
        400,
      );
      const updated = await mutate(alice.client, '/api/v1/me', 'PATCH', { name: 'Alice Updated' });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, 'Alice Updated');
      assert.equal(updated.body.role, 'USER');
      assert.equal((await alice.client.request('/api/auth/list-sessions')).status, 404);
    },
  );
  await check('parser and size errors use safe envelopes and request tracing', async () => {
    const invalid = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { Origin: config.PUBLIC_APP_URL, 'Content-Type': 'application/json' },
      body: '{"password":"private-input"',
    });
    assert.equal(invalid.status, 400);
    const error = await invalid.json();
    assert.equal(JSON.stringify(error).includes('private-input'), false);
    assert.equal(error.requestId, invalid.headers.get('x-request-id'));
    const oversized = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { Origin: config.PUBLIC_APP_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(40000) }),
    });
    assert.equal(oversized.status, 413);
  });
  await check('sessions are ownership-bound and revocation/logout invalidate access', async () => {
    const second = client();
    assert.equal(
      (
        await second.request('/api/auth/sign-in/email', 'POST', {
          email: 'alice@example.com',
          password,
        })
      ).status,
      200,
    );
    const me = await second.request('/api/v1/me');
    const sessions = await alice.client.request('/api/v1/me/sessions');
    assert.ok(sessions.body.items.length >= 2);
    assert.equal(JSON.stringify(sessions.body).includes('token'), false);
    assert.equal(
      (await mutate(bob.client, `/api/v1/me/sessions/${me.body.session.id}`, 'DELETE', {})).status,
      404,
    );
    assert.equal(
      (await mutate(alice.client, `/api/v1/me/sessions/${me.body.session.id}`, 'DELETE', {}))
        .status,
      200,
    );
    assert.equal((await second.request('/api/v1/me')).status, 401);
    const logout = await bob.client.request('/api/auth/sign-out', 'POST');
    assert.equal(logout.status, 200);
    assert.equal((await bob.client.request('/api/v1/me')).status, 401);
    assert.equal(
      (
        await bob.client.request('/api/auth/sign-in/email', 'POST', {
          email: 'bob@example.com',
          password,
        })
      ).status,
      200,
    );
  });
  await check(
    'password recovery is generic, single-use and revokes existing sessions',
    async () => {
      const known = await client().request('/api/auth/request-password-reset', 'POST', {
        email: 'alice@example.com',
      });
      const unknown = await client().request('/api/auth/request-password-reset', 'POST', {
        email: 'absent@example.com',
      });
      assert.equal(known.status, 202);
      assert.equal(unknown.status, 202);
      assert.deepEqual(known.body, unknown.body);
      const token = await mail.token('alice@example.com', '/auth/reset-password');
      const newPassword = 'Changed-test-password-2026!';
      assert.equal(JSON.stringify(await db.verification.findMany()).includes(token), false);
      assert.equal(
        (await client().request('/api/auth/reset-password', 'POST', { token, newPassword })).status,
        200,
      );
      assert.equal((await alice.client.request('/api/v1/me')).status, 401);
      assert.equal(
        (await client().request('/api/auth/reset-password', 'POST', { token, newPassword })).status,
        400,
      );
      assert.equal(
        (
          await client().request('/api/auth/sign-in/email', 'POST', {
            email: 'alice@example.com',
            password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await alice.client.request('/api/auth/sign-in/email', 'POST', {
            email: 'alice@example.com',
            password: newPassword,
          })
        ).status,
        200,
      );
    },
  );
  await check('expired sessions and invalid verification links are rejected', async () => {
    const session = await bob.client.request('/api/v1/me');
    await db.session.update({
      where: { id: session.body.session.id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal((await bob.client.request('/api/v1/me')).status, 401);
    assert.equal((await client().request('/api/auth/verify-email?token=forged')).status, 400);
    assert.equal(
      (
        await bob.client.request('/api/auth/sign-in/email', 'POST', {
          email: 'bob@example.com',
          password,
        })
      ).status,
      200,
    );
  });
  await check('admin pagination, role changes and last-administrator race protection', async () => {
    await db.user.update({ where: { id: alice.me.user.id }, data: { role: 'ADMIN' } });
    const listed = await alice.client.request('/api/v1/admin/users?page=1&pageSize=1');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items.length, 1);
    assert.equal(listed.body.total, 2);
    assert.equal('accounts' in listed.body.items[0], false);
    assert.equal(
      (
        await mutate(alice.client, `/api/v1/admin/users/${alice.me.user.id}`, 'PATCH', {
          role: 'USER',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await mutate(alice.client, `/api/v1/admin/users/${bob.me.user.id}`, 'PATCH', {
          role: 'ADMIN',
        })
      ).status,
      200,
    );
    assert.equal((await bob.client.request('/api/v1/me')).status, 401);
    assert.equal(
      (
        await bob.client.request('/api/auth/sign-in/email', 'POST', {
          email: 'bob@example.com',
          password,
        })
      ).status,
      200,
    );
    const a = await alice.client.request('/api/v1/me'),
      b = await bob.client.request('/api/v1/me');
    const results = await Promise.all([
      alice.client.request(
        `/api/v1/admin/users/${alice.me.user.id}`,
        'PATCH',
        { role: 'USER' },
        { 'X-CSRF-Token': a.body.csrfToken },
      ),
      bob.client.request(
        `/api/v1/admin/users/${bob.me.user.id}`,
        'PATCH',
        { role: 'USER' },
        { 'X-CSRF-Token': b.body.csrfToken },
      ),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', emailVerified: true } }),
      1,
    );
  });
  await check(
    'self-deactivation ends sessions and prevents future login without deleting history',
    async () => {
      const carol = await register('carol@example.com', 'Carol Coordinator');
      assert.equal(
        (
          await mutate(carol.client, '/api/v1/me/deactivate', 'POST', {
            confirmation: 'DEACTIVATE',
          })
        ).status,
        200,
      );
      assert.equal((await carol.client.request('/api/v1/me')).status, 401);
      assert.equal(
        (
          await carol.client.request('/api/auth/sign-in/email', 'POST', {
            email: 'carol@example.com',
            password,
          })
        ).status,
        401,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: carol.me.user.id } })).status,
        'DISABLED',
      );
    },
  );
  await check(
    'atomic rate limits resist concurrent requests and spoofed forwarded IP headers',
    async () => {
      limited = await createApp({
        config: testConfig(database.url, mail.port, { RATE_API_MAX: 3, RATE_LOGIN_MAX: 1 }),
      });
      await limited.listen(0, '127.0.0.1');
      const requests = client(await limited.getUrl());
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          requests.request('/api/v1/me', 'GET', undefined, {
            'X-Forwarded-For': `203.0.113.${index + 1}`,
            'X-NASJ-Client-IP': `203.0.113.${index + 1}`,
          }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 401).length, 3);
      assert.equal(results.filter((r) => r.status === 429).length, 3);
      assert.ok(Number(results.find((r) => r.status === 429)!.headers.get('retry-after')) >= 1);
      assert.equal((await requests.request('/api/health/live')).status, 200);
      assert.equal(
        (
          await requests.request('/api/auth/sign-in/email', 'POST', {
            email: 'missing-limit@example.com',
            password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await requests.request('/api/auth/sign-in/email', 'POST', {
            email: 'missing-limit@example.com',
            password,
          })
        ).status,
        429,
      );
    },
  );
  await check(
    'explicit proxy trust resolves independent clients while ignoring private identity header spoofing',
    async () => {
      proxied = await createApp({
        config: testConfig(database.url, mail.port, {
          TRUST_PROXY: '127.0.0.1/32',
          RATE_API_MAX: 1,
        }),
      });
      await proxied.listen(0, '127.0.0.1');
      const requests = client(await proxied.getUrl());
      assert.equal(
        (
          await requests.request('/api/v1/me', 'GET', undefined, {
            'X-Forwarded-For': '203.0.113.80',
            'X-NASJ-Client-IP': '203.0.113.90',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await requests.request('/api/v1/me', 'GET', undefined, {
            'X-Forwarded-For': '203.0.113.80',
            'X-NASJ-Client-IP': '203.0.113.91',
          })
        ).status,
        429,
      );
      assert.equal(
        (
          await requests.request('/api/v1/me', 'GET', undefined, {
            'X-Forwarded-For': '203.0.113.81',
          })
        ).status,
        401,
      );
    },
  );
  await check(
    'operator bootstrap promotes only an existing verified account and revokes its sessions',
    async () => {
      const operator = await register('operator@example.com', 'Operator Account');
      const environment = Object.fromEntries(
        Object.entries(config).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(',') : String(value ?? ''),
        ]),
      );
      const exec = promisify(execFile);
      const options = {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        env: { ...process.env, ...environment },
      };
      await assert.rejects(
        exec('pnpm', ['db:bootstrap-admin', '--', 'absent-operator@example.com'], options),
      );
      const result = await exec(
        'pnpm',
        ['db:bootstrap-admin', '--', 'operator@example.com'],
        options,
      );
      assert.match(result.stdout, /Administrator access granted/);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: operator.me.user.id } })).role,
        'ADMIN',
      );
      assert.equal((await operator.client.request('/api/v1/me')).status, 401);
    },
  );
  if (process.env.BATCH12_FOCUSED !== '1') {
    await runRoleUpgradeScenario(check);
    await runRoleScenarios({ db, register, mutate, check, mail });
    await runOrganizationScenarios({ db, register, mutate, check, mail });
    await runArtisanScenarios({ db, register, mutate, check });
    await runGovernanceScenarios({ db, register, mutate, check, mail });
    await runLifecycleScenarios({ db, client, register, mutate, check, config });
    await runMfaScenarios({ db, config, client, register, mutate, check, mail });
    await runE16Scenarios({ db, register, mutate, check, config });
    await runSecurityScenarios({ databaseUrl: database.url, smtpPort: mail.port, check });
    await runCommerceScenarios({ db, register, check, config });
    await runFinanceClosureScenarios({ db, register, check });
    await runClosureMigrationScenarios(check);
    await runCapacityScenarios({ db, register, check });
    await runDirectoryScenarios({ db, register, check });
    await runCommercialScenarios({ db, register, check });
    await runExecutionScenarios({ db, register, check });
    await runInventoryScenarios({ db, register, check });
    await runCatalogScenarios({ db, register, check });
    await runProcurementScenarios({ db, register, check, config });
    await runProductAuthorityScenarios({ db, register, check });
    await runOrderFeedbackScenarios({ db, register, check });
    await runNotificationDeliveryScenarios({ db, register, check, config, mail });
    await runUpgradeScenario(check);
    await runCapacityUpgradeScenario(check);
    await runBatch5UpgradeScenario(check);
    await runBatch12Scenarios({ db, register, check });
    await runRestoreScenario(database, check);
    await runDemoScenarios(check);
    await runMigrationReadinessScenario(check);
    await runBatch811MigrationScenarios(check);
    await runFeedbackMigrationScenarios(check);
    await runDemoFeedbackMigrationScenarios(check);
  }
  if (process.env.BATCH12_FOCUSED === '1') await runBatch12Scenarios({ db, register, check });
  console.log(
    `Integration passed: ${assertions} scenarios against a newly created disposable PostgreSQL database and local SMTP capture.`,
  );
} finally {
  await proxied?.close();
  await limited?.close();
  await app?.close();
  await mail.stop();
  await database.stop();
}
