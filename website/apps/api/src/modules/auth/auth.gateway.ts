import { assertDemoSession } from '../demo/demo-access.js';
import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema,
  emailRequestSchema,
  emptySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@nasj/contracts';
import type { AppConfig } from '../../config/env.js';
import { fail } from '../../common/errors.js';
import { publicUser } from '../users/user.projection.js';
import type { AuthService } from './auth.service.js';
import { hasPrivilegedAccess } from '../foundation/mfa.js';
import { audit } from '../foundation/audit.js';

const bodies = new Map<string, z.ZodType>([
  ['/sign-up/email', registerSchema],
  ['/sign-in/email', loginSchema],
  ['/sign-out', emptySchema],
  ['/request-password-reset', emailRequestSchema],
  ['/reset-password', resetPasswordSchema],
  ['/send-verification-email', emailRequestSchema],
  ['/change-password', changePasswordSchema],
  [
    '/change-email',
    z.object({ newEmail: z.string().trim().toLowerCase().email().max(254) }).strict(),
  ],
  ['/two-factor/enable', z.object({ password: z.string().min(1).max(128) }).strict()],
  ['/two-factor/disable', z.object({ password: z.string().min(1).max(128) }).strict()],
  ['/two-factor/verify-totp', z.object({ code: z.string().regex(/^\d{6}$/) }).strict()],
  ['/two-factor/verify-backup-code', z.object({ code: z.string().min(5).max(32) }).strict()],
]);
export function authGateway(auth: AuthService, config: AppConfig): RequestHandler {
  return async (req, res, next) => {
    try {
      const path = req.path.slice('/api/auth'.length);
      if (path === '/get-session' && req.method === 'GET') {
        z.object({}).strict().parse(req.query);
        const session = await auth.session(req.headers);
        if (session)
          await assertDemoSession(auth.db, session.user.id, req.headers.cookie, config.DEMO_MODE);
        const user = session
          ? await auth.db.user.findUnique({ where: { id: session.user.id } })
          : null;
        res.json(
          user && user.status === 'ACTIVE' && user.emailVerified
            ? {
                user: publicUser(user),
                session: { expiresAt: session!.session.expiresAt.toISOString() },
              }
            : null,
        );
        return;
      }
      let body: unknown;
      if (req.method === 'POST' && bodies.has(path)) body = bodies.get(path)!.parse(req.body);
      else if (path === '/verify-email' && req.method === 'GET')
        z.object({ token: z.string().min(1).max(2048) })
          .strict()
          .parse(req.query);
      else fail(404, 'NOT_FOUND', 'Authentication endpoint not found.');
      const sensitive = [
        '/change-password',
        '/change-email',
        '/two-factor/enable',
        '/two-factor/disable',
      ].includes(path);
      const beforeSession =
        sensitive || path.startsWith('/two-factor/') ? await auth.session(req.headers) : null;
      const beforeUser = beforeSession
        ? await auth.db.user.findUnique({ where: { id: beforeSession.user.id } })
        : null;
      if (
        sensitive &&
        (!beforeSession || !beforeUser?.emailVerified || beforeUser.status !== 'ACTIVE')
      )
        fail(403, 'ACCOUNT_UNAVAILABLE', 'Sign in with an active verified account.');
      if (sensitive && Date.now() - beforeSession!.session.createdAt.getTime() > 900000)
        fail(403, 'REAUTHENTICATION_REQUIRED', 'Sign in again before changing account security.');
      if (
        path === '/two-factor/disable' &&
        config.REQUIRE_PRIVILEGED_MFA &&
        (await hasPrivilegedAccess(auth.db, beforeUser!.id))
      )
        fail(
          409,
          'MFA_REQUIRED',
          'Remove privileged responsibilities before disabling multi-factor authentication.',
        );
      const url = new URL(req.originalUrl, config.PUBLIC_APP_URL);
      const response = await auth.auth.handler(
        new Request(url, {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      if (path === '/sign-in/email' && response.ok) {
        const issued = await auth.session({
          cookie: response.headers
            .getSetCookie()
            .map((value) => value.split(';')[0])
            .join('; '),
        });
        if (issued) {
          try {
            await assertDemoSession(auth.db, issued.user.id, req.headers.cookie, config.DEMO_MODE);
          } catch (error) {
            await auth.db.session.deleteMany({ where: { id: issued.session.id } });
            throw error;
          }
        }
      }
      for (const cookie of response.headers.getSetCookie()) res.append('Set-Cookie', cookie);
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        twoFactorRedirect?: boolean;
        totpURI?: string;
        backupCodes?: string[];
      };
      if (path === '/sign-in/email' && !response.ok)
        fail(
          401,
          'SIGN_IN_FAILED',
          'Sign-in unsuccessful. Check your credentials and verification email.',
        );
      if (
        path === '/sign-up/email' &&
        (response.ok || data.code?.includes('USER_ALREADY_EXISTS'))
      ) {
        res.status(202).json({
          ok: true,
          message: 'If this address can be registered, check your inbox to verify it.',
        });
        return;
      }
      if (
        ['/request-password-reset', '/send-verification-email'].includes(path) &&
        (response.ok || response.status < 500)
      ) {
        res.status(202).json({ ok: true, message: 'If an account matches, check your inbox.' });
        return;
      }
      if (!response.ok)
        fail(
          response.status >= 500 ? 503 : 400,
          'AUTH_REQUEST_FAILED',
          'Unable to complete this authentication request. Try again or request a new link.',
        );
      if (path === '/sign-in/email' && data.twoFactorRedirect) {
        res.status(200).json({ twoFactorRedirect: true });
        return;
      }
      if (
        path.startsWith('/two-factor/') ||
        path === '/change-email' ||
        path === '/change-password'
      ) {
        // Re-read the provider's resulting session, including any rotated HttpOnly cookie.
        const jar = new Map<string, string>();
        for (const pair of (req.headers.cookie ?? '').split(';')) {
          const at = pair.indexOf('=');
          if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1));
        }
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
        const resulting = await auth.session({
          ...req.headers,
          cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
        });
        if (resulting) {
          const user = await auth.db.user.findUniqueOrThrow({ where: { id: resulting.user.id } });
          if (user.status !== 'ACTIVE' || !user.emailVerified) {
            await auth.db.session.deleteMany({ where: { userId: user.id } });
            fail(403, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
          }
          await auth.db.$transaction(async (tx) => {
            if (['/two-factor/verify-totp', '/two-factor/verify-backup-code'].includes(path)) {
              await tx.session.update({
                where: { id: resulting.session.id },
                data: { mfaVerifiedAt: new Date() },
              });
              if (beforeUser && !beforeUser.twoFactorEnabled && user.twoFactorEnabled)
                await tx.session.deleteMany({
                  where: { userId: user.id, id: { not: resulting.session.id } },
                });
            }
            if (path === '/two-factor/disable')
              await tx.session.updateMany({
                where: { userId: user.id },
                data: { mfaVerifiedAt: null },
              });
            await audit(
              tx,
              {
                id: user.id,
                role: user.role,
                sessionId: resulting.session.id,
                sessionCreatedAt: resulting.session.createdAt,
                sessionExpiresAt: resulting.session.expiresAt,
                requestId: (req as { requestId?: string }).requestId,
              },
              {
                action: (
                  {
                    '/change-password': 'PASSWORD_CHANGED',
                    '/change-email': 'EMAIL_CHANGE_REQUESTED',
                    '/two-factor/verify-totp': 'MFA_VERIFIED',
                    '/two-factor/verify-backup-code': 'MFA_VERIFIED',
                    '/two-factor/disable': 'MFA_DISABLED',
                    '/two-factor/enable': 'MFA_ENROLLMENT_STARTED',
                  } as Record<string, string>
                )[path],
                targetType: 'User',
                targetId: user.id,
              },
            );
          });
        }
        if (path === '/two-factor/enable') {
          res.status(200).json({ totpURI: data.totpURI, backupCodes: data.backupCodes });
          return;
        }
      }
      // Provider session tokens and credential metadata never enter browser JSON.
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  };
}
