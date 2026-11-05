import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { PolicyService } from '../foundation/policy.service.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';

/**
 * E15-06 team moderation. Every route here is ADMIN-only, evaluated against a real audited account.
 * A synthetic showroom persona — including the SUPPORT persona that can legitimately open
 * /collaboration — is never an administrator and therefore never reaches this service.
 */
@Injectable()
export class DemoFeedbackAdminService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}

  private view(row: {
    id: string;
    scenarioId: string;
    generation: number;
    screenKey: string;
    category: string;
    comment: string;
    status: string;
    sourceClass: string;
    createdAt: Date;
    events: {
      id: string;
      kind: string;
      fromStatus: string | null;
      toStatus: string | null;
      note: string;
      createdAt: Date;
      actor: { name: string } | null;
    }[];
  }): C.DemoFeedbackAdminView {
    const provenance = C.demoFeedbackLabel(row.sourceClass as C.DemoFeedbackSourceClass);
    return {
      id: row.id,
      scenarioId: row.scenarioId,
      generation: row.generation,
      screenKey: row.screenKey as C.DemoScreenKey,
      category: row.category as C.DemoFeedbackCategory,
      comment: row.comment,
      status: row.status as C.DemoFeedbackStatus,
      sourceClass: row.sourceClass as C.DemoFeedbackSourceClass,
      sourceLabel: provenance.label,
      createdAt: row.createdAt.toISOString(),
      events: row.events.map((event) => ({
        id: event.id,
        kind: event.kind as C.DemoFeedbackKind,
        // An anonymous visitor submission has no reviewer and is labelled as such, not blank.
        actorName: event.actor?.name ?? 'Visitor (anonymous)',
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private async authorized(actor: Actor, tx: Db) {
    await this.policy.requireAdmin(actor, tx);
  }

  async list(actor: Actor, query: C.DemoFeedbackQuery) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.authorized(actor, tx);
      const where: Prisma.DemoFeedbackWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.scenarioId ? { scenarioId: query.scenarioId } : {}),
      };
      const [rows, total, grouped] = await Promise.all([
        tx.demoFeedback.findMany({
          where,
          include: {
            events: {
              orderBy: { createdAt: 'asc' },
              include: { actor: { select: { name: true } } },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.demoFeedback.count({ where }),
        tx.demoFeedback.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      return {
        items: rows.map((row) => this.view(row)),
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: C.demoFeedbackStatuses.map((status) => ({
          status,
          count: grouped.find((row) => row.status === status)?._count._all ?? 0,
        })),
        limitations: C.demoFeedbackLimitations,
      } satisfies C.DemoFeedbackAdminList;
    });
  }

  async detail(actor: Actor, id: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.authorized(actor, tx);
      const row = await tx.demoFeedback.findUnique({
        where: { id },
        include: {
          events: {
            orderBy: { createdAt: 'asc' },
            include: { actor: { select: { name: true } } },
          },
        },
      });
      if (!row) fail(404, 'NOT_FOUND', 'Feedback not found.');
      return this.view(row);
    });
  }

  async decide(actor: Actor, id: string, input: C.DemoFeedbackDecisionInput) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.authorized(actor, tx);
      const row = await tx.demoFeedback.findUnique({ where: { id } });
      if (!row) fail(404, 'NOT_FOUND', 'Feedback not found.');
      if (row.status !== input.expectedStatus)
        fail(409, 'STALE_STATUS', 'This feedback changed. Reload before deciding again.');
      // Report the most specific problem: a missing closure reason is a payload error, not a conflict.
      if (C.demoFeedbackRequiresNote(input.status) && input.note.length < 3)
        fail(400, 'NOTE_REQUIRED', 'State the reason for closing this feedback out.');
      if (!C.canTransitionDemoFeedback(row.status as C.DemoFeedbackStatus, input.status))
        fail(409, 'INVALID_TRANSITION', 'That moderation transition is not allowed.');
      const updated = await tx.demoFeedback.update({
        where: { id },
        data: { status: input.status },
      });
      await tx.demoFeedbackEvent.create({
        data: {
          feedbackId: id,
          actorId: actor.id,
          kind: 'STATUS_CHANGED',
          fromStatus: row.status,
          toStatus: input.status,
          note: input.note,
        },
      });
      await audit(tx, actor, {
        action: 'demo.feedback.reviewed',
        targetType: 'DemoFeedback',
        targetId: id,
        reason: input.note || 'Moderation status change',
        before: { status: row.status },
        after: { status: input.status, scenarioId: row.scenarioId, generation: row.generation },
      });
      return {
        id: updated.id,
        status: updated.status,
        previousStatus: row.status,
      };
    });
  }
}
