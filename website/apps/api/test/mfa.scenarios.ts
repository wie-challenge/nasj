import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { AppConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';
type Reply = { status: number; body: unknown; headers: Headers };
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
  config: AppConfig;
  client(base?: string): Client;
  register(email: string, name: string): Promise<Fixture>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Reply>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  mail: {
    token(email: string, path: string): Promise<string>;
    messages: { to: string; text: string }[];
  };
};
const body = <T>(r: Reply) => r.body as T;
// Test-only RFC 6238 generator. Runtime cryptography remains exclusively Better Auth.
export function totp(uri: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = new URL(uri).searchParams.get('secret')!;
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=+$/, ''))
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest.at(-1)! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export async function runMfaScenarios({
  db,
  config,
  client,
  register,
  mutate,
  check,
  mail,
}: Harness) {
  const account = await register('mfa-foundation@example.com', 'MFA Operator');
  await db.user.update({ where: { id: account.me.user.id }, data: { role: 'ADMIN' } });
  let guardedApp: INestApplication | undefined;
  try {
    guardedApp = await createApp({ config: { ...config, REQUIRE_PRIVILEGED_MFA: true } });
    await guardedApp.listen(0, '127.0.0.1');
    const operator = client(await guardedApp.getUrl());
    await check(
      'privileged MFA is enforced before approval/admin access and verified enrollment invalidates older sessions',
      async () => {
        assert.equal(
          (
            await operator.request('/api/auth/sign-in/email', 'POST', {
              email: 'mfa-foundation@example.com',
              password: 'Foundation-test-password-2026!',
            })
          ).status,
          200,
        );
        assert.equal((await operator.request('/api/v1/admin/users')).status, 403);
        assert.equal(
          body<{ code: string }>(await operator.request('/api/v1/admin/users')).code,
          'MFA_REQUIRED',
        );
        assert.equal((await operator.request('/api/v1/settings/security')).status, 200);
        const started = await operator.request('/api/auth/two-factor/enable', 'POST', {
          password: 'Foundation-test-password-2026!',
        });
        assert.equal(started.status, 200);
        const setup = body<{ totpURI: string; backupCodes: string[] }>(started);
        assert.ok(setup.totpURI.startsWith('otpauth://'));
        assert.equal(setup.backupCodes.length, 10);
        const raw = await db.twoFactor.findUniqueOrThrow({ where: { userId: account.me.user.id } });
        assert.equal(
          raw.secret.includes(new URL(setup.totpURI).searchParams.get('secret')!),
          false,
        );
        assert.equal(raw.backupCodes.includes(setup.backupCodes[0]), false);
        const verified = await operator.request('/api/auth/two-factor/verify-totp', 'POST', {
          code: totp(setup.totpURI),
        });
        assert.equal(verified.status, 200);
        assert.deepEqual(verified.body, { ok: true });
        assert.equal((await operator.request('/api/v1/admin/users')).status, 200);
        assert.equal((await account.client.request('/api/v1/me')).status, 401);
        assert.equal(
          (
            await operator.request('/api/auth/two-factor/disable', 'POST', {
              password: 'Foundation-test-password-2026!',
            })
          ).status,
          409,
        );
        await operator.request('/api/auth/sign-out', 'POST', {});
        const login = await operator.request('/api/auth/sign-in/email', 'POST', {
          email: 'mfa-foundation@example.com',
          password: 'Foundation-test-password-2026!',
        });
        assert.deepEqual(login.body, { twoFactorRedirect: true });
        assert.equal((await operator.request('/api/v1/me')).status, 401);
        assert.equal(
          (await operator.request('/api/auth/two-factor/verify-totp', 'POST', { code: '000000' }))
            .status,
          400,
        );
        const recovery = await operator.request('/api/auth/two-factor/verify-backup-code', 'POST', {
          code: setup.backupCodes[0],
        });
        assert.equal(recovery.status, 200);
        assert.deepEqual(recovery.body, { ok: true });
        assert.equal((await operator.request('/api/v1/admin/users')).status, 200);
        await operator.request('/api/auth/sign-out', 'POST', {});
        await operator.request('/api/auth/sign-in/email', 'POST', {
          email: 'mfa-foundation@example.com',
          password: 'Foundation-test-password-2026!',
        });
        assert.equal(
          (
            await operator.request('/api/auth/two-factor/verify-backup-code', 'POST', {
              code: setup.backupCodes[0],
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await operator.request('/api/auth/two-factor/verify-backup-code', 'POST', {
              code: setup.backupCodes[1],
            })
          ).status,
          200,
        );
        const me = await operator.request('/api/v1/me');
        const sessionId = body<{ session: { id: string } }>(me).session.id;
        await db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: null } });
        assert.equal((await operator.request('/api/v1/admin/users')).status, 403);
        assert.equal(
          (
            await operator.request('/api/auth/two-factor/verify-totp', 'POST', {
              code: totp(setup.totpURI),
            })
          ).status,
          200,
        );
        const assignee = await register('mfa-support-assignee@example.com', 'Support Assignee');
        const organization = await db.organization.create({
          data: {
            name: 'Synthetic MFA support',
            slug: 'synthetic-mfa-support',
            type: 'INTERNAL',
            approvalStatus: 'APPROVED',
            region: 'Tunis',
            description: 'Synthetic scoped support assignment test.',
            contactEmail: 'synthetic@example.com',
            representativeName: 'MFA Operator',
            createdByUserId: account.me.user.id,
          },
        });
        for (const userId of [account.me.user.id, assignee.me.user.id])
          await db.organizationMember.create({
            data: {
              organizationId: organization.id,
              userId,
              roles: { create: { role: 'SUPPORT', assignedByUserId: account.me.user.id } },
            },
          });
        const supportCase = await mutate(operator, '/api/v1/support/cases', 'POST', {
          subject: 'Scoped assignment without session borrowing',
          description: 'Synthetic support member assignment checks independent membership.',
          organizationId: organization.id,
        });
        assert.equal(supportCase.status, 201);
        assert.equal(
          (
            await mutate(
              operator,
              `/api/v1/support/cases/${body<{ id: string }>(supportCase).id}`,
              'PATCH',
              { status: 'IN_PROGRESS', assignedToUserId: assignee.me.user.id },
            )
          ).status,
          200,
        );
      },
    );
  } finally {
    await guardedApp?.close();
  }
  await check(
    'verified email change keeps old identity until confirmations and blocks ordinary email profile editing',
    async () => {
      const user = await register('email-change-old@example.com', 'Email Change');
      assert.equal(
        (
          await mutate(user.client, '/api/v1/me', 'PATCH', {
            name: 'Email Change',
            email: 'email-change-new@example.com',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await user.client.request('/api/auth/change-email', 'POST', {
            newEmail: 'email-change-new@example.com',
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: user.me.user.id } })).email,
        'email-change-old@example.com',
      );
      const confirmation = await mail.token('email-change-old@example.com', '/auth/verify-email');
      // Signup and old-address confirmation share a path; wait for the newer confirmation message.
      let current = confirmation;
      for (let i = 0; i < 100; i++) {
        const matches = mail.messages.filter(
          (m) =>
            m.to === 'email-change-old@example.com' && m.text.includes('Confirm the email change'),
        );
        const match = matches.at(-1)?.text.match(/#token=([^\s]+)/);
        if (match) {
          current = decodeURIComponent(match[1]);
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(
        (await client().request(`/api/auth/verify-email?token=${encodeURIComponent(current)}`))
          .status,
        200,
      );
      const verification = await mail.token('email-change-new@example.com', '/auth/verify-email');
      assert.equal(
        (await client().request(`/api/auth/verify-email?token=${encodeURIComponent(verification)}`))
          .status,
        200,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: user.me.user.id } })).email,
        'email-change-new@example.com',
      );
      assert.equal(
        (
          await client().request('/api/auth/sign-in/email', 'POST', {
            email: 'email-change-old@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await client().request('/api/auth/sign-in/email', 'POST', {
            email: 'email-change-new@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        200,
      );
    },
  );
  await check(
    'unverified accounts cannot sign in and expired recovery records cannot reset credentials',
    async () => {
      const unverified = client();
      assert.equal(
        (
          await unverified.request('/api/auth/sign-up/email', 'POST', {
            email: 'unverified-edge@example.com',
            name: 'Unverified Edge',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        202,
      );
      assert.equal(
        (
          await unverified.request('/api/auth/sign-in/email', 'POST', {
            email: 'unverified-edge@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        401,
      );
      const existing = await register('expired-recovery@example.com', 'Expired Recovery');
      const before = new Set(
        (await db.verification.findMany({ select: { id: true } })).map((row) => row.id),
      );
      assert.equal(
        (
          await client().request('/api/auth/request-password-reset', 'POST', {
            email: 'expired-recovery@example.com',
          })
        ).status,
        202,
      );
      const token = await mail.token('expired-recovery@example.com', '/auth/reset-password');
      const rows = await db.verification.findMany({ select: { id: true } });
      const created = rows.filter((row) => !before.has(row.id));
      assert.equal(created.length, 1);
      await db.verification.update({
        where: { id: created[0].id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (
          await client().request('/api/auth/reset-password', 'POST', {
            token,
            newPassword: 'Invalid-expired-recovery-2026!',
          })
        ).status,
        400,
      );
      assert.equal((await existing.client.request('/api/v1/me')).status, 200);
    },
  );
}
