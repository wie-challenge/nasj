import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../src/config/env.js';
import { operationalAlerts } from '../src/jobs/alerts.js';
import assert from 'node:assert/strict';
import type { PrismaService } from '../src/database/prisma.service.js';
import { iamTransaction } from '../src/modules/foundation/transaction.js';
import { replaySafe } from '../src/modules/foundation/idempotency.js';
import { audit } from '../src/modules/foundation/audit.js';
import { dispatchBatch, recordReceipt, MAX_ATTEMPTS, outboxStatus } from '../src/jobs/outbox.js';
import type { Actor } from '../src/common/identity.js';
type Result = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<Result>;
};
type Member = { client: Client; me: { user: { id: string } } };
type Harness = {
  config: AppConfig;
  db: PrismaService;
  register(email: string, name: string): Promise<Member>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Result>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
export async function runE16Scenarios({ db, register, mutate, check, config }: Harness) {
  const maker = await register('e16-maker@example.com', 'Synthetic E16 Maker');
  const stranger = await register('e16-stranger@example.com', 'Synthetic E16 Stranger');
  const path = '/api/v1/artisans/me/capacity';
  await mutate(maker.client, '/api/v1/artisans/me', 'PATCH', {
    displayName: 'Synthetic E16 Maker',
    region: 'Tunis',
    processingConsent: true,
    policyVersion: 'artisan-profile-v1',
  });
  await mutate(maker.client, '/api/v1/artisans/me/skills', 'PUT', {
    items: [{ craftSkillId: 'weaving' }],
  });
  const profile = await db.artisanProfile.findUniqueOrThrow({
    where: { userId: maker.me.user.id },
  });
  const me = await maker.client.request('/api/v1/me');
  let csrf = (me.body as { csrfToken: string }).csrfToken;
  const session = await db.session.findFirstOrThrow({ where: { userId: maker.me.user.id } });
  const actor: Actor = {
    id: maker.me.user.id,
    sessionId: session.id,
    role: 'USER',
    sessionCreatedAt: session.createdAt,
    sessionExpiresAt: session.expiresAt,
  };
  const input = {
    craftSkillId: 'weaving',
    unitType: 'HOURS',
    quantity: 4.25,
    effectiveFrom: '2027-06-01T00:00:00Z',
    effectiveTo: '2027-06-08T00:00:00Z',
  };
  const key = 'e16_capacity_replay_0001';
  const post = (body: unknown = input, token = key) =>
    maker.client.request(path, 'POST', body, { 'X-CSRF-Token': csrf, 'Idempotency-Key': token });
  await check(
    'E16 concurrent capacity replay has one persisted revision, audit, outcome and event',
    async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => post()));
      assert.deepEqual(
        results.map((r) => r.status),
        Array(6).fill(201),
      );
      for (const result of results) assert.deepEqual(result.body, results[0].body);
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: profile.id } }),
        1,
      );
      assert.equal(await db.commandOutcome.count({ where: { resourceId: profile.id } }), 1);
      const audits = await db.auditEvent.findMany({
        where: { actorId: actor.id, action: 'artisan.capacity.update' },
      });
      assert.equal(audits.length, 1);
      assert.equal(await db.outboxEvent.count({ where: { auditEventId: audits[0].id } }), 1);
      assert.equal((await post({ ...input, quantity: 5 })).status, 409);
      assert.equal((await post(input, 'bad')).status, 400);
      assert.equal((await post({ ...input, organizationId: 'forged' })).status, 400);
      assert.equal((await post({ ...input, wearableSummary: { strain: 2 } })).status, 400);
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: profile.id } }),
        1,
      );
    },
  );
  await check(
    'E16 replay rechecks privacy consent, resource ownership and session expiry',
    async () => {
      const denied = await mutate(
        stranger.client,
        `/api/v1/artisans/${profile.id}/capacity`,
        'POST',
        input,
      );
      assert.equal(denied.status, 403);
      assert.equal(JSON.stringify(denied.body).includes('4.25'), false);
      await db.consentRecord.updateMany({
        where: { userId: actor.id, purpose: 'artisan.profile' },
        data: { withdrawnAt: new Date() },
      });
      assert.equal((await post()).status, 403);
      await db.consentRecord.updateMany({
        where: { userId: actor.id, purpose: 'artisan.profile' },
        data: { withdrawnAt: null },
      });
      await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
      assert.equal((await post()).status, 401);
      assert.equal(
        (
          await maker.client.request('/api/auth/sign-in/email', 'POST', {
            email: 'e16-maker@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        200,
      );
      const renewed = await maker.client.request('/api/v1/me');
      const identity = renewed.body as { csrfToken: string; session: { id: string } };
      csrf = identity.csrfToken;
      actor.sessionId = identity.session.id;
      assert.equal((await post()).status, 201);
    },
  );
  await check(
    'E16 transaction failure rolls back mutation, command outcome, audit and outbox then retries safely',
    async () => {
      const before = {
        audit: await db.auditEvent.count(),
        event: await db.outboxEvent.count(),
        command: await db.commandOutcome.count(),
      };
      const run = (fail: boolean) =>
        iamTransaction(db, actor, (tx) =>
          replaySafe(
            tx,
            {
              actorId: actor.id,
              resourceId: profile.id,
              operation: 'e16.rollback',
              key: 'e16_rollback_key_0001',
            },
            { version: 1 },
            async () => {
              await tx.artisanProfile.update({
                where: { id: profile.id },
                data: { displayName: 'Changed transactionally' },
              });
              await audit(tx, actor, {
                action: 'e16.rollback',
                targetType: 'ArtisanProfile',
                targetId: profile.id,
              });
              if (fail) throw new Error('Injected transaction failure');
              return { ok: true };
            },
          ),
        );
      await assert.rejects(run(true), /Injected/);
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: profile.id } })).displayName,
        profile.displayName,
      );
      assert.deepEqual(
        {
          audit: await db.auditEvent.count(),
          event: await db.outboxEvent.count(),
          command: await db.commandOutcome.count(),
        },
        before,
      );
      await run(false);
      await run(false);
      assert.equal(await db.auditEvent.count(), before.audit + 1);
      assert.equal(await db.outboxEvent.count(), before.event + 1);
      assert.equal(await db.commandOutcome.count(), before.command + 1);
    },
  );
  await check('E16 operator worker CLI processes and reports the disposable queue', async () => {
    const environment = Object.fromEntries(
      Object.entries(config).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(',') : String(value ?? ''),
      ]),
    );
    const options = {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: { ...process.env, ...environment },
      timeout: 30000,
    };
    await promisify(execFile)('pnpm', ['worker', '--once'], options);
    const result = await promisify(execFile)('pnpm', ['worker', '--status'], options);
    const status = JSON.parse(result.stdout.trim());
    assert.ok(Array.isArray(status.counts));
    assert.equal(typeof status.oldestPendingAgeMs, 'number');
    // Own the unhealthy endpoint: a developer's real API may already be healthy on port 3001.
    const unavailable = createServer((_request, response) => response.writeHead(503).end());
    await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(
        promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/check-operations.ts'], {
          ...options,
          env: {
            ...options.env,
            API_PORT: String((unavailable.address() as { port: number }).port),
            TSX_TSCONFIG_PATH: 'apps/api/tsconfig.json',
            BACKUP_DIRECTORY: '',
          },
        }),
        (failure) => {
          const error = failure as { code: number; stdout: string };
          assert.equal(error.code, 1);
          const alerts = JSON.parse(error.stdout).alerts as string[];
          assert.ok(alerts.includes('API_NOT_READY'));
          assert.ok(
            alerts.every((code) => ['API_NOT_READY', 'OUTBOX_LAG'].includes(code)),
            'The isolated API outage may coexist with real queue lag under load.',
          );
          return true;
        },
      );
    } finally {
      await new Promise<void>((resolve) => unavailable.close(() => resolve()));
    }
  });
  await check(
    'E16 failed local delivery rolls back consumer effects, exhausts bounded retries and recovers',
    async () => {
      await iamTransaction(db, actor, (tx) =>
        audit(tx, actor, {
          action: 'e16.delivery',
          targetType: 'ArtisanProfile',
          targetId: profile.id,
          reason: 'PRIVATE_SENTINEL_TEXT',
          after: { privateText: 'PRIVATE_SENTINEL_TEXT' },
        }),
      );
      const event = await db.outboxEvent.findFirstOrThrow({
        where: { actorId: actor.id, eventType: 'e16.delivery' },
      });
      assert.equal(JSON.stringify(event).includes('PRIVATE_SENTINEL_TEXT'), false);
      const consumer = async (
        tx: Parameters<typeof recordReceipt>[0],
        row: Parameters<typeof recordReceipt>[1],
      ) => {
        await recordReceipt(tx, row);
        if (row.id === event.id) throw new Error('PRIVATE_PROVIDER_ERROR');
      };
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await db.outboxEvent.update({
          where: { id: event.id },
          data: { availableAt: new Date(0) },
        });
        await dispatchBatch(db, 100, consumer);
        assert.equal(await db.eventReceipt.count({ where: { eventId: event.id } }), 0);
        const failed = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
        assert.equal(failed.attempts, attempt);
        assert.equal(failed.status, attempt === MAX_ATTEMPTS ? 'FAILED' : 'RETRY');
        assert.equal(failed.lastErrorCode, 'LOCAL_CONSUMER_FAILED');
        assert.ok(failed.durationMs !== null);
      }
      const diagnostics = await outboxStatus(db);
      assert.ok(diagnostics.failed.some((row) => row.id === event.id));
      assert.ok(
        operationalAlerts({
          ready: true,
          oldestPendingAgeMs: diagnostics.oldestPendingAgeMs,
          failedCount: diagnostics.failed.length,
        }).includes('OUTBOX_FAILED'),
      );
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'RETRY', attempts: 0, availableAt: new Date(0) },
      });
      await Promise.all([dispatchBatch(db, 100), dispatchBatch(db, 100)]);
      assert.equal(
        (await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status,
        'DELIVERED',
      );
      assert.equal(await db.eventReceipt.count({ where: { eventId: event.id } }), 1);
      // Simulate at-least-once redelivery after an acknowledgement loss.
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'RETRY', availableAt: new Date(0) },
      });
      await dispatchBatch(db, 100);
      assert.equal(await db.eventReceipt.count({ where: { eventId: event.id } }), 1);
    },
  );
}
