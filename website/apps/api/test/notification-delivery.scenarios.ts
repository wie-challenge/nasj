import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { AppConfig } from '../src/config/env.js';
import { dispatchNotifications, type NotificationTransport } from '../src/jobs/notifications.js';
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }>;
};
type Identity = { client: Client; me: { user: { id: string } } };
export async function runNotificationDeliveryScenarios({
  db,
  register,
  check,
  config,
  mail,
}: {
  db: PrismaService;
  register(email: string, name: string): Promise<Identity>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  config: AppConfig;
  mail: { messages: { to: string; text: string }[] };
}) {
  const user = await register(
    'notification-transport@example.com',
    'Synthetic notification recipient',
  );
  const savedFlag = config.NOTIFICATION_EMAIL_ENABLED;
  const path = '/api/v1/collaboration';
  async function post(route: string, body: unknown, key: string = randomUUID()) {
    const me = await user.client.request('/api/v1/me');
    assert.equal(me.status, 200);
    return user.client.request(path + route, 'POST', body, {
      'X-CSRF-Token': (me.body as { csrfToken: string }).csrfToken,
      'Idempotency-Key': key,
    });
  }
  async function preference(channel: 'EMAIL' | 'IN_APP', optedIn: boolean) {
    const response = await post('/notifications/preferences', {
      category: 'SUPPORT_CASE_UPDATE',
      channel,
      optedIn,
      language: 'fr',
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }
  async function queue() {
    const created = await post('/tickets', {
      category: 'SUPPORT_REQUEST',
      relatedType: 'NONE',
      description: 'Sensitive synthetic support facts stay behind authentication.',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const result = await post(`/tickets/${(created.body as { id: string }).id}`, {
      status: 'WITHDRAWN',
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return db.notificationDelivery.findFirstOrThrow({
      where: { userId: user.me.user.id, category: 'SUPPORT_CASE_UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
  }
  try {
    // This is the in-memory config of this disposable test app only, never a persistent setting.
    config.NOTIFICATION_EMAIL_ENABLED = true;
    await preference('EMAIL', true);
    let queuedId = '';
    await check(
      'notification queue records localized pending delivery and a transient preflight failure sends nothing',
      async () => {
        const row = await queue();
        queuedId = row.id;
        assert.equal(row.status, 'PENDING');
        assert.equal(row.deliveredAt, null);
        assert.equal(row.locale, 'fr');
        assert.equal(row.body.includes('Sensitive synthetic'), false);
        let sent = 0;
        const transport: NotificationTransport = {
          verify: async () => {
            throw Error('synthetic temporary connection failure');
          },
          send: async () => {
            sent++;
            return 'SENT';
          },
          close() {},
        };
        await dispatchNotifications(db, config, transport);
        const failed = await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } });
        assert.equal(failed.status, 'FAILED');
        assert.equal(sent, 0);
        assert.equal(failed.deliveredAt, null);
        assert.equal(failed.failureReason, 'SMTP_PREFLIGHT_FAILED_NO_MESSAGE_SUBMITTED');
      },
    );
    await check(
      'notification retry is idempotent and concurrent workers submit exactly one localized message to local SMTP',
      async () => {
        const key = randomUUID();
        const retries = await Promise.all([
          post(`/notifications/${queuedId}/retry`, {}, key),
          post(`/notifications/${queuedId}/retry`, {}, key),
        ]);
        assert.deepEqual(
          retries.map((r) => r.status),
          [201, 201],
        );
        assert.equal(
          (await db.notificationDelivery.findUniqueOrThrow({ where: { id: queuedId } })).status,
          'PENDING',
        );
        const before = mail.messages.filter(
          (message) => message.to === 'notification-transport@example.com',
        ).length;
        await Promise.all([dispatchNotifications(db, config), dispatchNotifications(db, config)]);
        assert.equal(
          mail.messages.filter((message) => message.to === 'notification-transport@example.com')
            .length,
          before + 1,
        );
        const sent = await db.notificationDelivery.findUniqueOrThrow({ where: { id: queuedId } });
        assert.equal(sent.status, 'SENT');
        assert.equal(sent.deliveredAt, null, 'SMTP acceptance is not inbox delivery.');
        assert.equal(sent.attempts, 2);
        assert.equal((await post(`/notifications/${queuedId}/retry`, {})).status, 201);
        assert.equal(await dispatchNotifications(db, config), 0);
        assert.equal(
          mail.messages.filter((message) => message.to === 'notification-transport@example.com')
            .length,
          before + 1,
        );
      },
    );
    await check(
      'notification worker rechecks opt-out and ambiguous acknowledgements never trigger blind duplicate retries',
      async () => {
        const optedOut = await queue();
        await preference('EMAIL', false);
        let calls = 0;
        const adapter: NotificationTransport = {
          verify: async () => {},
          send: async () => {
            calls++;
            return 'UNCERTAIN';
          },
          close() {},
        };
        await dispatchNotifications(db, config, adapter);
        assert.equal(calls, 0);
        assert.equal(
          (await db.notificationDelivery.findUniqueOrThrow({ where: { id: optedOut.id } })).status,
          'SKIPPED_NO_OPT_IN',
        );
        await preference('EMAIL', true);
        const uncertain = await queue();
        await dispatchNotifications(db, config, adapter);
        assert.equal(calls, 1);
        assert.equal(
          (await db.notificationDelivery.findUniqueOrThrow({ where: { id: uncertain.id } })).status,
          'UNCERTAIN',
        );
        assert.equal((await post(`/notifications/${uncertain.id}/retry`, {})).status, 409);
        await dispatchNotifications(db, config, adapter);
        assert.equal(calls, 1);
        const interrupted = await queue();
        await db.notificationDelivery.update({
          where: { id: interrupted.id },
          data: { status: 'SENDING' },
        });
        assert.equal((await post(`/notifications/${interrupted.id}/retry`, {})).status, 409);
        await dispatchNotifications(db, config, adapter);
        assert.equal(calls, 1);
      },
    );
    await check(
      'critical communication uses an explicitly opted-in in-app fallback without external duplicate submission',
      async () => {
        await preference('IN_APP', true);
        const fallback = await queue();
        assert.equal(fallback.channel, 'IN_APP');
        assert.equal(fallback.status, 'DELIVERED');
        assert.ok(fallback.deliveredAt);
        assert.equal(await dispatchNotifications(db, config), 0);
        const workspace = await user.client.request(path);
        assert.equal(workspace.status, 200);
        assert.ok(JSON.stringify(workspace.body).includes(fallback.id));
      },
    );
  } finally {
    config.NOTIFICATION_EMAIL_ENABLED = savedFlag;
  }
}
