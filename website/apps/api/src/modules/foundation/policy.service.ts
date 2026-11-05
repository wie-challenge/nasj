import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { requireMfa } from './mfa.js';
import { Inject, Injectable } from '@nestjs/common';
import { permissionsForMembership, type Permission } from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import type { Db } from './transaction.js';
@Injectable()
export class PolicyService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async requireActive(actor: Actor, db: Db = this.db) {
    const user = await db.user.findUnique({ where: { id: actor.id } });
    if (!user?.emailVerified || user.status !== 'ACTIVE')
      fail(403, 'ACCOUNT_UNAVAILABLE', 'An active verified account is required.');
    return user;
  }
  async requireAdmin(actor: Actor, db: Db = this.db) {
    const user = await this.requireActive(actor, db);
    await requireMfa(db, actor, this.config.REQUIRE_PRIVILEGED_MFA);
    if (user.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Administrator access is required.');
    return user;
  }
  async assertSingleCoordinator(userId: string, organizationId: string, db: Db = this.db) {
    if (
      await db.organizationMember.findFirst({
        where: {
          userId,
          isCoordinator: true,
          status: 'ACTIVE',
          organizationId: { not: organizationId },
        },
      })
    )
      fail(
        409,
        'ACTIVE_AFFILIATION_EXISTS',
        'End or transfer the existing coordinator affiliation first.',
      );
  }
  async requireOrganization(
    actor: Actor,
    organizationId: string,
    action: Permission,
    db: Db = this.db,
  ) {
    await this.requireActive(actor, db);
    await requireMfa(db, actor, this.config.REQUIRE_PRIVILEGED_MFA);
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.id } },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member || !permissionsForMembership(member).includes(action))
      fail(403, 'FORBIDDEN', 'You do not have permission in this organization.');
    return member;
  }
}
