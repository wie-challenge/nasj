import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { hasPrivilegedAccess } from '../foundation/mfa.js';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrivacyRequest, SupportCase } from '@prisma/client';
import { notificationCategorySchema, permissionsForMembership } from '@nasj/contracts';
import type {
  PageInput,
  SettingsInput,
  NotificationPreferencesInput,
  PrivacyCreateInput,
  PrivacyReviewInput,
  SupportCreateInput,
  SupportUpdateInput,
  ConsentCreateInput,
} from '@nasj/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PolicyService } from '../foundation/policy.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
import { audit } from '../foundation/audit.js';
import { MailService } from '../mail/mail.service.js';
const pageArgs = (p: PageInput) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });
const privacyView = (r: PrivacyRequest) => ({
  id: r.id,
  userId: r.userId,
  type: r.type,
  status: r.status,
  details: r.details,
  submittedAt: r.submittedAt.toISOString(),
  assignedReviewerId: r.assignedReviewerId,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  resolutionNotes: r.resolutionNotes,
  retentionExceptions: r.retentionExceptions,
});
const caseView = (r: SupportCase, canManage = false) => ({
  id: r.id,
  userId: r.userId,
  organizationId: r.organizationId,
  subject: r.subject,
  description: r.description,
  status: r.status,
  assignedToUserId: r.assignedToUserId,
  resolution: r.resolution,
  dueAt: r.dueAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  canManage,
});
@Injectable()
export class GovernanceService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async security(actor: Actor) {
    const user = await this.policy.requireActive(actor);
    return {
      sessionVerified: Boolean(
        (
          await this.db.session.findUnique({
            where: { id: actor.sessionId },
            select: { mfaVerifiedAt: true },
          })
        )?.mfaVerifiedAt,
      ),
      twoFactorEnabled: user.twoFactorEnabled,
      privilegedMfaRequired: this.config.REQUIRE_PRIVILEGED_MFA,
      hasPrivilegedAccess: await hasPrivilegedAccess(this.db, actor.id),
    };
  }
  async settings(actor: Actor) {
    const u = await this.policy.requireActive(actor);
    return { preferredLanguage: u.preferredLanguage };
  }
  updateSettings(actor: Actor, input: SettingsInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { preferredLanguage: input.preferredLanguage },
      });
      await audit(tx, actor, {
        action: 'ACCOUNT_PREFERENCES_UPDATED',
        targetType: 'User',
        targetId: actor.id,
        after: { preferredLanguage: input.preferredLanguage },
      });
      return input;
    });
  }
  async preferences(actor: Actor) {
    const rows = await this.db.notificationPreference.findMany({ where: { userId: actor.id } });
    return {
      items: notificationCategorySchema.options.map((category) => {
        const row = rows.find((r) => r.category === category);
        return {
          category,
          language: row?.language ?? 'en',
          channel: 'EMAIL' as const,
          optedIn: row?.optedIn ?? false,
        };
      }),
    };
  }
  updatePreferences(actor: Actor, input: NotificationPreferencesInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      for (const item of input.items)
        await tx.notificationPreference.upsert({
          where: {
            userId_channel_category: {
              userId: actor.id,
              channel: item.channel,
              category: item.category,
            },
          },
          create: { userId: actor.id, ...item },
          update: item,
        });
      await audit(tx, actor, {
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        targetType: 'User',
        targetId: actor.id,
        after: { categories: input.items.map((i) => i.category) },
      });
      return input;
    });
  }
  async consents(actor: Actor) {
    const rows = await this.db.consentRecord.findMany({
      where: { userId: actor.id },
      orderBy: { collectedAt: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        purpose: r.purpose,
        policyVersion: r.policyVersion,
        decision: r.decision,
        collectedAt: r.collectedAt.toISOString(),
        withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
        collectionContext: r.collectionContext,
      })),
    };
  }
  createConsent(actor: Actor, input: ConsentCreateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.consentRecord.create({
        data: { userId: actor.id, ...input, collectionContext: 'account-settings' },
      });
      await audit(tx, actor, {
        action: 'CONSENT_RECORDED',
        targetType: 'ConsentRecord',
        targetId: row.id,
        after: {
          purpose: input.purpose,
          policyVersion: input.policyVersion,
          decision: input.decision,
        },
      });
      return { id: row.id };
    });
  }
  withdrawConsent(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.consentRecord.findFirst({ where: { id, userId: actor.id } });
      if (!row) fail(404, 'NOT_FOUND', 'Consent record not found.');
      if (!row.withdrawnAt) {
        await tx.consentRecord.update({ where: { id }, data: { withdrawnAt: new Date() } });
        if (row.purpose.startsWith('delegation:'))
          await tx.delegationGrant.updateMany({
            where: {
              id: row.purpose.slice('delegation:'.length),
              artisanProfile: { userId: actor.id },
            },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        if (row.purpose === 'artisan.profile') {
          await tx.artisanProfile.updateMany({
            where: { userId: actor.id },
            data: { availabilityStatus: 'PAUSED' },
          });
          await tx.delegationGrant.updateMany({
            where: { artisanProfile: { userId: actor.id }, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        }
        const associations = await tx.associationMembership.findMany({
          where: { consentRecordId: id, status: 'ACTIVE' },
        });
        for (const association of associations) {
          await tx.associationMembership.update({
            where: { id: association.id },
            data: { status: 'REVOKED', endedAt: new Date() },
          });
          await tx.delegationGrant.updateMany({
            where: {
              artisanProfileId: association.artisanProfileId,
              organizationId: association.organizationId,
              status: 'ACTIVE',
            },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        }
        await audit(tx, actor, {
          action: 'CONSENT_WITHDRAWN',
          targetType: 'ConsentRecord',
          targetId: id,
          after: { purpose: row.purpose },
        });
      }
      return { ok: true };
    });
  }
  createPrivacy(actor: Actor, input: PrivacyCreateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.privacyRequest.create({ data: { userId: actor.id, ...input } });
      await audit(tx, actor, {
        action: 'PRIVACY_REQUEST_CREATED',
        targetType: 'PrivacyRequest',
        targetId: row.id,
        after: { type: row.type },
      });
      return privacyView(row);
    });
  }
  async listPrivacy(actor: Actor, p: PageInput, admin = false) {
    if (admin) await this.policy.requireAdmin(actor);
    const where: Prisma.PrivacyRequestWhereInput = admin ? {} : { userId: actor.id };
    const [rows, total] = await this.db.$transaction([
      this.db.privacyRequest.findMany({
        where,
        ...pageArgs(p),
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.privacyRequest.count({ where }),
    ]);
    return { items: rows.map(privacyView), total, page: p.page, pageSize: p.pageSize };
  }
  reviewPrivacy(actor: Actor, id: string, input: PrivacyReviewInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.policy.requireAdmin(actor, tx);
      const old = await tx.privacyRequest.findUnique({ where: { id } });
      if (!old) fail(404, 'NOT_FOUND', 'Privacy request not found.');
      if (['RESOLVED', 'REJECTED'].includes(old.status))
        fail(409, 'REQUEST_CLOSED', 'This request has already been resolved.');
      if (input.status === 'RESOLVED' && old.type === 'DELETION' && !input.retentionExceptions)
        fail(
          400,
          'RETENTION_REVIEW_REQUIRED',
          'Record the retention review and any remaining deletion actions.',
        );
      const row = await tx.privacyRequest.update({
        where: { id },
        data: {
          ...input,
          assignedReviewerId: actor.id,
          resolvedAt: input.status === 'IN_REVIEW' ? null : new Date(),
        },
      });
      await audit(tx, actor, {
        action: 'PRIVACY_REQUEST_REVIEWED',
        targetType: 'PrivacyRequest',
        targetId: id,
        before: { status: old.status },
        after: { status: row.status, type: row.type },
      });
      return privacyView(row);
    });
  }
  exportOwn(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          role: true,
          status: true,
          preferredLanguage: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const profile = await tx.artisanProfile.findUnique({
        where: { userId: actor.id },
        include: {
          skills: { include: { craftSkill: { select: { id: true, name: true, category: true } } } },
          capacityDeclarations: true,
          associations: true,
          delegations: true,
        },
      });
      const [
        memberships,
        consents,
        privacyRequests,
        notificationPreferences,
        cases,
        feedback,
        feedbackRevisions,
      ] = await Promise.all([
        tx.organizationMember.findMany({
          where: { userId: actor.id },
          select: {
            id: true,
            organizationId: true,
            status: true,
            isManager: true,
            joinedAt: true,
            roles: { select: { role: true } },
          },
        }),
        tx.consentRecord.findMany({
          where: { userId: actor.id },
          select: {
            id: true,
            purpose: true,
            policyVersion: true,
            decision: true,
            collectedAt: true,
            withdrawnAt: true,
            collectionContext: true,
          },
        }),
        tx.privacyRequest.findMany({ where: { userId: actor.id } }),
        tx.notificationPreference.findMany({
          where: { userId: actor.id },
          select: { category: true, channel: true, language: true, optedIn: true },
        }),
        tx.supportCase.findMany({ where: { userId: actor.id } }),
        tx.buyerOrderFeedback.findMany({
          where: { reporterId: actor.id },
          include: {
            revisions: { orderBy: { version: 'asc' } },
            order: { select: { id: true, rfqId: true } },
          },
        }),
        tx.buyerOrderFeedbackRevision.findMany({
          where: { actorId: actor.id, feedback: { reporterId: { not: actor.id } } },
          select: {
            id: true,
            feedbackId: true,
            version: true,
            kind: true,
            createdAt: true,
            category: true,
            followUpStatus: true,
            reason: true,
          },
        }),
      ]);
      await audit(tx, actor, {
        action: 'PERSONAL_DATA_EXPORTED',
        targetType: 'User',
        targetId: actor.id,
      });
      return {
        exportedAt: new Date().toISOString(),
        user,
        artisanProfile: profile
          ? {
              id: profile.id,
              displayName: profile.displayName,
              region: profile.region,
              preferredLanguage: profile.preferredLanguage,
              contactPhone: profile.contactPhone,
              contactVisibility: profile.contactVisibility,
              equipment: profile.equipment,
              availabilityStatus: profile.availabilityStatus,
              experienceDescription: profile.experienceDescription,
              skills: profile.skills.map((s) => ({
                craftSkill: s.craftSkill,
                proficiency: s.proficiency,
                evidence: s.evidence,
              })),
              capacityDeclarations: profile.capacityDeclarations.map((c) => ({
                id: c.id,
                craftSkillId: c.craftSkillId,
                unitType: c.unitType,
                quantity: c.quantity.toString(),
                supersededAt: c.supersededAt,
                effectiveFrom: c.effectiveFrom,
                effectiveTo: c.effectiveTo,
                createdAt: c.createdAt,
              })),
              associations: profile.associations.map((a) => ({
                id: a.id,
                organizationId: a.organizationId,
                status: a.status,
                startedAt: a.startedAt,
                endedAt: a.endedAt,
              })),
              delegations: profile.delegations.map((d) => ({
                id: d.id,
                delegateUserId: d.delegateUserId,
                organizationId: d.organizationId,
                scopes: d.scopes,
                status: d.status,
                expiresAt: d.expiresAt,
                revokedAt: d.revokedAt,
              })),
            }
          : null,
        memberships,
        consents,
        privacyRequests: privacyRequests.map(privacyView),
        notificationPreferences,
        supportCases: cases.map((c) => caseView(c)),
        orderFeedback: feedback.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          receiptConfirmationId: row.receiptConfirmationId,
          sourceClass: row.sourceClass,
          createdAt: row.createdAt,
          currentVersion: row.currentVersion,
          revisions: row.revisions.map((revision) => ({
            id: revision.id,
            version: revision.version,
            kind: revision.kind,
            createdAt: revision.createdAt,
            category: revision.category,
            rating: revision.rating,
            comment: revision.comment,
            followUpStatus: revision.followUpStatus,
            // Internal support notes stay out of the subject export.
            followUpNote: null,
            linkedTicketId: revision.linkedTicketId,
            reason: revision.reason,
          })),
        })),
        // Revisions this subject authored on someone else's assessment, without their private content.
        feedbackActions: feedbackRevisions,
      };
    });
  }
  async auditEvents(actor: Actor, p: PageInput, organizationId?: string) {
    if (organizationId) await this.policy.requireOrganization(actor, organizationId, 'audit.read');
    else await this.policy.requireAdmin(actor);
    const where: Prisma.AuditEventWhereInput = organizationId ? { organizationId } : {};
    const [rows, total] = await this.db.$transaction([
      this.db.auditEvent.findMany({
        where,
        ...pageArgs(p),
        orderBy: [{ timestamp: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          actorId: true,
          targetType: true,
          targetId: true,
          organizationId: true,
          action: true,
          timestamp: true,
          correlationId: true,
          reason: true,
          before: true,
          after: true,
        },
      }),
      this.db.auditEvent.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ ...r, timestamp: r.timestamp.toISOString() })),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }
  async platformCases(actor: Actor, p: PageInput) {
    await this.policy.requireAdmin(actor);
    const where = { organizationId: null };
    const [rows, total] = await this.db.$transaction([
      this.db.supportCase.findMany({
        where,
        ...pageArgs(p),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.supportCase.count({ where }),
    ]);
    return { items: rows.map((r) => caseView(r, true)), total, page: p.page, pageSize: p.pageSize };
  }
  async cases(actor: Actor, p: PageInput, organizationId?: string) {
    if (organizationId)
      await this.policy.requireOrganization(actor, organizationId, 'support.case.read');
    const where: Prisma.SupportCaseWhereInput = organizationId
      ? { organizationId }
      : { userId: actor.id };
    const [rows, total] = await this.db.$transaction([
      this.db.supportCase.findMany({
        where,
        ...pageArgs(p),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.supportCase.count({ where }),
    ]);
    return {
      items: rows.map((r) =>
        caseView(r, Boolean(organizationId) || (!r.organizationId && actor.role === 'ADMIN')),
      ),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }
  createCase(actor: Actor, input: SupportCreateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      if (input.organizationId)
        await this.policy.requireOrganization(actor, input.organizationId, 'organization.read', tx);
      const row = await tx.supportCase.create({ data: { ...input, userId: actor.id } });
      await audit(tx, actor, {
        action: 'SUPPORT_CASE_CREATED',
        targetType: 'SupportCase',
        targetId: row.id,
        organizationId: row.organizationId ?? undefined,
      });
      return caseView(row);
    });
  }
  async requireCaseManager(actor: Actor, row: SupportCase, tx: Db) {
    if (row.organizationId)
      await this.policy.requireOrganization(actor, row.organizationId, 'support.case.manage', tx);
    else await this.policy.requireAdmin(actor, tx);
  }
  updateCase(actor: Actor, id: string, input: SupportUpdateInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.supportCase.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Support case not found.');
      await this.requireCaseManager(actor, row, tx);
      if (input.assignedToUserId) {
        const target = await tx.user.findUnique({ where: { id: input.assignedToUserId } });
        if (!target?.emailVerified || target.status !== 'ACTIVE')
          fail(400, 'INVALID_ASSIGNEE', 'Choose an active authorized support user.');
        if (row.organizationId) {
          const membership = await tx.organizationMember.findUnique({
            where: {
              organizationId_userId: {
                organizationId: row.organizationId,
                userId: input.assignedToUserId,
              },
            },
            include: { organization: true, roles: true },
          });
          if (!membership || !permissionsForMembership(membership).includes('support.case.manage'))
            fail(
              400,
              'INVALID_ASSIGNEE',
              'Choose an authorized support member of this organization.',
            );
        } else if (target.role !== 'ADMIN')
          fail(400, 'INVALID_ASSIGNEE', 'Choose an authorized reviewer.');
      }
      const updated = await tx.supportCase.update({
        where: { id },
        data: { ...input, dueAt: input.dueAt ? new Date(input.dueAt) : input.dueAt },
      });
      await audit(tx, actor, {
        action: 'SUPPORT_CASE_UPDATED',
        targetType: 'SupportCase',
        targetId: id,
        organizationId: row.organizationId ?? undefined,
        before: { status: row.status },
        after: { status: updated.status, assignedToUserId: updated.assignedToUserId },
      });
      return caseView(updated, true);
    });
  }
  async notifyCase(actor: Actor, id: string) {
    const delivery = await iamTransaction(this.db, actor, async (tx) => {
      const row = await tx.supportCase.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Support case not found.');
      await this.requireCaseManager(actor, row, tx);
      const pref = await tx.notificationPreference.findUnique({
        where: {
          userId_channel_category: {
            userId: row.userId,
            channel: 'EMAIL',
            category: 'SUPPORT_UPDATES',
          },
        },
      });
      if (!pref?.optedIn)
        fail(409, 'NOT_OPTED_IN', 'This user has not opted in to support email updates.');
      const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
      await audit(tx, actor, {
        action: 'SUPPORT_NOTIFICATION_REQUESTED',
        targetType: 'SupportCase',
        targetId: id,
        organizationId: row.organizationId ?? undefined,
      });
      return { email: user.email, language: pref.language };
    });
    const templates: Record<string, { subject: string; text: string }> = {
      en: {
        subject: 'NASJ support update',
        text: 'Your support case has been updated. Sign in to NASJ to review it.',
      },
      fr: {
        subject: 'Mise à jour du support NASJ',
        text: 'Votre demande a été mise à jour. Connectez-vous à NASJ pour la consulter.',
      },
      ar: {
        subject: 'تحديث دعم حرفاكير',
        text: 'تم تحديث طلب الدعم الخاص بك. سجل الدخول إلى حرفاكير للاطلاع عليه.',
      },
    };
    const template = templates[delivery.language] ?? templates.en;
    const accepted = await this.mail.sendConfirmed(delivery.email, template.subject, template.text);
    await iamTransaction(this.db, actor, (tx) =>
      audit(tx, actor, {
        action: accepted ? 'SUPPORT_NOTIFICATION_SMTP_ACCEPTED' : 'SUPPORT_NOTIFICATION_FAILED',
        targetType: 'SupportCase',
        targetId: id,
      }),
    );
    return { status: accepted ? 'ACCEPTED_BY_SMTP' : 'FAILED', delivered: false };
  }
}
