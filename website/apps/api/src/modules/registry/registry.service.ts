import { Inject, Injectable } from '@nestjs/common';
import {
  grantAllowed,
  permissionsForMembership,
  type AuthorizationEvidence,
  type RegistryCreate,
  type RegistryUpdate,
  type AssistedCapacity,
  type PageInput,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { AccessService, partnerTypes } from '../foundation/access.service.js';
import { PolicyService } from '../foundation/policy.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { capacityViews, writeCapacity } from '../artisans/capacity.js';
import { validateIdempotencyKey } from '../foundation/idempotency.js';
const paging = (q: PageInput) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
@Injectable()
export class RegistryService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}
  private event(
    tx: Db,
    actor: Actor,
    action: string,
    targetId: string,
    organizationId?: string,
    reason?: string,
    after?: Parameters<typeof audit>[2]['after'],
    before?: Parameters<typeof audit>[2]['before'],
  ) {
    return audit(tx, actor, {
      action,
      targetId,
      targetType: 'Foundation',
      organizationId,
      reason,
      after,
      before,
    });
  }
  private async coordinatorTarget(tx: Db, userId: string, orgId: string) {
    const member = await tx.organizationMember.findFirst({
      where: {
        userId,
        organizationId: orgId,
        isCoordinator: true,
        status: 'ACTIVE',
        user: { status: 'ACTIVE', emailVerified: true },
        organization: {
          approvalStatus: 'APPROVED',
          type: { in: ['ASSOCIATION', 'PARTNER_COOPERATIVE'] },
        },
      },
    });
    if (!member)
      fail(
        409,
        'COORDINATOR_UNAVAILABLE',
        'Choose an active coordinator in the approved managing association.',
      );
    return member;
  }
  private async evidence(tx: Db, actor: Actor, artisanId: string, input: AuthorizationEvidence) {
    const policy = await tx.authorizationPolicy.findUnique({ where: { id: input.policyId } });
    if (!policy?.active || !policy.methods.includes(input.method))
      fail(
        409,
        'POLICY_REVIEW_REQUIRED',
        'Select an active reviewed authorization policy and method.',
      );
    if (new Date(input.occurredAt) > new Date())
      fail(400, 'FUTURE_EVIDENCE', 'Authorization cannot be recorded in the future.');
    if (
      input.method === 'WITNESSED_VERBAL' &&
      (!input.witnessReference || input.witnessReference === actor.id)
    )
      fail(400, 'INDEPENDENT_WITNESS_REQUIRED', 'Record a separate witness.');
    return tx.onboardingAuthorization.create({
      data: { ...input, artisanProfileId: artisanId, recordedById: actor.id },
    });
  }
  private async authorized(tx: Db, artisanId: string, authorizationId?: string) {
    const evidence = await tx.onboardingAuthorization.findFirst({
      where: {
        id: authorizationId,
        artisanProfileId: artisanId,
        purpose: authorizationId ? 'CAPACITY' : 'PARTICIPATION',
        withdrawnAt: null,
        policy: { active: true },
      },
    });
    if (!evidence)
      fail(
        403,
        'WORKER_AUTHORIZATION_REQUIRED',
        'Current documented worker authorization is required.',
      );
    return evidence;
  }
  async concern(input: {
    subjectReference: string;
    concernType: string;
    description: string;
    contactMethod?: string;
  }) {
    await this.db.participantConcern.create({ data: input });
    return { message: 'Your concern has been sent for independent NASJ review.' };
  }
  async concerns(actor: Actor, q: PageInput) {
    await this.policy.requireAdmin(actor);
    const [items, total] = await this.db.$transaction([
      this.db.participantConcern.findMany({ ...paging(q), orderBy: { createdAt: 'desc' } }),
      this.db.participantConcern.count(),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async reviewConcern(
    actor: Actor,
    id: string,
    input: { status: 'IN_REVIEW' | 'RESOLVED'; resolution: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const concern = await tx.participantConcern.findUnique({ where: { id } });
      if (!concern) fail(404, 'NOT_FOUND', 'Concern not found.');
      const subject = await tx.artisanProfile.findUnique({
        where: { id: concern.subjectReference },
      });
      if (
        subject?.createdById === actor.id ||
        (await tx.artisanAssignment.findFirst({
          where: { artisanProfileId: concern.subjectReference, coordinatorId: actor.id },
        }))
      )
        fail(
          403,
          'INDEPENDENT_REVIEW_REQUIRED',
          'A separate authorized person must review this concern.',
        );
      if (concern.status === 'RESOLVED')
        fail(409, 'CASE_RESOLVED', 'This concern is already resolved.');
      await tx.participantConcern.update({
        where: { id },
        data: { ...input, reviewedById: actor.id, reviewedAt: new Date() },
      });
      await this.event(tx, actor, 'participant.concern.review', id);
      return { id, status: input.status };
    });
  }
  async policies(actor: Actor) {
    await this.policy.requireActive(actor);
    return this.db.authorizationPolicy.findMany({
      where: { active: true },
      select: { id: true, version: true, methods: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  }
  async reviewPolicy(
    actor: Actor,
    input: { version: string; methods: string[]; reviewReference: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const p = await tx.authorizationPolicy.create({ data: { ...input, reviewedById: actor.id } });
      await this.event(
        tx,
        actor,
        'authorization.policy.review',
        p.id,
        undefined,
        input.reviewReference,
      );
      return p;
    });
  }
  async policyStatus(actor: Actor, id: string, active: boolean, reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const p = await tx.authorizationPolicy.updateMany({ where: { id }, data: { active } });
      if (!p.count) fail(404, 'NOT_FOUND', 'Policy not found.');
      await this.event(tx, actor, 'authorization.policy.status', id, undefined, reason);
      return { id, active };
    });
  }
  async association(actor: Actor) {
    const m = await this.access.coordinator(actor, 'association.artisan.read');
    return {
      id: m.organizationId,
      name: m.organization.name,
      approvalStatus: m.organization.approvalStatus,
      permissions: permissionsForMembership(m),
    };
  }
  async coordinators(actor: Actor, q: PageInput) {
    const m = await this.access.coordinator(actor, 'association.artisan.read');
    const where = {
      organizationId: m.organizationId,
      status: 'ACTIVE' as const,
      isCoordinator: true,
      user: { status: 'ACTIVE' as const },
    };
    const [items, total] = await this.db.$transaction([
      this.db.organizationMember.findMany({
        where,
        ...paging(q),
        select: { id: true, user: { select: { id: true, name: true } }, status: true },
        orderBy: { id: 'asc' },
      }),
      this.db.organizationMember.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async list(actor: Actor, q: PageInput) {
    const m = await this.access.coordinator(actor, 'association.artisan.read');
    const where = {
      managements: { some: { organizationId: m.organizationId, endedAt: null } },
      assignments: {
        some: { coordinatorId: actor.id, organizationId: m.organizationId, endedAt: null },
      },
      ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.artisanProfile.findMany({
        where,
        ...paging(q),
        select: {
          id: true,
          displayName: true,
          region: true,
          availabilityStatus: true,
          participantStatus: true,
          userId: true,
          createdAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.db.artisanProfile.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async detail(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { profile, member } = await this.access.artisan(
        actor,
        id,
        'association.artisan.read',
        tx,
      );
      const [skills, capacity, authorizations, assignments] = await Promise.all([
        tx.artisanSkill.findMany({
          where: { artisanProfileId: id },
          include: { craftSkill: true },
          take: 30,
        }),
        tx.capacityDeclaration.findMany({
          where: { artisanProfileId: id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        tx.onboardingAuthorization.findMany({
          where: { artisanProfileId: id },
          include: { policy: { select: { version: true, active: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        tx.artisanAssignment.findMany({
          where: { artisanProfileId: id, organizationId: member.organizationId },
          orderBy: { startedAt: 'desc' },
          take: 100,
        }),
      ]);
      return {
        profile: {
          ...profile,
          contactPhone:
            profile.participantStatus === 'ACTIVE' &&
            authorizations.some(
              (a) => a.purpose === 'PARTICIPATION' && !a.withdrawnAt && a.policy.active,
            )
              ? profile.contactPhone
              : null,
        },
        skills,
        capacity: await capacityViews(tx, capacity),
        authorizations,
        assignments,
        independentContactPath: '/participant-support',
        historyLimit: 100,
      };
    });
  }
  async history(
    actor: Actor,
    id: string,
    kind: 'capacity' | 'authorization' | 'assignments',
    q: PageInput,
  ) {
    const { member } = await this.access.artisan(actor, id, 'association.artisan.read');
    const where = { artisanProfileId: id };
    if (kind === 'capacity') {
      return iamTransaction(this.db, actor, async (tx) => {
        await this.access.artisan(actor, id, 'association.artisan.read', tx);
        const items = await tx.capacityDeclaration.findMany({
          where,
          ...paging(q),
          orderBy: { createdAt: 'desc' },
        });
        return {
          items: await capacityViews(tx, items),
          total: await tx.capacityDeclaration.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      });
    }
    if (kind === 'authorization') {
      const [items, total] = await this.db.$transaction([
        this.db.onboardingAuthorization.findMany({
          where,
          ...paging(q),
          include: { policy: { select: { version: true, active: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.db.onboardingAuthorization.count({ where }),
      ]);
      return { items, total, page: q.page, pageSize: q.pageSize };
    }
    const scoped = { ...where, organizationId: member.organizationId };
    const [items, total] = await this.db.$transaction([
      this.db.artisanAssignment.findMany({
        where: scoped,
        ...paging(q),
        orderBy: { startedAt: 'desc' },
      }),
      this.db.artisanAssignment.count({ where: scoped }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async create(actor: Actor, input: RegistryCreate) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.access.coordinator(actor, 'association.artisan.create', tx);
      if (input.authorization.purpose !== 'PARTICIPATION')
        fail(
          400,
          'PARTICIPATION_REQUIRED',
          'Record participation authorization before activating an artisan.',
        );
      const duplicate = await tx.artisanProfile.findFirst({
        where: {
          displayName: { equals: input.displayName, mode: 'insensitive' },
          region: { equals: input.region, mode: 'insensitive' },
          managements: { some: { organizationId: member.organizationId, endedAt: null } },
        },
        select: { id: true },
      });
      if (
        duplicate &&
        !(await tx.auditEvent.findFirst({
          where: {
            id: input.duplicateReviewId ?? 'missing',
            targetId: duplicate.id,
            organizationId: member.organizationId,
            action: 'artisan.duplicate.review',
          },
        }))
      )
        fail(
          409,
          'DUPLICATE_REVIEW_REQUIRED',
          'A similar participant exists in this association. Ask an assigned operator to review before proceeding.',
        );
      if (
        new Set(input.skills).size !== input.skills.length ||
        (await tx.craftSkill.count({ where: { id: { in: input.skills }, isActive: true } })) !==
          input.skills.length
      )
        fail(400, 'INVALID_SKILLS', 'Choose distinct active craft skills.');
      const { authorization, skills, duplicateReviewId, ...fields } = input;
      const profile = await tx.artisanProfile.create({
        data: {
          ...fields,
          createdById: actor.id,
          userId: null,
          participantStatus: 'ACTIVE',
          skills: { create: skills.map((craftSkillId) => ({ craftSkillId })) },
        },
      });
      await this.evidence(tx, actor, profile.id, authorization);
      await tx.artisanManagement.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: member.organizationId,
          recordedById: actor.id,
          reason: 'Documented assisted onboarding',
        },
      });
      await tx.artisanAssignment.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: member.organizationId,
          coordinatorId: actor.id,
          assignedById: actor.id,
          reason: 'Initial responsible coordinator',
        },
      });
      await this.event(
        tx,
        actor,
        'association.artisan.create',
        profile.id,
        member.organizationId,
        duplicateReviewId,
      );
      return { id: profile.id, userId: null, participantStatus: profile.participantStatus };
    });
  }
  async update(actor: Actor, id: string, input: RegistryUpdate) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { member } = await this.access.artisan(actor, id, 'association.artisan.update', tx);
      await this.authorized(tx, id);
      const { reason, ...fields } = input;
      await tx.artisanProfile.update({ where: { id }, data: fields });
      await this.event(tx, actor, 'association.artisan.update', id, member.organizationId, reason);
      return { id };
    });
  }
  async skills(actor: Actor, id: string, skills: string[], reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { member } = await this.access.artisan(actor, id, 'association.artisan.update', tx);
      await this.authorized(tx, id);
      if (
        new Set(skills).size !== skills.length ||
        (await tx.craftSkill.count({ where: { id: { in: skills }, isActive: true } })) !==
          skills.length
      )
        fail(400, 'INVALID_SKILLS', 'Choose distinct active skills.');
      await tx.artisanSkill.deleteMany({ where: { artisanProfileId: id } });
      await tx.artisanSkill.createMany({
        data: skills.map((craftSkillId) => ({ artisanProfileId: id, craftSkillId })),
      });
      await this.event(tx, actor, 'association.artisan.skills', id, member.organizationId, reason);
      return { id };
    });
  }
  async authorization(actor: Actor, id: string, input: AuthorizationEvidence) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { member } = await this.access.artisan(actor, id, 'artisan.consent.record', tx);
      const evidence = await this.evidence(tx, actor, id, input);
      if (input.purpose === 'PARTICIPATION')
        await tx.artisanProfile.update({ where: { id }, data: { participantStatus: 'ACTIVE' } });
      await this.event(tx, actor, 'artisan.consent.record', id, member.organizationId);
      return { id: evidence.id };
    });
  }
  async withdraw(actor: Actor, id: string, evidenceId: string, reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const { member } = await this.access.artisan(actor, id, 'artisan.consent.record', tx);
      const evidence = await tx.onboardingAuthorization.findFirst({
        where: { id: evidenceId, artisanProfileId: id, withdrawnAt: null },
      });
      if (!evidence) fail(404, 'NOT_FOUND', 'Authorization not found.');
      await tx.onboardingAuthorization.update({
        where: { id: evidenceId },
        data: { withdrawnAt: new Date(), withdrawalReason: reason },
      });
      if (evidence.purpose === 'PARTICIPATION')
        await tx.artisanProfile.update({
          where: { id },
          data: { participantStatus: 'PAUSED', availabilityStatus: 'PAUSED' },
        });
      await this.event(tx, actor, 'artisan.consent.withdraw', id, member.organizationId, reason);
      return { id: evidenceId };
    });
  }
  async capacity(actor: Actor, id: string, input: AssistedCapacity, key?: string) {
    validateIdempotencyKey(key);
    return iamTransaction(this.db, actor, async (tx) => {
      const { member, profile } = await this.access.artisan(
        actor,
        id,
        'association.capacity.record',
        tx,
      );
      if (profile.participantStatus !== 'ACTIVE')
        fail(403, 'PARTICIPANT_PAUSED', 'Participation authorization must be active.');
      await this.authorized(tx, id);
      await this.authorized(tx, id, input.authorizationId);
      if (
        !(await tx.artisanSkill.findFirst({
          where: {
            artisanProfileId: id,
            craftSkillId: input.craftSkillId,
            craftSkill: { isActive: true },
          },
        }))
      )
        fail(400, 'INVALID_SKILL', 'Capacity requires a current craft skill.');
      return writeCapacity(
        tx,
        actor,
        {
          ...input,
          artisanProfileId: id,
          organizationId: member.organizationId,
        },
        key,
      );
    });
  }
  async assign(actor: Actor, id: string, coordinatorId: string, reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const management = await tx.artisanManagement.findFirst({
        where: { artisanProfileId: id, endedAt: null },
      });
      if (!management) fail(404, 'NOT_FOUND', 'Managing affiliation not found.');
      await this.coordinatorTarget(tx, coordinatorId, management.organizationId);
      const current = await tx.artisanAssignment.findFirst({
        where: { artisanProfileId: id, endedAt: null },
      });
      if (current?.coordinatorId === coordinatorId)
        fail(409, 'ALREADY_ASSIGNED', 'This coordinator is already responsible.');
      await tx.artisanAssignment.updateMany({
        where: { artisanProfileId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      const record = await tx.artisanAssignment.create({
        data: {
          artisanProfileId: id,
          organizationId: management.organizationId,
          coordinatorId,
          assignedById: actor.id,
          reason,
        },
      });
      await this.event(
        tx,
        actor,
        'artisan.coordinator.reassign',
        id,
        management.organizationId,
        reason,
      );
      return { id: record.id };
    });
  }
  async transferArtisan(
    actor: Actor,
    id: string,
    input: {
      organizationId: string;
      coordinatorId: string;
      authorization: AuthorizationEvidence;
      reason: string;
    },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      await this.coordinatorTarget(tx, input.coordinatorId, input.organizationId);
      const old = await tx.artisanManagement.findFirst({
        where: { artisanProfileId: id, endedAt: null },
      });
      if (!old) fail(404, 'NOT_FOUND', 'Participant management not found.');
      if (old.organizationId === input.organizationId)
        fail(409, 'USE_REASSIGNMENT', 'Use coordinator reassignment within the same association.');
      if (input.authorization.purpose !== 'PARTICIPATION')
        fail(400, 'PARTICIPATION_REQUIRED', 'Record worker authorization for the transfer.');
      await tx.artisanManagement.updateMany({
        where: { artisanProfileId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.artisanAssignment.updateMany({
        where: { artisanProfileId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.onboardingAuthorization.updateMany({
        where: { artisanProfileId: id, withdrawnAt: null },
        data: {
          withdrawnAt: new Date(),
          withdrawalReason: 'Managing association transfer; replacement authorization recorded',
        },
      });
      await this.evidence(tx, actor, id, input.authorization);
      await tx.artisanManagement.create({
        data: {
          artisanProfileId: id,
          organizationId: input.organizationId,
          recordedById: actor.id,
          reason: input.reason,
        },
      });
      await tx.artisanAssignment.create({
        data: {
          artisanProfileId: id,
          organizationId: input.organizationId,
          coordinatorId: input.coordinatorId,
          assignedById: actor.id,
          reason: input.reason,
        },
      });
      const legacy = await tx.associationMembership.findMany({
        where: { artisanProfileId: id, status: 'ACTIVE' },
      });
      await tx.associationMembership.updateMany({
        where: { id: { in: legacy.map((r) => r.id) } },
        data: { status: 'REVOKED', endedAt: new Date() },
      });
      await tx.consentRecord.updateMany({
        where: { id: { in: legacy.map((r) => r.consentRecordId) }, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      await tx.delegationGrant.updateMany({
        where: { artisanProfileId: id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await this.event(
        tx,
        actor,
        'artisan.affiliation.transfer',
        id,
        input.organizationId,
        input.reason,
      );
      return { id };
    });
  }
  async linkAccount(
    actor: Actor,
    id: string,
    input: { userId: string; verificationReference: string; reason: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const profile = await tx.artisanProfile.findUnique({ where: { id } });
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!profile || !user?.emailVerified || user.status !== 'ACTIVE')
        fail(
          409,
          'VERIFIED_IDENTITY_REQUIRED',
          'Review an active verified account and existing artisan.',
        );
      if (profile.userId || (await tx.artisanProfile.findUnique({ where: { userId: user.id } })))
        fail(409, 'ACCOUNT_ALREADY_LINKED', 'Account or participant already linked.');
      await tx.artisanProfile.update({ where: { id }, data: { userId: user.id } });
      await this.event(
        tx,
        actor,
        'artisan.account.link',
        id,
        undefined,
        `${input.reason}; verification: ${input.verificationReference}`,
      );
      return { id, userId: user.id };
    });
  }
  async coordinatorStatus(
    actor: Actor,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
    reason: string,
    organizationId?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const candidates = await tx.organizationMember.findMany({
        where: {
          userId,
          ...(organizationId ? { organizationId } : {}),
          isCoordinator: true,
          status: { in: status === 'ACTIVE' ? ['SUSPENDED'] : ['ACTIVE', 'SUSPENDED'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 2,
        include: { organization: true, user: true },
      });
      if (candidates.length > 1)
        fail(
          409,
          'AFFILIATION_SCOPE_REQUIRED',
          'Choose the exact organization affiliation to change.',
        );
      const m = candidates[0];
      if (!m) fail(404, 'NOT_FOUND', 'Coordinator affiliation not found.');
      if (
        status === 'ACTIVE' &&
        (m.organization.approvalStatus !== 'APPROVED' ||
          m.user.status !== 'ACTIVE' ||
          !m.user.emailVerified)
      )
        fail(
          409,
          'AFFILIATION_UNAVAILABLE',
          'An approved association and active verified account are required.',
        );
      if (status === 'ACTIVE')
        await this.policy.assertSingleCoordinator(userId, m.organizationId, tx);
      await tx.organizationMember.update({
        where: { id: m.id },
        data: {
          status,
          suspendedAt: status === 'SUSPENDED' ? new Date() : null,
          revokedAt: status === 'REVOKED' ? new Date() : null,
        },
      });
      await this.event(
        tx,
        actor,
        `coordinator.affiliation.${status.toLowerCase()}`,
        m.id,
        m.organizationId,
        reason,
      );
      return { id: m.id, status };
    });
  }
  async transferCoordinator(actor: Actor, userId: string, organizationId: string, reason: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const org = await tx.organization.findUnique({ where: { id: organizationId } });
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !org ||
        !partnerTypes.includes(org.type) ||
        org.approvalStatus !== 'APPROVED' ||
        !user?.emailVerified ||
        user.status !== 'ACTIVE'
      )
        fail(
          409,
          'AFFILIATION_UNAVAILABLE',
          'An approved association and active verified coordinator are required.',
        );
      const old = await tx.organizationMember.findMany({
        where: { userId, isCoordinator: true, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      });
      if (old.some((m) => m.organizationId === organizationId))
        fail(409, 'ALREADY_AFFILIATED', 'This affiliation already exists.');
      await tx.organizationMember.updateMany({
        where: { id: { in: old.map((m) => m.id) } },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        create: {
          organizationId,
          userId,
          roles: { create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: actor.id } },
        },
        update: { status: 'ACTIVE', revokedAt: null, suspendedAt: null },
      });
      await tx.membershipRole.upsert({
        where: { membershipId_role: { membershipId: member.id, role: 'ASSOCIATION_COORDINATOR' } },
        create: {
          membershipId: member.id,
          role: 'ASSOCIATION_COORDINATOR',
          assignedByUserId: actor.id,
        },
        update: {},
      });
      const assignments = await tx.artisanAssignment.updateMany({
        where: {
          coordinatorId: userId,
          organizationId: { in: old.map((m) => m.organizationId) },
          endedAt: null,
        },
        data: { endedAt: new Date() },
      });
      await this.event(
        tx,
        actor,
        'coordinator.affiliation.transfer',
        member.id,
        organizationId,
        reason,
      );
      return { id: member.id, requiresReassignment: assignments.count };
    });
  }
  async governance(actor: Actor, q: PageInput, operators = false) {
    await this.policy.requireAdmin(actor);
    const where = {
      ...(operators
        ? {
            organization: { type: 'INTERNAL' as const },
            roles: { some: { role: 'NASJ_OPERATOR' as const } },
          }
        : { isCoordinator: true }),
      ...(q.q ? { user: { name: { contains: q.q, mode: 'insensitive' as const } } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.organizationMember.findMany({
        where,
        ...paging(q),
        include: {
          organization: { select: { id: true, name: true, approvalStatus: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.organizationMember.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async diagnostics(actor: Actor, q: PageInput) {
    await this.policy.requireAdmin(actor);
    const [items, total] = await this.db.$transaction([
      this.db.organizationMember.findMany({
        ...paging(q),
        include: {
          organization: true,
          roles: true,
          permissionGrants: true,
          user: { select: { id: true, name: true, status: true, emailVerified: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.db.organizationMember.count(),
    ]);
    return {
      items: items.map((m) => ({
        id: m.id,
        user: m.user,
        organization: {
          id: m.organizationId,
          name: m.organization.name,
          type: m.organization.type,
          status: m.organization.approvalStatus,
        },
        status: m.status,
        roles: m.roles.map((r) => r.role),
        permissions:
          m.user.status === 'ACTIVE' && m.user.emailVerified ? permissionsForMembership(m) : [],
        grants: m.permissionGrants.map((g) => ({
          permission: g.permission,
          grantedById: g.grantedById,
          reason: g.reason,
        })),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      realPayoutsEnabled: false,
    };
  }
  async explicitGrant(
    actor: Actor,
    orgId: string,
    memberId: string,
    input: { permission: string; enabled: boolean; reason: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org || !grantAllowed(org.type, input.permission))
        fail(403, 'INVALID_PERMISSION_SCOPE', 'This grant is not valid in this organization.');
      if (org.type === 'INTERNAL') await this.policy.requireAdmin(actor, tx);
      else await this.policy.requireOrganization(actor, orgId, 'organization.roles.assign', tx);
      const member = await tx.organizationMember.findFirst({
        where: {
          id: memberId,
          organizationId: orgId,
          ...(input.enabled
            ? { status: 'ACTIVE', user: { status: 'ACTIVE', emailVerified: true } }
            : {}),
        },
        include: { roles: true },
      });
      if (
        !member ||
        (input.enabled &&
          !member.roles.some((r) =>
            org.type === 'INTERNAL'
              ? ['NASJ_OPERATOR', 'FINANCE_MANAGER', 'INVENTORY_LOGISTICS_COORDINATOR'].includes(
                  r.role,
                )
              : ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role),
          ))
      )
        fail(
          409,
          'PERSONA_REQUIRED',
          'An active representative or internal operator membership is required.',
        );
      if (
        input.enabled &&
        input.permission.startsWith('operator.payout.') &&
        member.userId === actor.id
      )
        fail(
          403,
          'SELF_GRANT_DENIED',
          'Another administrator must review sensitive financial authority.',
        );
      if (input.enabled && input.permission.startsWith('operator.payout.')) {
        const other =
          input.permission === 'operator.payout.initiate'
            ? 'operator.payout.approve'
            : 'operator.payout.initiate';
        if (
          await tx.membershipPermission.findFirst({
            where: { permission: other, enabled: true, membership: { userId: member.userId } },
          })
        )
          fail(
            409,
            'INDEPENDENT_APPROVER_REQUIRED',
            'Payout initiation and independent approval must belong to different people.',
          );
      }
      const previousGrant = await tx.membershipPermission.findUnique({
        where: {
          membershipId_permission: { membershipId: memberId, permission: input.permission },
        },
      });
      await tx.membershipPermission.upsert({
        where: {
          membershipId_permission: { membershipId: memberId, permission: input.permission },
        },
        create: {
          membershipId: memberId,
          permission: input.permission,
          enabled: input.enabled,
          grantedById: actor.id,
          reason: input.reason,
        },
        update: { enabled: input.enabled, grantedById: actor.id, reason: input.reason },
      });

      await this.event(
        tx,
        actor,
        `membership.permission.${input.enabled ? 'grant' : 'revoke'}`,
        memberId,
        orgId,
        input.reason,
        { permission: input.permission, enabled: input.enabled },
        { permission: input.permission, enabled: previousGrant?.enabled ?? null },
      );
      return {
        memberId,
        permission: input.permission,
        enabled: input.enabled,
        realPayoutsEnabled: false,
      };
    });
  }
  async operatorAssignment(
    actor: Actor,
    input: { operatorId: string; organizationId: string; enabled: boolean; reason: string },
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      await this.access.operator({ ...actor, id: input.operatorId }, 'operator.accounts.read', tx);
      const org = await tx.organization.findUnique({ where: { id: input.organizationId } });
      if (!org || org.type === 'INTERNAL' || org.approvalStatus !== 'APPROVED')
        fail(409, 'ORGANIZATION_UNAVAILABLE', 'Select an approved buyer or partner organization.');
      await tx.operatorAssignment.upsert({
        where: {
          operatorId_organizationId: {
            operatorId: input.operatorId,
            organizationId: input.organizationId,
          },
        },
        create: {
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          assignedById: actor.id,
          revokedAt: input.enabled ? null : new Date(),
        },
        update: { revokedAt: input.enabled ? null : new Date(), assignedById: actor.id },
      });
      await this.event(
        tx,
        actor,
        'operator.account.assignment',
        input.operatorId,
        input.organizationId,
        input.reason,
      );
      return { enabled: input.enabled };
    });
  }
  async operatorActivity(actor: Actor, q: PageInput) {
    await this.access.operator(actor, 'audit.read.scoped');
    const where = {
      organization: {
        approvalStatus: 'APPROVED' as const,
        assignedOperators: { some: { operatorId: actor.id, revokedAt: null } },
      },
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        ...paging(q),
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          organizationId: true,
          timestamp: true,
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async operatorDashboard(actor: Actor, q: PageInput) {
    await this.access.operator(actor, 'operator.accounts.read');
    const where = { operatorId: actor.id, revokedAt: null };
    const assignments = await this.db.operatorAssignment.findMany({
      where,
      ...paging(q),
      orderBy: { id: 'asc' },
    });
    const organizations = await this.db.organization.findMany({
      where: { id: { in: assignments.map((a) => a.organizationId) }, approvalStatus: 'APPROVED' },
      select: { id: true, name: true, type: true, region: true, approvalStatus: true },
    });
    const partners = organizations.filter((o) => partnerTypes.includes(o.type));
    const counts = await Promise.all(
      partners.map(async (o) => ({
        organizationId: o.id,
        participants: await this.db.artisanManagement.count({
          where: { organizationId: o.id, endedAt: null },
        }),
      })),
    );
    return {
      organizations,
      network: counts,
      total: await this.db.operatorAssignment.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
      realPayoutsEnabled: false,
      upcoming: [
        'Commercial pricing',
        'Assisted offer decisions',
        'Production planning',
        'Payment reconciliation',
      ],
    };
  }
  async recordDuplicateReview(
    actor: Actor,
    organizationId: string,
    artisanId: string,
    reason: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.access.operator(actor, 'operator.accounts.read', tx, organizationId);
      if (
        !(await tx.artisanManagement.findFirst({
          where: { artisanProfileId: artisanId, organizationId, endedAt: null },
        }))
      )
        fail(404, 'NOT_FOUND', 'Assigned organization participant not found.');
      await this.event(tx, actor, 'artisan.duplicate.review', artisanId, organizationId, reason);
      const record = await tx.auditEvent.findFirstOrThrow({
        where: { actorId: actor.id, action: 'artisan.duplicate.review', targetId: artisanId },
        orderBy: { timestamp: 'desc' },
      });
      return { reviewId: record.id };
    });
  }
  async duplicateReview(actor: Actor, organizationId: string, q: PageInput) {
    await this.access.operator(actor, 'operator.accounts.read', this.db, organizationId);
    const where = {
      managements: { some: { organizationId, endedAt: null } },
      ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const items = await this.db.artisanProfile.findMany({
      where,
      ...paging(q),
      select: { id: true, displayName: true, region: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    return {
      items,
      total: await this.db.artisanProfile.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
