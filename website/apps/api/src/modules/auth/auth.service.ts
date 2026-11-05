import { Inject, Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { logger } from '../../common/logging.js';
@Injectable()
export class AuthService {
  readonly auth;
  constructor(
    @Inject(PrismaService) readonly db: PrismaService,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(MailService) mail: MailService,
  ) {
    this.auth = betterAuth({
      appName: 'NASJ',
      baseURL: config.PUBLIC_APP_URL,
      basePath: '/api/auth',
      secret: config.BETTER_AUTH_SECRET,
      database: prismaAdapter(db, { provider: 'postgresql' }),
      trustedOrigins: [config.PUBLIC_APP_URL],
      telemetry: { enabled: false },
      plugins: [
        twoFactor({
          issuer: 'NASJ',
          skipVerificationOnEnable: false,
          accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
        }),
      ],
      logger: {
        level: 'warn',
        log: (level) => {
          if (level === 'error') logger.error('Authentication operation failed');
          else if (level === 'warn') logger.warn('Authentication request rejected');
        },
      },
      advanced: {
        cookiePrefix: config.DEMO_MODE ? 'nasj_demo' : 'nasj',
        useSecureCookies: config.PUBLIC_APP_URL.startsWith('https://'),
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.PUBLIC_APP_URL.startsWith('https://'),
        },
        ipAddress: { ipAddressHeaders: ['x-nasj-client-ip'] },
      },
      session: {
        cookieCache: { enabled: false },
        expiresIn: 7 * 86400,
        disableSessionRefresh: true,
        freshAge: 900,
      },
      user: {
        additionalFields: {
          role: { type: 'string', defaultValue: 'USER', input: false },
          status: { type: 'string', defaultValue: 'ACTIVE', input: false },
        },
        changeEmail: {
          enabled: true,
          updateEmailWithoutVerification: false,
          sendChangeEmailConfirmation: async ({ user, token }) => {
            mail.sendAction(user.email, 'Confirm your NASJ email change', {
              title: 'Confirm your new email',
              intro: 'Please confirm this change. We will then ask you to verify the new address.',
              label: 'Confirm the change',
              url: `${config.PUBLIC_APP_URL}/auth/verify-email#token=${encodeURIComponent(token)}`,
              note: 'If you did not ask for this, you can ignore this email.',
            });
          },
        },
        deleteUser: { enabled: false },
      },
      verification: { storeIdentifier: 'hashed' },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        revokeSessionsOnPasswordReset: true,
        onPasswordReset: async ({ user }) => {
          await db.auditEvent.create({
            data: {
              actorId: user.id,
              action: 'PASSWORD_RESET',
              targetType: 'User',
              targetId: user.id,
              correlationId: crypto.randomUUID(),
            },
          });
        },
        resetPasswordTokenExpiresIn: 3600,
        sendResetPassword: async ({ user, token }) => {
          mail.sendAction(user.email, 'Reset your NASJ password', {
            title: 'Reset your password',
            intro: 'Choose a new password for your NASJ account.',
            label: 'Reset my password',
            url: `${config.PUBLIC_APP_URL}/auth/reset-password#token=${encodeURIComponent(token)}\nIf you did not request this, ignore this email.`,
            note: 'This link works for one hour. If you did not ask for this, you can ignore this email.',
          });
        },
      },
      emailVerification: {
        afterEmailVerification: async (user) => {
          // A verified change of login identity invalidates sessions as well as initial verification.
          await db.$transaction(async (tx) => {
            await tx.session.deleteMany({ where: { userId: user.id } });
            await tx.auditEvent.create({
              data: {
                actorId: user.id,
                action: 'EMAIL_VERIFIED',
                targetType: 'User',
                targetId: user.id,
                correlationId: crypto.randomUUID(),
              },
            });
          });
        },
        sendOnSignUp: true,
        autoSignInAfterVerification: false,
        expiresIn: 86400,
        sendVerificationEmail: async ({ user, token }) => {
          mail.sendAction(user.email, 'Verify your NASJ email', {
            title: 'Welcome to NASJ',
            intro: 'Please verify your email address to finish creating your account.',
            label: 'Verify my email',
            url: `${config.PUBLIC_APP_URL}/auth/verify-email#token=${encodeURIComponent(token)}`,
            note: 'This link works for 24 hours. If you did not create this account, you can ignore this email.',
          });
        },
      },
      // The Nest security boundary owns rate limiting for every external auth/API request.
      rateLimit: { enabled: false },
      databaseHooks: {
        session: {
          create: {
            before: async (session) => {
              const user = await db.user.findUnique({ where: { id: session.userId } });
              if (user?.status !== 'ACTIVE')
                throw new APIError('FORBIDDEN', { message: 'Sign-in unsuccessful.' });
              return { data: session };
            },
            after: async (session) => {
              const user = await db.user.findUnique({ where: { id: session.userId } });
              if (user?.status !== 'ACTIVE')
                await db.session.deleteMany({ where: { userId: session.userId } });
            },
          },
        },
      },
    });
  }
  session(headers: IncomingHttpHeaders) {
    return this.auth.api.getSession({
      headers: fromNodeHeaders(headers),
      query: { disableCookieCache: true },
    });
  }
}
