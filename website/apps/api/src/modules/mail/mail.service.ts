import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { logger } from '../../common/logging.js';
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function actionEmail(content: {
  title: string;
  intro: string;
  label: string;
  url: string;
  note?: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#f5f0e6;font-family:Arial,Helvetica,sans-serif;color:#292d29">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#244c3a;padding:22px 32px;color:#f5f0e6;font-size:22px;font-weight:700;letter-spacing:1px">NASJ <span style="font-weight:400">| نسج</span></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 14px;font-size:22px;color:#244c3a">${escapeHtml(content.title)}</h1>
<p style="margin:0 0 26px;font-size:16px;line-height:1.5">${escapeHtml(content.intro)}</p>
<a href="${escapeHtml(content.url)}" style="display:inline-block;background:#244c3a;color:#f5f0e6;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px">${escapeHtml(content.label)}</a>
${content.note ? `<p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:#6b6f6a">${escapeHtml(content.note)}</p>` : ''}</td></tr>
<tr><td style="padding:18px 32px;background:#faf7f0;font-size:12px;color:#6b6f6a">Weaving Connections. Creating Impact.</td></tr>
</table></td></tr></table></body></html>`;
}
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transport;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      requireTLS: config.SMTP_REQUIRE_TLS,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  private readonly pending = new Set<Promise<unknown>>();
  sendAction(
    to: string,
    subject: string,
    content: { title: string; intro: string; label: string; url: string; note?: string },
  ) {
    this.send(
      to,
      subject,
      [content.title, '', content.intro, '', `${content.label}: ${content.url}`, content.note ?? '']
        .join('\n')
        .trim(),
      actionEmail(content),
    );
  }
  send(to: string, subject: string, text: string, html?: string) {
    const delivery = this.transport
      .sendMail({ from: this.config.EMAIL_FROM, to, subject, text, html })
      .catch(() => {
        logger.error(
          { category: 'AUTH_MAIL_DELIVERY' },
          'Authentication email delivery failed; check SMTP configuration.',
        );
      })
      .finally(() => {
        this.pending.delete(delivery);
      });
    this.pending.add(delivery);
  }
  async sendConfirmed(to: string, subject: string, text: string) {
    try {
      const result = await this.transport.sendMail({
        from: this.config.EMAIL_FROM,
        to,
        subject,
        text,
      });
      return result.accepted.some((address) => String(address).toLowerCase() === to.toLowerCase());
    } catch {
      logger.error({ category: 'NOTIFICATION_SMTP_FAILURE' }, 'Notification submission failed.');
      return false;
    }
  }
  async onModuleDestroy() {
    await Promise.allSettled(this.pending);
    this.transport.close();
  }
}
