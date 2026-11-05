import nodemailer from 'nodemailer';
import type { PrismaService } from '../database/prisma.service.js';
import type { AppConfig } from '../config/env.js';
export type NotificationEnvelope = { id: string; email: string; subject: string; body: string };
export type NotificationTransport = {
  verify(): Promise<void>;
  send(envelope: NotificationEnvelope): Promise<'SENT' | 'UNCERTAIN'>;
  close(): void;
};
function smtp(config: AppConfig): NotificationTransport {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: config.SMTP_REQUIRE_TLS,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5000,
    socketTimeout: 10000,
  });
  return {
    async verify() {
      await transport.verify();
    },
    async send(message) {
      try {
        const sent = await transport.sendMail({
          from: config.EMAIL_FROM,
          to: message.email,
          subject: message.subject,
          text: message.body,
          messageId: `<nasj-notification-${message.id}@notifications.nasj.invalid>`,
        });
        return sent.accepted.some(
          (address) => String(address).toLowerCase() === message.email.toLowerCase(),
        )
          ? 'SENT'
          : 'UNCERTAIN';
      } catch {
        return 'UNCERTAIN';
      }
    },
    close() {
      transport.close();
    },
  };
}
/** A durable queue distinct from auth email. External I/O never occurs inside a business transaction.
 * SENDING/UNCERTAIN are deliberately not reclaimed automatically: SMTP has no exactly-once
 * acknowledgement. A crash or lost acknowledgement requires provider review, never blind retry.
 * SENT means SMTP accepted the message; it does not assert delivery to a person's inbox.
 */
export async function dispatchNotifications(
  db: PrismaService,
  config: AppConfig,
  supplied?: NotificationTransport,
  limit = 25,
) {
  if (!config.NOTIFICATION_EMAIL_ENABLED) return 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError('Notification limit must be 1..100.');
  const transport = supplied ?? smtp(config);
  let processed = 0;
  try {
    const queued = await db.notificationDelivery.findMany({
      where: { channel: 'EMAIL', status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    for (const item of queued) {
      const claimed = await db.notificationDelivery.updateMany({
        where: { id: item.id, status: 'PENDING' },
        data: { status: 'SENDING', provider: 'SMTP', deliveredAt: null },
      });
      if (!claimed.count) continue;
      processed++;
      const row = await db.notificationDelivery.findUniqueOrThrow({
        where: { id: item.id },
        include: { user: true },
      });
      const allowed = async () =>
        row.user.status === 'ACTIVE' &&
        row.user.emailVerified &&
        Boolean(
          await db.notificationPreference.findFirst({
            where: { userId: row.userId, channel: 'EMAIL', category: row.category, optedIn: true },
          }),
        );
      if (!(await allowed())) {
        await db.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: 'SKIPPED_NO_OPT_IN',
            failureReason: 'Current account or channel consent does not permit submission.',
          },
        });
        continue;
      }
      try {
        await transport.verify();
      } catch {
        // Verification sends no message. This failure is therefore safe to retry explicitly.
        await db.notificationDelivery.update({
          where: { id: row.id },
          data: { status: 'FAILED', failureReason: 'SMTP_PREFLIGHT_FAILED_NO_MESSAGE_SUBMITTED' },
        });
        continue;
      }
      if (!(await allowed())) {
        await db.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: 'SKIPPED_NO_OPT_IN',
            failureReason: 'Preference changed before submission.',
          },
        });
        continue;
      }
      let result: 'SENT' | 'UNCERTAIN';
      try {
        result = await transport.send({
          id: row.id,
          email: row.user.email,
          subject: row.subject,
          body: row.body,
        });
      } catch {
        result = 'UNCERTAIN';
      }
      await db.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: result,
          deliveredAt: null,
          failureReason:
            result === 'UNCERTAIN' ? 'SMTP_ACKNOWLEDGEMENT_UNCERTAIN_REQUIRES_REVIEW' : '',
        },
      });
    }
  } finally {
    transport.close();
  }
  return processed;
}
