import { assertDemoSession } from '../demo/demo-access.js';
import { requireMfa } from '../foundation/mfa.js';
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import { ADMIN_ONLY, IS_PUBLIC, type AppRequest } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { verifyCsrf } from '../../common/csrf.js';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<AppRequest>();
    const session = await this.auth.session(req.headers);
    if (!session) fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const user = await this.db.user.findUnique({ where: { id: session.user.id } });
    if (user?.status !== 'ACTIVE' || !user.emailVerified)
      fail(403, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable.');
    await assertDemoSession(this.db, user.id, req.headers.cookie, this.config.DEMO_MODE);
    req.actor = {
      id: user.id,
      requestId: req.requestId,
      role: user.role,
      sessionId: session.session.id,
      sessionCreatedAt: session.session.createdAt,
      sessionExpiresAt: session.session.expiresAt,
    };
    if (
      ![
        '/api/v1/me',
        '/api/v1/me/context',
        '/api/v1/settings/security',
        '/api/v1/settings/preferences',
        '/api/v1/me/deactivate',
      ].includes(req.path) &&
      !req.path.startsWith('/api/v1/me/sessions')
    )
      await requireMfa(this.db, req.actor, this.config.REQUIRE_PRIVILEGED_MFA);
    if (
      this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]) &&
      user.role !== 'ADMIN'
    )
      fail(403, 'FORBIDDEN', 'You do not have permission for this action.');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !(await verifyCsrf(
        this.config.BETTER_AUTH_SECRET,
        String(req.headers['x-csrf-token'] ?? ''),
        session.session.id,
      ))
    )
      fail(403, 'CSRF_REJECTED', 'Refresh the page and try again.');
    return true;
  }
}
