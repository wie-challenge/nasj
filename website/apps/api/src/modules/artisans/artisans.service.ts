import { exactCapacityQuantity, capacityHundredths, capacityDecimal } from '@nasj/contracts';
import { validateIdempotencyKey } from '../foundation/idempotency.js';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import type {
  PageInput,
  ArtisanProfileInput,
  AssistedProfileInput,
  ArtisanSkillsInput,
  CapacityDeclarationInput,
  AssociationLinkInput,
  DelegationGrantInput,
  DelegationScope,
} from '@nasj/contracts';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';
import {
  profileSelect,
  profileView,
  scopeMap,
  scopeView,
  delegationView,
} from './artisan.projection.js';

import { capacityViews, writeCapacity } from './capacity.js';

@Injectable()
export class ArtisansService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async owner(actor: Actor, db: Db = this.db) {
    const profile = await db.artisanProfile.findUnique({
      where: { userId: actor.id },
      select: profileSelect,
    });
    if (!profile) fail(404, 'ARTISAN_PROFILE_REQUIRED', 'Create your artisan profile first.');
    return profile;
  }
  private async access(
    actor: Actor,
    id: string,
    scope: DelegationScope,
    db: Db = this.db,
    grantId?: string,
  ) {
    const profile = await db.artisanProfile.findUnique({ where: { id }, select: profileSelect });
    if (!profile) fail(404, 'NOT_FOUND', 'Artisan profile not found.');
    if (!profile.userId)
      fail(
        403,
        'ASSISTED_REGISTRY_REQUIRED',
        'Use the assigned association registry for this participant.',
      );
    const owner = await db.user.findUnique({
      where: { id: profile.userId },
      select: { status: true, emailVerified: true },
    });
    if (owner?.status !== 'ACTIVE' || !owner.emailVerified)
      fail(403, 'FORBIDDEN', 'This artisan profile is unavailable.');
    if (profile.userId === actor.id) return { profile, delegation: null };
    if (profile.createdById && profile.createdById !== profile.userId)
      fail(
        403,
        'ASSISTED_REGISTRY_REQUIRED',
        'Use the assigned registry and current worker authorization for assisted participants.',
      );
    await this.requireProfileConsent(profile.userId, db);
    const grants = await db.delegationGrant.findMany({
      where: {
        id: grantId,
        artisanProfileId: id,
        delegateUserId: actor.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
        scopes: { has: scopeMap[scope] },
      },
    });
    for (const grant of grants) {
      const relationship = await db.associationMembership.findFirst({
        where: {
          artisanProfileId: id,
          organizationId: grant.organizationId,
          status: 'ACTIVE',
          endedAt: null,
          consentRecord: { decision: true, withdrawnAt: null },
          organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        },
      });
      const membership = await db.organizationMember.findFirst({
        where: {
          organizationId: grant.organizationId,
          userId: actor.id,
          status: 'ACTIVE',
          roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
        },
      });
      const consent = await db.consentRecord.findFirst({
        where: {
          userId: profile.userId,
          purpose: `delegation:${grant.id}`,
          decision: true,
          withdrawnAt: null,
        },
      });
      if (relationship && membership && consent) return { profile, delegation: grant };
    }
    fail(
      403,
      'FORBIDDEN',
      'An active association relationship and delegation for this action are required.',
    );
  }
  private async requireProfileConsent(userId: string | null, db: Db) {
    if (!userId)
      fail(
        403,
        'AUTHORIZATION_REQUIRED',
        'Use participant authorization in the association registry.',
      );
    const consent = await db.consentRecord.findFirst({
      where: {
        userId,
        purpose: 'artisan.profile',
        decision: true,
        withdrawnAt: null,
      },
    });
    if (!consent) fail(403, 'CONSENT_REQUIRED', 'Artisan profile processing consent is required.');
  }
  private async target(
    actor: Actor,
    id: string | undefined,
    scope: DelegationScope,
    db: Db = this.db,
  ) {
    return id
      ? this.access(actor, id, scope, db)
      : { profile: await this.owner(actor, db), delegation: null };
  }
  async me(actor: Actor) {
    return profileView(await this.owner(actor), true);
  }
  async detail(actor: Actor, id: string) {
    const { profile } = await this.access(actor, id, 'artisan.profile.read');
    return profileView(profile, actor.id === profile.userId);
  }
  async update(actor: Actor, input: ArtisanProfileInput | AssistedProfileInput, id?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      let existing = await tx.artisanProfile.findUnique({
        where: { userId: actor.id },
        select: profileSelect,
      });
      let delegation: Prisma.DelegationGrantGetPayload<object> | null = null;
      if (id)
        ({ profile: existing, delegation } = await this.access(
          actor,
          id,
          'artisan.profile.update',
          tx,
        ));
      if (
        !existing &&
        (!('processingConsent' in input) || !input.processingConsent || !input.policyVersion)
      )
        fail(
          400,
          'CONSENT_REQUIRED',
          'Agree to artisan profile processing before creating a profile.',
        );
      if ('processingConsent' in input && input.processingConsent) {
        if (!input.policyVersion || delegation)
          fail(400, 'INVALID_CONSENT', 'The artisan must provide a consent policy version.');
        const current = await tx.consentRecord.findFirst({
          where: {
            userId: actor.id,
            purpose: 'artisan.profile',
            decision: true,
            withdrawnAt: null,
          },
        });
        if (!current)
          await tx.consentRecord.create({
            data: {
              userId: actor.id,
              purpose: 'artisan.profile',
              policyVersion: input.policyVersion,
              decision: true,
              collectionContext: 'artisan_self_service',
            },
          });
      }
      const data = {
        displayName: input.displayName,
        region: input.region,
        preferredLanguage: input.preferredLanguage,
        ...(!delegation || existing?.contactVisibility !== 'PRIVATE'
          ? { contactPhone: input.contactPhone || null }
          : {}),
        availabilityStatus: input.availabilityStatus,
        experienceDescription: input.experienceDescription,
        equipment: input.equipment,
        ...('contactVisibility' in input && !delegation
          ? { contactVisibility: input.contactVisibility }
          : {}),
      };
      const result = existing
        ? await tx.artisanProfile.update({
            where: { id: existing.id },
            data,
            select: profileSelect,
          })
        : await tx.artisanProfile.create({
            data: { userId: actor.id, ...data },
            select: profileSelect,
          });
      await audit(tx, actor, {
        action: 'artisan.profile.update',
        targetType: 'ArtisanProfile',
        targetId: result.id,
        organizationId: delegation?.organizationId,
        after: {
          fields: Object.keys(data),
          assistedUserId: result.userId,
          delegationId: delegation?.id ?? null,
          availabilityStatus: result.availabilityStatus,
        },
      });
      return profileView(result, actor.id === result.userId);
    });
  }
  async catalog() {
    return {
      items: await this.db.craftSkill.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    };
  }
  async skills(actor: Actor, id?: string) {
    const { profile } = await this.target(actor, id, 'artisan.skills.manage');
    return {
      items: await this.db.artisanSkill.findMany({
        where: { artisanProfileId: profile.id },
        select: {
          craftSkillId: true,
          proficiency: true,
          evidence: true,
          craftSkill: { select: { id: true, name: true, category: true, description: true } },
        },
        orderBy: { craftSkillId: 'asc' },
      }),
    };
  }
  async replaceSkills(actor: Actor, input: ArtisanSkillsInput, id?: string) {
    await iamTransaction(this.db, actor, async (tx) => {
      const { profile, delegation } = await this.target(actor, id, 'artisan.skills.manage', tx);
      const found = await tx.craftSkill.count({
        where: { id: { in: input.items.map((i) => i.craftSkillId) }, isActive: true },
      });
      if (found !== input.items.length) fail(400, 'INVALID_SKILL', 'Select active craft skills.');
      await tx.artisanSkill.deleteMany({ where: { artisanProfileId: profile.id } });
      if (input.items.length)
        await tx.artisanSkill.createMany({
          data: input.items.map((i) => ({
            artisanProfileId: profile.id,
            craftSkillId: i.craftSkillId,
            proficiency: i.proficiency,
            evidence: i.evidence,
          })),
        });
      await audit(tx, actor, {
        action: 'artisan.skills.manage',
        targetType: 'ArtisanProfile',
        targetId: profile.id,
        organizationId: delegation?.organizationId,
        after: {
          craftSkillIds: input.items.map((i) => i.craftSkillId),
          delegationId: delegation?.id ?? null,
        },
      });
    });
    return this.skills(actor, id);
  }
  async associationCapacity(actor: Actor, organizationId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: {
          userId: actor.id,
          organizationId,
          status: 'ACTIVE',
          roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
          organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        },
      });
      if (!member)
        fail(403, 'FORBIDDEN', 'An active coordinator in this approved association is required.');
      const grants = await tx.delegationGrant.findMany({
        where: {
          organizationId,
          delegateUserId: actor.id,
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: new Date() },
          scopes: { has: 'CAPACITY_READ' },
        },
        select: { id: true, artisanProfileId: true },
        take: 501,
      });
      if (grants.length > 500)
        fail(409, 'COHORT_TOO_LARGE', 'Narrow this reviewed capacity cohort before reporting.');
      const authorized = new Set<string>();
      for (const grant of grants) {
        try {
          await this.access(actor, grant.artisanProfileId, 'artisan.capacity.read', tx, grant.id);
          authorized.add(grant.artisanProfileId);
        } catch (error) {
          if (!(error instanceof HttpException) || ![403, 404].includes(error.getStatus()))
            throw error;
        }
      }
      const rows = await tx.capacityDeclaration.findMany({
        where: { artisanProfileId: { in: [...authorized] }, supersededAt: null },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      });
      const unique = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = [
          row.artisanProfileId,
          row.craftSkillId,
          row.unitType,
          row.effectiveFrom.toISOString(),
          row.effectiveTo.toISOString(),
        ].join('|');
        if (!unique.has(key)) unique.set(key, row);
      }
      const groups = new Map<
        string,
        {
          craftSkillId: string;
          unit: string;
          periodFrom: string;
          periodTo: string;
          members: Set<string>;
          declared: bigint;
          reserved: bigint;
          committed: bigint;
          free: bigint;
          unknown: boolean;
        }
      >();
      for (const row of await capacityViews(tx, [...unique.values()])) {
        const key = [row.craftSkillId, row.unitType, row.effectiveFrom, row.effectiveTo].join('|');
        const group = groups.get(key) ?? {
          craftSkillId: row.craftSkillId,
          unit: row.unitType,
          periodFrom: row.effectiveFrom,
          periodTo: row.effectiveTo,
          members: new Set<string>(),
          declared: 0n,
          reserved: 0n,
          committed: 0n,
          free: 0n,
          unknown: false,
        };
        group.members.add(row.artisanProfileId);
        group.declared += capacityHundredths(row.summary.declared);
        group.reserved += capacityHundredths(row.summary.reserved);
        group.committed += capacityHundredths(row.summary.committed);
        group.free += capacityHundredths(row.summary.remaining);
        group.unknown ||= !row.summary.availabilityKnown;
        groups.set(key, group);
      }
      return {
        organizationId,
        purpose: 'Consented association capacity coordination',
        timezone: 'Africa/Tunis',
        asOf: new Date().toISOString(),
        population: authorized.size,
        missingDeclarationCount: [...authorized].filter(
          (id) => !rows.some((row) => row.artisanProfileId === id),
        ).length,
        items: [...groups.values()].map((group) => ({
          craftSkillId: group.craftSkillId,
          unit: group.unit,
          periodFrom: group.periodFrom,
          periodTo: group.periodTo,
          memberCount: group.members.size,
          declared: capacityDecimal(group.declared),
          reserved: capacityDecimal(group.reserved),
          committed: capacityDecimal(group.committed),
          free: group.unknown ? null : capacityDecimal(group.free),
          availabilityKnown: !group.unknown,
        })),
        limitations: [
          'Only current explicit capacity-read delegations and consented active relationships contribute.',
          'Different periods and units are never combined. Missing capacity remains unavailable.',
        ],
      };
    });
  }

  async capacity(
    actor: Actor,
    id?: string,
    q: Pick<PageInput, 'page' | 'pageSize'> = { page: 1, pageSize: 100 },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { profile } = await this.target(actor, id, 'artisan.capacity.read', tx);
      const rows = await tx.capacityDeclaration.findMany({
        where: { artisanProfileId: profile.id },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
      return {
        items: await capacityViews(tx, rows),
        total: await tx.capacityDeclaration.count({ where: { artisanProfileId: profile.id } }),
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async declare(actor: Actor, input: CapacityDeclarationInput, id?: string, key?: string) {
    validateIdempotencyKey(key);
    return iamTransaction(this.db, actor, async (tx) => {
      const { profile, delegation } = await this.target(actor, id, 'artisan.capacity.update', tx);
      await this.requireProfileConsent(profile.userId, tx);
      const skill = await tx.artisanSkill.findFirst({
        where: {
          artisanProfileId: profile.id,
          craftSkillId: input.craftSkillId,
          craftSkill: { isActive: true },
        },
      });
      if (!skill)
        fail(400, 'INVALID_SKILL', 'Declare capacity for one of your active craft skills.');
      return writeCapacity(
        tx,
        actor,
        {
          ...input,
          quantity: exactCapacityQuantity(input.quantity),
          artisanProfileId: profile.id,
          delegationId: delegation?.id,
          organizationId: delegation?.organizationId,
        },
        key,
        Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ) as Prisma.InputJsonObject,
      );
    });
  }
  async associationCatalog() {
    return {
      items: await this.db.organization.findMany({
        where: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    };
  }
  async associations(actor: Actor) {
    const profile = await this.owner(actor);
    const rows = await this.db.associationMembership.findMany({
      where: { artisanProfileId: profile.id },
      include: { organization: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        organizationName: r.organization.name,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        consentRecordId: r.consentRecordId,
      })),
    };
  }
  async link(actor: Actor, input: AssociationLinkInput) {
    await iamTransaction(this.db, actor, async (tx) => {
      const profile = await this.owner(actor, tx);
      const org = await tx.organization.findFirst({
        where: { id: input.organizationId, type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
      });
      if (!org) fail(400, 'INVALID_ASSOCIATION', 'Select an approved association.');
      const management = await tx.artisanManagement.findFirst({
        where: { artisanProfileId: profile.id, endedAt: null },
      });
      if (management && management.organizationId !== org.id)
        fail(
          409,
          'CONTROLLED_TRANSFER_REQUIRED',
          'Ask for a reviewed managing association transfer.',
        );
      if (
        await tx.associationMembership.findFirst({
          where: {
            artisanProfileId: profile.id,
            status: 'ACTIVE',
            endedAt: null,
            organizationId: { not: org.id },
          },
        })
      )
        fail(
          409,
          'CONTROLLED_TRANSFER_REQUIRED',
          'Only one active managing association is permitted.',
        );
      const old = await tx.associationMembership.findUnique({
        where: {
          artisanProfileId_organizationId: {
            artisanProfileId: profile.id,
            organizationId: org.id,
          },
        },
      });
      if (old?.status === 'ACTIVE')
        fail(409, 'RELATIONSHIP_EXISTS', 'This association is already linked.');
      const consent = await tx.consentRecord.create({
        data: {
          userId: actor.id,
          purpose: `association:${org.id}`,
          policyVersion: input.policyVersion,
          decision: true,
          collectionContext: 'artisan_self_service',
        },
      });
      const row = await tx.associationMembership.upsert({
        where: {
          artisanProfileId_organizationId: {
            artisanProfileId: profile.id,
            organizationId: org.id,
          },
        },
        create: {
          artisanProfileId: profile.id,
          organizationId: org.id,
          consentRecordId: consent.id,
        },
        update: {
          status: 'ACTIVE',
          startedAt: new Date(),
          endedAt: null,
          consentRecordId: consent.id,
        },
      });
      if (!management)
        await tx.artisanManagement.create({
          data: {
            artisanProfileId: profile.id,
            organizationId: org.id,
            recordedById: actor.id,
            reason: 'Existing authenticated participant voluntary association link',
          },
        });
      await audit(tx, actor, {
        action: 'artisan.associations.manage',
        targetType: 'AssociationMembership',
        targetId: row.id,
        organizationId: org.id,
        after: { status: 'ACTIVE', consentRecordId: consent.id },
      });
    });
    return this.associations(actor);
  }
  async unlink(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await this.owner(actor, tx);
      const row = await tx.associationMembership.findFirst({
        where: { id, artisanProfileId: profile.id, status: 'ACTIVE' },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Active association relationship not found.');
      const now = new Date();
      await tx.artisanManagement.updateMany({
        where: { artisanProfileId: profile.id, organizationId: row.organizationId, endedAt: null },
        data: { endedAt: now },
      });
      await tx.artisanAssignment.updateMany({
        where: { artisanProfileId: profile.id, organizationId: row.organizationId, endedAt: null },
        data: { endedAt: now },
      });
      await tx.associationMembership.update({
        where: { id },
        data: { status: 'REVOKED', endedAt: now },
      });
      await tx.consentRecord.update({
        where: { id: row.consentRecordId },
        data: { withdrawnAt: now },
      });
      const grants = await tx.delegationGrant.findMany({
        where: {
          artisanProfileId: profile.id,
          organizationId: row.organizationId,
          status: 'ACTIVE',
        },
      });
      await tx.delegationGrant.updateMany({
        where: { id: { in: grants.map((g) => g.id) } },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await tx.consentRecord.updateMany({
        where: {
          userId: actor.id,
          purpose: { in: grants.map((g) => `delegation:${g.id}`) },
          withdrawnAt: null,
        },
        data: { withdrawnAt: now },
      });
      await audit(tx, actor, {
        action: 'artisan.association.withdraw',
        targetType: 'AssociationMembership',
        targetId: id,
        organizationId: row.organizationId,
        after: { status: 'REVOKED', revokedDelegations: grants.length },
      });
      return { ok: true };
    });
  }
  async coordinators(actor: Actor, id: string) {
    const profile = await this.owner(actor);
    const relation = await this.db.associationMembership.findFirst({
      where: {
        id,
        artisanProfileId: profile.id,
        status: 'ACTIVE',
        organization: { approvalStatus: 'APPROVED' },
        consentRecord: { withdrawnAt: null, decision: true },
      },
    });
    if (!relation) fail(404, 'NOT_FOUND', 'Active association relationship not found.');
    const rows = await this.db.organizationMember.findMany({
      where: {
        organizationId: relation.organizationId,
        status: 'ACTIVE',
        roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
        user: { status: 'ACTIVE', emailVerified: true },
      },
      select: { user: { select: { id: true, name: true } } },
      take: 100,
    });
    return { items: rows.map((r) => r.user) };
  }
  async delegations(actor: Actor) {
    const profile = await this.owner(actor);
    return {
      items: (
        await this.db.delegationGrant.findMany({
          where: { artisanProfileId: profile.id },
          include: { delegate: { select: { name: true } } },
          orderBy: { grantedAt: 'desc' },
          take: 100,
        })
      ).map(delegationView),
    };
  }
  async grant(actor: Actor, input: DelegationGrantInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await this.owner(actor, tx);
      const now = new Date();
      if (
        new Date(input.expiresAt) <= now ||
        new Date(input.expiresAt).getTime() - now.getTime() > 366 * 86400000
      )
        fail(400, 'INVALID_EXPIRY', 'Choose a future expiry within one year.');
      if (actor.id === input.delegateUserId)
        fail(400, 'INVALID_DELEGATE', 'Choose a different association coordinator.');
      const relation = await tx.associationMembership.findFirst({
        where: {
          artisanProfileId: profile.id,
          organizationId: input.organizationId,
          status: 'ACTIVE',
          endedAt: null,
          consentRecord: { decision: true, withdrawnAt: null },
          organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
        },
      });
      const member = await tx.organizationMember.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.delegateUserId,
          status: 'ACTIVE',
          roles: { some: { role: 'ASSOCIATION_COORDINATOR' } },
          user: { status: 'ACTIVE', emailVerified: true },
        },
      });
      if (!relation || !member)
        fail(403, 'FORBIDDEN', 'Choose an active coordinator from a linked approved association.');
      const row = await tx.delegationGrant.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: input.organizationId,
          delegateUserId: input.delegateUserId,
          scopes: input.scopes.map((s) => scopeMap[s]),
          expiresAt: new Date(input.expiresAt),
        },
      });
      await tx.consentRecord.create({
        data: {
          userId: actor.id,
          purpose: `delegation:${row.id}`,
          policyVersion: input.policyVersion,
          decision: true,
          collectionContext: 'artisan_self_service',
        },
      });
      await audit(tx, actor, {
        action: 'delegation.create',
        targetType: 'DelegationGrant',
        targetId: row.id,
        organizationId: row.organizationId,
        after: {
          delegateUserId: row.delegateUserId,
          scopes: row.scopes,
          expiresAt: row.expiresAt.toISOString(),
        },
      });
      return delegationView(row);
    });
  }
  async revoke(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const profile = await this.owner(actor, tx);
      const row = await tx.delegationGrant.findFirst({
        where: { id, artisanProfileId: profile.id, status: 'ACTIVE' },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Active delegation not found.');
      const now = new Date();
      await tx.delegationGrant.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await tx.consentRecord.updateMany({
        where: { userId: actor.id, purpose: `delegation:${id}`, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      await audit(tx, actor, {
        action: 'delegation.revoke',
        targetType: 'DelegationGrant',
        targetId: id,
        organizationId: row.organizationId,
        after: { status: 'REVOKED' },
      });
      return { ok: true };
    });
  }
  async assisted(actor: Actor) {
    const rows = await this.db.delegationGrant.findMany({
      where: {
        delegateUserId: actor.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { artisanProfile: { select: { id: true, displayName: true } } },
      take: 100,
    });
    const items = [];
    for (const row of rows) {
      const scopes: DelegationScope[] = [];
      for (const scope of row.scopes) {
        try {
          await this.access(actor, row.artisanProfileId, scopeView(scope), this.db, row.id);
          scopes.push(scopeView(scope));
        } catch (error) {
          if (!(error instanceof HttpException) || ![403, 404].includes(error.getStatus()))
            throw error;
        }
      }
      if (scopes.length)
        items.push({
          id: row.artisanProfile.id,
          displayName: row.artisanProfile.displayName,
          organizationId: row.organizationId,
          scopes,
          expiresAt: row.expiresAt.toISOString(),
        });
    }
    return { items };
  }
}
