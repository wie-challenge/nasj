import { Inject, Injectable } from '@nestjs/common';
import {
  permissionsForMembership,
  type FoundationPermission,
  type IdentityContext,
  type Permission,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { PolicyService } from './policy.service.js';
import type { Db } from './transaction.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
export const partnerTypes = ['ASSOCIATION', 'PARTNER_COOPERATIVE'];
@Injectable()
export class AccessService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}
  async context(actor: Actor, db: Db = this.db): Promise<IdentityContext> {
    const user = await this.policy.requireActive(actor, db);
    const members = await db.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE' },
      include: { organization: true, roles: true, permissionGrants: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    const organizations = members.map((m) => ({
      id: m.organizationId,
      name: m.organization.name,
      type: m.organization.type,
      approvalStatus: m.organization.approvalStatus,
      permissions: permissionsForMembership(m),
    }));
    const approved = members.filter((m) => m.organization.approvalStatus === 'APPROVED');
    const personas: IdentityContext['personas'] = [];
    if (user.role === 'ADMIN') personas.push('PLATFORM_ADMIN');
    if (
      approved.some(
        (m) =>
          m.organization.type === 'INTERNAL' && m.roles.some((r) => r.role === 'NASJ_OPERATOR'),
      )
    )
      personas.push('NASJ_OPERATOR');
    if (
      approved.some(
        (m) =>
          m.organization.type === 'INTERNAL' &&
          m.roles.some((r) =>
            ['INVENTORY_LOGISTICS_COORDINATOR', 'PRODUCTION_MANAGER'].includes(r.role),
          ),
      )
    )
      personas.push('NASJ_COORDINATOR');
    if (
      approved.some(
        (m) =>
          m.organization.type === 'INTERNAL' && m.roles.some((r) => r.role === 'FINANCE_MANAGER'),
      )
    )
      personas.push('NASJ_FINANCE');
    if (
      approved.some(
        (m) =>
          m.organization.type === 'BUYER_BUSINESS' &&
          m.roles.some((r) => ['BUYER_REPRESENTATIVE', 'BUYER'].includes(r.role)),
      )
    )
      personas.push('BUYER_REPRESENTATIVE');
    const coordinator = approved.find(
      (m) => partnerTypes.includes(m.organization.type) && m.isCoordinator,
    );
    if (coordinator) personas.push('ASSOCIATION_COORDINATOR');
    const ownProfile = await db.artisanProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    return {
      linkedArtisanProfileId: ownProfile?.id ?? null,
      personas,
      organizations,
      coordinatorOrganizationId: coordinator?.organizationId ?? null,
      landingPath: personas.includes('PLATFORM_ADMIN')
        ? '/nasj/organizations'
        : personas.includes('NASJ_OPERATOR')
          ? '/nasj/organizations'
          : personas.includes('NASJ_COORDINATOR')
            ? '/nasj/requests'
            : personas.includes('NASJ_FINANCE')
              ? '/nasj/finance'
              : personas.includes('BUYER_REPRESENTATIVE')
                ? '/catalog'
                : coordinator
                  ? '/association/requests'
                  : '/dashboard',
      realPayoutsEnabled: false,
      independentContactPath: '/participant-support',
    };
  }
  async coordinator(actor: Actor, action: FoundationPermission, db: Db = this.db) {
    await this.policy.requireActive(actor, db);
    const member = await db.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        isCoordinator: true,
        organization: {
          type: { in: ['ASSOCIATION', 'PARTNER_COOPERATIVE'] },
          approvalStatus: 'APPROVED',
        },
      },
      include: { roles: true, organization: true, permissionGrants: true },
    });
    if (!member || !permissionsForMembership(member).includes(action))
      fail(
        403,
        'ASSOCIATION_ACCESS_DENIED',
        'An approved active association affiliation and permission are required.',
      );
    return member;
  }
  async operator(
    actor: Actor,
    action: FoundationPermission,
    db: Db = this.db,
    organizationId?: string,
  ) {
    await this.policy.requireActive(actor, db);
    const member = await db.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
        roles: { some: { role: 'NASJ_OPERATOR' } },
      },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member || !permissionsForMembership(member).includes(action))
      fail(403, 'OPERATOR_ACCESS_DENIED', 'An active internal operational permission is required.');
    if (
      organizationId &&
      !(await db.operatorAssignment.findFirst({
        where: { operatorId: actor.id, organizationId, revokedAt: null },
      }))
    )
      fail(403, 'ACCOUNT_SCOPE_DENIED', 'This organization is not assigned to you.');
    if (
      organizationId &&
      !(await db.organization.findFirst({
        where: { id: organizationId, approvalStatus: 'APPROVED' },
      }))
    )
      fail(403, 'ORGANIZATION_UNAVAILABLE', 'The assigned organization is unavailable.');
    return member;
  }
  async artisan(actor: Actor, id: string, action: FoundationPermission, db: Db = this.db) {
    const member = await this.coordinator(actor, action, db);
    const profile = await db.artisanProfile.findFirst({
      where: {
        id,
        managements: { some: { organizationId: member.organizationId, endedAt: null } },
        assignments: {
          some: { coordinatorId: actor.id, organizationId: member.organizationId, endedAt: null },
        },
      },
    });
    if (!profile) fail(404, 'NOT_FOUND', 'Assigned artisan not found.');
    return { profile, member };
  }
  async authorize(actor: Actor, action: Permission, organizationId: string, db: Db = this.db) {
    return this.policy.requireOrganization(actor, organizationId, action, db);
  }
}
