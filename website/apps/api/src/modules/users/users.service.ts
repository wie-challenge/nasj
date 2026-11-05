import { Inject, Injectable } from '@nestjs/common';
import type { AccountUpdate, PageInput, ProfileInput } from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { csrfToken } from '../../common/csrf.js';
import { logger } from '../../common/logging.js';
import { publicUser, userSelect } from './user.projection.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';
@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async me(actor: Actor) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: userSelect,
    });
    return {
      user: publicUser(user),
      session: {
        id: actor.sessionId,
        createdAt: actor.sessionCreatedAt.toISOString(),
        expiresAt: actor.sessionExpiresAt.toISOString(),
      },
      csrfToken: await csrfToken(this.config.BETTER_AUTH_SECRET, actor.sessionId),
    };
  }
  async profile(actor: Actor, input: ProfileInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const user = await tx.user.update({
        where: { id: actor.id },
        data: { name: input.name },
        select: userSelect,
      });
      await audit(tx, actor, {
        action: 'account.profile.update',
        targetType: 'User',
        targetId: actor.id,
        after: { fields: ['name'] },
      });
      return publicUser(user);
    });
  }
  private async managerResponsibilities(userId: string, db: Db = this.db) {
    const memberships = await db.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', isManager: true },
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            members: {
              where: {
                userId: { not: userId },
                status: 'ACTIVE',
                isManager: true,
                user: { status: 'ACTIVE', emailVerified: true },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { organizationId: 'asc' },
    });
    return memberships
      .filter((m) => !m.organization.members.length)
      .map((m) => ({
        organizationId: m.organization.id,
        name: m.organization.name,
        reason: 'LAST_ACTIVE_MANAGER' as const,
      }));
  }
  async responsibilities(actor: Actor) {
    return { items: await this.managerResponsibilities(actor.id) };
  }
  async detail(actor: Actor, id: string) {
    if (actor.id !== id && actor.role !== 'ADMIN')
      fail(403, 'FORBIDDEN', 'You do not have permission for this resource.');
    const user = await this.db.user.findUnique({ where: { id }, select: userSelect });
    if (!user) fail(404, 'NOT_FOUND', 'User not found.');
    return publicUser(user);
  }
  async list(input: PageInput) {
    const where = input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: 'insensitive' as const } },
            { email: { contains: input.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [users, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: userSelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.user.count({ where }),
    ]);
    return { items: users.map(publicUser), total, page: input.page, pageSize: input.pageSize };
  }
  async sessions(actor: Actor) {
    const sessions = await this.db.session.findMany({
      where: { userId: actor.id, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === actor.sessionId,
      })),
    };
  }
  async revokeSession(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const session = await tx.session.findFirst({
        where: { id, userId: actor.id },
        select: { id: true },
      });
      if (!session) fail(404, 'NOT_FOUND', 'Session not found.');
      await audit(tx, actor, {
        action: 'account.session.revoke',
        targetType: 'Session',
        targetId: id,
        after: { current: id === actor.sessionId },
      });
      await tx.session.delete({ where: { id } });
      return { ok: true };
    });
  }
  async revokeOtherSessions(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const deleted = await tx.session.deleteMany({
        where: { userId: actor.id, id: { not: actor.sessionId } },
      });
      await audit(tx, actor, {
        action: 'account.sessions.revoke_others',
        targetType: 'User',
        targetId: actor.id,
        after: { revokedCount: deleted.count },
      });
      return { ok: true, revokedCount: deleted.count };
    });
  }
  async update(actor: Actor, id: string, input: AccountUpdate) {
    const result = await iamTransaction(this.db, actor, async (tx) => {
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
      if (
        currentActor?.role !== 'ADMIN' ||
        currentActor.status !== 'ACTIVE' ||
        !currentActor.emailVerified
      )
        fail(403, 'FORBIDDEN', 'Administrator access is required.');
      const old = await tx.user.findUnique({ where: { id } });
      if (!old) fail(404, 'NOT_FOUND', 'User not found.');
      if (input.role === 'ADMIN' && !old.emailVerified)
        fail(409, 'UNVERIFIED_ACCOUNT', 'Verify the account before granting administrator access.');
      const nextRole = input.role ?? old.role,
        nextStatus = input.status ?? old.status;
      if (
        old.role === 'ADMIN' &&
        old.status === 'ACTIVE' &&
        old.emailVerified &&
        (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE')
      ) {
        const remaining = await tx.user.count({
          where: { id: { not: id }, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
        });
        if (!remaining) fail(409, 'LAST_ADMIN', 'Keep at least one active verified administrator.');
      }
      const unmanagedOrganizationIds =
        nextStatus !== 'ACTIVE'
          ? (await this.managerResponsibilities(id, tx)).map((item) => item.organizationId)
          : [];
      const result = await tx.user.update({
        where: { id },
        data: { role: nextRole, status: nextStatus },
        select: userSelect,
      });
      if (nextRole !== old.role || nextStatus !== old.status)
        await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, actor, {
        action: 'account.access.update',
        targetType: 'User',
        targetId: id,
        before: { role: old.role, status: old.status },
        after: { role: nextRole, status: nextStatus, unmanagedOrganizationIds },
      });
      return publicUser(result);
    });
    logger.info(
      { actorId: actor.id, resourceId: id, action: 'ACCOUNT_UPDATED' },
      'Account access changed',
    );
    return result;
  }
  async deactivate(actor: Actor) {
    if (Date.now() - actor.sessionCreatedAt.getTime() > 900000)
      fail(403, 'REAUTHENTICATION_REQUIRED', 'Sign in again before deactivating your account.');
    const result = await iamTransaction(this.db, actor, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      if (
        user.role === 'ADMIN' &&
        !(await tx.user.count({
          where: { id: { not: actor.id }, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
        }))
      )
        fail(409, 'LAST_ADMIN', 'Keep at least one active verified administrator.');
      const responsibilities = await this.managerResponsibilities(actor.id, tx);
      if (responsibilities.length)
        fail(
          409,
          'LAST_ORGANIZATION_MANAGER',
          'Assign another active verified organization manager before deactivating your account.',
        );
      await audit(tx, actor, {
        action: 'account.deactivate',
        targetType: 'User',
        targetId: actor.id,
        before: { status: user.status },
        after: { status: 'DISABLED' },
      });
      await tx.user.update({ where: { id: actor.id }, data: { status: 'DISABLED' } });
      await tx.session.deleteMany({ where: { userId: actor.id } });
      return { ok: true };
    });
    logger.info({ actorId: actor.id, action: 'ACCOUNT_DEACTIVATED' }, 'Account deactivated');
    return result;
  }
}
