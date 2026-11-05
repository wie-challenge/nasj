import assert from 'node:assert/strict';
import type { PrismaService } from '../src/database/prisma.service.js';
type Reply = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<Reply>;
};
type Fixture = { client: Client; me: { user: { id: string } } };
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Fixture>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Reply>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  mail: { messages: { to: string; text: string }[] };
};
const data = <T>(r: Reply) => r.body as T;
export async function runGovernanceScenarios({ db, register, mutate, check, mail }: Harness) {
  const alice = await register('privacy-alice@example.com', 'Privacy Alice');
  const bob = await register('privacy-bob@example.com', 'Privacy Bob');
  const reviewer = await register('privacy-reviewer@example.com', 'Privacy Reviewer');
  await db.user.update({ where: { id: reviewer.me.user.id }, data: { role: 'ADMIN' } });
  await check(
    'personal preferences and privacy requests are owner-bound and reviewed with retention reasons',
    async () => {
      assert.equal(
        (
          await mutate(alice.client, '/api/v1/settings/preferences', 'PATCH', {
            preferredLanguage: 'ar',
            role: 'ADMIN',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate(alice.client, '/api/v1/settings/preferences', 'PATCH', {
            preferredLanguage: 'ar',
          })
        ).status,
        200,
      );
      assert.equal(
        data<{ preferredLanguage: string }>(
          await alice.client.request('/api/v1/settings/preferences'),
        ).preferredLanguage,
        'ar',
      );
      const created = await mutate(alice.client, '/api/v1/privacy/requests', 'POST', {
        type: 'DELETION',
        details: 'Please review retention and delete optional data.',
      });
      assert.equal(created.status, 201);
      const id = data<{ id: string }>(created).id;
      assert.equal(
        data<{ total: number }>(await bob.client.request('/api/v1/privacy/requests/me')).total,
        0,
      );
      assert.equal((await bob.client.request('/api/v1/admin/privacy-requests')).status, 403);
      assert.equal(
        (
          await mutate(bob.client, `/api/v1/admin/privacy-requests/${id}`, 'PATCH', {
            status: 'RESOLVED',
            resolutionNotes: 'Unauthorized review',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/admin/privacy-requests/${id}`, 'PATCH', {
            status: 'RESOLVED',
            resolutionNotes: 'Reviewed request',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/admin/privacy-requests/${id}`, 'PATCH', {
            status: 'IN_REVIEW',
            resolutionNotes: 'Retention inventory review started.',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/admin/privacy-requests/${id}`, 'PATCH', {
            status: 'RESOLVED',
            resolutionNotes: 'Synthetic fixture review complete; no real deletion requested.',
            retentionExceptions:
              'Test fixture retains audit and identity records; no automatic erasure is claimed.',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/admin/privacy-requests/${id}`, 'PATCH', {
            status: 'IN_REVIEW',
            resolutionNotes: 'Cannot reopen closed review.',
          })
        ).status,
        409,
      );
    },
  );
  await check(
    'self data export excludes credentials and other users, with immutable redacted audits',
    async () => {
      const exported = await alice.client.request('/api/v1/privacy/export');
      assert.equal(exported.status, 200);
      const text = JSON.stringify(exported.body);
      assert.ok(text.includes('privacy-alice@example.com'));
      assert.equal(text.includes('privacy-bob@example.com'), false);
      assert.equal(text.includes('tokenHash'), false);
      assert.equal(text.includes('backupCodes'), false);
      assert.equal(text.includes('password'), false);
      assert.equal(text.includes('session_token'), false);
      assert.equal(
        (await bob.client.request(`/api/v1/privacy/export?userId=${alice.me.user.id}`)).status,
        400,
      );
      const audit = await reviewer.client.request('/api/v1/admin/audit-events');
      assert.equal(audit.status, 200);
      const events = await db.auditEvent.findMany({ where: { actorId: alice.me.user.id } });
      assert.ok(events.some((e) => e.action === 'PERSONAL_DATA_EXPORTED'));
      assert.ok(events.every((e) => e.correlationId.length > 10));
      assert.equal(JSON.stringify(events).includes('Please review retention'), false);
      await assert.rejects(
        db.auditEvent.update({ where: { id: events[0].id }, data: { reason: 'tamper' } }),
      );
      await assert.rejects(db.auditEvent.delete({ where: { id: events[0].id } }));
    },
  );
  await check(
    'consent withdrawal is ownership-bound and records purpose/version without deleting history',
    async () => {
      const consent = await mutate(alice.client, '/api/v1/consents', 'POST', {
        purpose: 'MARKETING',
        policyVersion: '2026-10',
        decision: true,
      });
      assert.equal(consent.status, 201);
      const id = data<{ id: string }>(consent).id;
      assert.equal((await mutate(bob.client, `/api/v1/consents/${id}`, 'DELETE', {})).status, 404);
      assert.equal(
        (await mutate(alice.client, `/api/v1/consents/${id}`, 'DELETE', {})).status,
        200,
      );
      const stored = await db.consentRecord.findUniqueOrThrow({ where: { id } });
      assert.equal(stored.decision, true);
      assert.ok(stored.withdrawnAt);
    },
  );
  await check(
    'support cases enforce resource ownership, assignment and opt-in SMTP submission',
    async () => {
      const created = await mutate(alice.client, '/api/v1/support/cases', 'POST', {
        subject: 'Synthetic support request',
        description: 'Please help me with a synthetic account setting.',
      });
      assert.equal(created.status, 201);
      const id = data<{ id: string }>(created).id;
      assert.equal(
        data<{ items: unknown[] }>(await bob.client.request('/api/v1/support/cases')).items.length,
        0,
      );
      assert.equal(
        (
          await mutate(bob.client, `/api/v1/support/cases/${id}`, 'PATCH', {
            status: 'RESOLVED',
            resolution: 'Unauthorized response.',
          })
        ).status,
        403,
      );
      assert.equal(
        (await mutate(reviewer.client, `/api/v1/support/cases/${id}/notify`, 'POST', {})).status,
        409,
      );
      assert.equal(
        (
          await mutate(alice.client, '/api/v1/notifications/preferences', 'PUT', {
            items: [
              { category: 'SUPPORT_UPDATES', language: 'fr', channel: 'EMAIL', optedIn: true },
            ],
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/support/cases/${id}`, 'PATCH', {
            status: 'IN_PROGRESS',
            assignedToUserId: bob.me.user.id,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/support/cases/${id}`, 'PATCH', {
            status: 'IN_PROGRESS',
            assignedToUserId: reviewer.me.user.id,
            dueAt: new Date(Date.now() + 86400000).toISOString(),
          })
        ).status,
        200,
      );
      const sent = await mutate(reviewer.client, `/api/v1/support/cases/${id}/notify`, 'POST', {});
      assert.equal(sent.status, 201);
      assert.deepEqual(sent.body, { status: 'ACCEPTED_BY_SMTP', delivered: false });
      assert.ok(
        mail.messages.some(
          (m) => m.to === 'privacy-alice@example.com' && m.text.includes('Votre demande'),
        ),
      );
      assert.equal(
        (
          await mutate(alice.client, '/api/v1/notifications/preferences', 'PUT', {
            items: [
              { category: 'SUPPORT_UPDATES', language: 'fr', channel: 'EMAIL', optedIn: false },
            ],
          })
        ).status,
        200,
      );
      assert.equal(
        (await mutate(reviewer.client, `/api/v1/support/cases/${id}/notify`, 'POST', {})).status,
        409,
      );
      assert.equal(
        (
          await mutate(reviewer.client, `/api/v1/support/cases/${id}`, 'PATCH', {
            status: 'RESOLVED',
            resolution: 'Resolved synthetic request.',
          })
        ).status,
        200,
      );
    },
  );
}
