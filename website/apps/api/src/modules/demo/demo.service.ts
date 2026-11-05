import { isDeepStrictEqual } from 'node:util';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { DemoScenario, Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { fail } from '../../common/errors.js';
import { AuthService } from '../auth/auth.service.js';
import { validateIdempotencyKey } from '../foundation/idempotency.js';
import type { Db } from '../foundation/transaction.js';
import { demoTokenHash, demoVisitorCookie, visitorToken } from './demo-access.js';
import {
  DEMO_LIMITATIONS,
  DEMO_PERSONAS,
  prepareDemoPassword,
  seedDemoScenario,
  type DemoSeedSpec,
} from './demo.seed.js';
@Injectable()
export class DemoService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  private enabled() {
    if (!this.config.DEMO_MODE)
      fail(404, 'NOT_FOUND', 'Showroom entry is unavailable in this environment.');
  }
  private signature(token: string) {
    return createHmac('sha256', this.config.BETTER_AUTH_SECRET)
      .update(`demo-control-csrf:v1:${token}`)
      .digest('base64url');
  }
  private password(scenarioId: string) {
    return createHmac('sha256', this.config.BETTER_AUTH_SECRET)
      .update(`demo-private-credential:v1:${scenarioId}`)
      .digest('base64url');
  }
  private async control(req: Request, mutating = false) {
    this.enabled();
    const token = visitorToken(req.headers.cookie);
    const visitor = token
      ? await this.db.demoVisitor.findUnique({ where: { tokenHash: demoTokenHash(token) } })
      : null;
    if (!token || !visitor || visitor.expiresAt <= new Date())
      fail(
        403,
        'DEMO_VISITOR_REQUIRED',
        'Open the showroom to establish your isolated visitor scenario.',
      );
    if (mutating) {
      const proof = req.headers['x-demo-csrf'];
      const expected = this.signature(token);
      if (
        req.headers.origin !== this.config.PUBLIC_APP_URL ||
        typeof proof !== 'string' ||
        proof.length !== expected.length ||
        !timingSafeEqual(Buffer.from(proof), Buffer.from(expected))
      )
        fail(403, 'DEMO_CSRF_REJECTED', 'Refresh the showroom before changing your scenario.');
    }
    return { token, visitor };
  }
  private async transaction<T>(fn: (tx: Db) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
        return fn(tx);
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }
  async session(req: Request, res: Response): Promise<C.DemoSessionView> {
    res.setHeader('Cache-Control', 'no-store');
    if (!this.config.DEMO_MODE)
      return {
        available: false,
        scenario: null,
        personas: [],
        activePersona: null,
        limitations: [
          'Visitor demo entry is disabled outside the isolated local synthetic environment.',
        ],
      };
    let token = visitorToken(req.headers.cookie);
    let visitor = token
      ? await this.db.demoVisitor.findUnique({ where: { tokenHash: demoTokenHash(token) } })
      : null;
    if (!visitor || visitor.expiresAt <= new Date()) {
      token = randomBytes(32).toString('base64url');
      visitor = await this.db.demoVisitor.create({
        data: { tokenHash: demoTokenHash(token), expiresAt: new Date(Date.now() + 86400000) },
      });
      res.cookie(demoVisitorCookie, token, {
        httpOnly: true,
        secure: this.config.PUBLIC_APP_URL.startsWith('https://'),
        sameSite: 'lax',
        path: '/',
        maxAge: 86400000,
      });
    }
    return this.present(req, visitor.id, token!);
  }
  private async present(
    req: Request,
    visitorId: string,
    token: string,
    signedInPersona?: C.DemoPersona,
  ): Promise<C.DemoSessionView> {
    const visitor = await this.db.demoVisitor.findUniqueOrThrow({ where: { id: visitorId } });
    const scenario = visitor.activeScenarioId
      ? await this.db.demoScenario.findUnique({ where: { id: visitor.activeScenarioId } })
      : null;
    const session = await this.auth.session(req.headers);
    const identity = session
      ? await this.db.demoIdentity.findUnique({ where: { userId: session.user.id } })
      : null;
    // Switching has already verified the provider-issued identity. Its new cookie is
    // on the response; the request still contains the revoked previous session.
    const activePersona =
      signedInPersona ??
      (scenario && identity?.scenarioId === scenario.id
        ? (identity.persona as C.DemoPersona)
        : null);
    return {
      available: true,
      csrfToken: this.signature(token),
      scenario: scenario ? await this.scenarioView(scenario, activePersona) : null,
      personas: DEMO_PERSONAS,
      activePersona,
      limitations: DEMO_LIMITATIONS,
    };
  }
  private async scenarioView(
    scenario: DemoScenario,
    persona: C.DemoPersona | null,
  ): Promise<C.DemoScenarioView> {
    const seed = scenario.seedSpec as unknown as DemoSeedSpec;
    const totals = await this.totals(this.db, scenario);
    const order = await this.db.commercialOrder.findUnique({ where: { rfqId: scenario.rfqId } });
    const stage: C.DemoScenarioView['stage'] =
      totals.payables > 0 || totals.simulations > 0
        ? 'Finance'
        : totals.delivered > 0
          ? 'Traceability'
          : totals.shipments > 0 || totals.prepared > 0
            ? 'Logistics'
            : totals.qualityApproved > 0
              ? 'Logistics'
              : totals.produced > 0
                ? 'Quality'
                : totals.acceptedCommitments > 0
                  ? 'Production'
                  : totals.orders > 0
                    ? 'Artisan Offers'
                    : 'Commercial Decision';
    // A visitor may explore every persona, but buyer/coordinator views do not receive internal amounts.
    const visibleTotals =
      persona === 'buyer' || persona === 'coordinator' || persona === 'artisan'
        ? { ...totals, payableMillimes: '0', simulatedMillimes: '0' }
        : totals;
    return {
      ...seed,
      id: scenario.id,
      generation: scenario.generation,
      version: scenario.version,
      provenance: 'SYNTHETIC',
      rfqId: scenario.rfqId,
      orderId: order?.id ?? null,
      stage,
      initialTotals: seed.initialTotals,
      totals: visibleTotals,
      createdAt: scenario.createdAt.toISOString(),
    };
  }
  async totals(tx: Db, scenario: DemoScenario): Promise<C.DemoTotals> {
    const seed = scenario.seedSpec as unknown as DemoSeedSpec;
    const rfqs = await tx.commercialRfq.findMany({
      where: {
        buyerOrganizationId: seed.buyerOrganizationId,
        operatorOrganizationId: seed.operatorOrganizationId,
      },
      select: { id: true },
    });
    const rfqIds = rfqs.map((r) => r.id);
    const orders = await tx.commercialOrder.findMany({
      where: { rfqId: { in: rfqIds } },
      select: { id: true, delivered: true },
    });
    const orderIds = orders.map((o) => o.id);
    const offers = await tx.commercialOffer.findMany({
      where: { orderId: { in: orderIds } },
      select: { status: true, quantity: true, expiresAt: true },
    });
    const batches = await tx.commercialBatch.findMany({
      where: { orderId: { in: orderIds } },
      select: { produced: true, approved: true },
    });
    const prepared = await tx.shipmentPreparationItem.aggregate({
      where: { batch: { orderId: { in: orderIds } } },
      _sum: { quantity: true },
    });
    const payables = await tx.artisanPayable.findMany({
      where: { orderId: { in: orderIds } },
      select: { amountMillimes: true },
    });
    const simulations = await tx.simulatedSettlement.findMany({
      where: { orderId: { in: orderIds } },
      select: { amountMillimes: true, status: true },
    });
    const lots = await tx.materialLot.findMany({
      where: { organizationId: seed.operatorOrganizationId },
      select: { reservedMilli: true },
    });
    const committed = offers
      .filter((o) => o.status === 'ACCEPTED')
      .reduce((sum, o) => sum + o.quantity, 0);
    return {
      rfqs: rfqs.length,
      quotations: await tx.procurementQuote.count({ where: { rfqId: { in: rfqIds } } }),
      orders: orders.length,
      offers: offers.length,
      acceptedCommitments: offers.filter((o) => o.status === 'ACCEPTED').length,
      committedPieces: committed,
      capacityReserved: `${offers.filter((o) => o.status === 'OFFERED' && o.expiresAt > new Date()).reduce((sum, o) => sum + o.quantity, 0)}.00`,
      produced: batches.reduce((sum, b) => sum + b.produced, 0),
      qualityApproved: batches.reduce((sum, b) => sum + b.approved, 0),
      prepared: prepared._sum.quantity ?? 0,
      shipments: await tx.shipment.count({
        where: { orderId: { in: orderIds }, status: { not: 'CANCELLED' } },
      }),
      delivered: orders.reduce((sum, o) => sum + o.delivered, 0),
      payables: payables.length,
      payableMillimes: payables.reduce((sum, p) => sum + p.amountMillimes, 0n).toString(),
      simulations: simulations.length,
      simulatedMillimes: simulations
        .filter((s) => s.status === 'SIMULATED_SETTLED')
        .reduce((sum, s) => sum + s.amountMillimes, 0n)
        .toString(),
      verifiedPaidMillimes: '0',
      inventoryLots: lots.length,
      inventoryReservedMilli: lots.reduce((sum, l) => sum + l.reservedMilli, 0n).toString(),
      allocationPlans: await tx.allocationPlan.count({ where: { orderId: { in: orderIds } } }),
      productSpecifications: await tx.productSpecification.count({
        where: { ownerOrganizationId: seed.operatorOrganizationId },
      }),
      sampleRequests: await tx.productSampleRequest.count({
        where: {
          buyerOrganizationId: seed.buyerOrganizationId,
          operatorOrganizationId: seed.operatorOrganizationId,
        },
      }),
      samplePayables: await tx.artisanPayable.count({
        where: {
          sampleRequest: {
            buyerOrganizationId: seed.buyerOrganizationId,
            operatorOrganizationId: seed.operatorOrganizationId,
          },
        },
      }),
      productionExceptions: await tx.productionException.count({
        where: { orderId: { in: orderIds } },
      }),
      discussions: await tx.orderDiscussion.count({ where: { orderId: { in: orderIds } } }),
      supportTickets: await tx.supportTicket.count({
        where: {
          organizationId: {
            in: [
              seed.buyerOrganizationId,
              seed.operatorOrganizationId,
              seed.associationOrganizationId,
            ],
          },
        },
      }),
      notificationDeliveries: await tx.notificationDelivery.count({
        where: { user: { demoIdentity: { scenarioId: scenario.id } } },
      }),
      publishedQr: await tx.traceabilityPublication.count({
        where: { orderId: { in: orderIds }, status: 'PUBLISHED' },
      }),
    };
  }
  private async command(
    tx: Db,
    visitorId: string,
    key: string | undefined,
    operation: string,
    input: Prisma.InputJsonValue,
    run: () => Promise<DemoScenario>,
  ) {
    if (!validateIdempotencyKey(key))
      fail(400, 'IDEMPOTENCY_REQUIRED', 'Use a unique idempotency key for showroom changes.');
    const keyHash = demoTokenHash(key!);
    const payloadHash = demoTokenHash(JSON.stringify(input));
    const old = await tx.demoCommand.findUnique({
      where: { visitorId_keyHash: { visitorId, keyHash } },
    });
    if (old) {
      if (old.operation !== operation || old.payloadHash !== payloadHash)
        fail(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This command key already belongs to a different showroom action.',
        );
      const visitor = await tx.demoVisitor.findUniqueOrThrow({ where: { id: visitorId } });
      if (visitor.activeScenarioId !== old.scenarioId)
        fail(
          409,
          'STALE_DEMO_COMMAND',
          'This action belongs to an archived generation. Resume your current scenario.',
        );
      return tx.demoScenario.findUniqueOrThrow({ where: { id: old.scenarioId } });
    }
    const scenario = await run();
    await tx.demoCommand.create({
      data: { visitorId, keyHash, operation, payloadHash, scenarioId: scenario.id },
    });
    return scenario;
  }
  async start(req: Request, key?: string) {
    const { token, visitor } = await this.control(req, true);
    const scenarioId = randomUUID();
    const passwordHash = await prepareDemoPassword(this.password(scenarioId));
    await this.transaction(async (tx) =>
      this.command(tx, visitor.id, key, 'start', {}, async () => {
        const current = await tx.demoVisitor.findUniqueOrThrow({ where: { id: visitor.id } });
        if (current.activeScenarioId)
          return tx.demoScenario.findUniqueOrThrow({ where: { id: current.activeScenarioId } });
        const created = await seedDemoScenario(tx, visitor.id, 1, scenarioId, passwordHash);
        const actual = await this.totals(tx, created);
        if (!isDeepStrictEqual(actual, (created.seedSpec as unknown as DemoSeedSpec).initialTotals))
          fail(
            500,
            'DEMO_SEED_INCONSISTENT',
            'The synthetic initial-state check failed; no scenario was activated.',
          );
        return created;
      }),
    );
    return this.present(req, visitor.id, token);
  }
  async switch(req: Request, res: Response, requested: C.DemoPersona | 'operator', key?: string) {
    const { token, visitor } = await this.control(req, true);
    const persona = requested === 'operator' ? 'production' : requested;
    let identity: { userId: string; scenarioId: string } | undefined;
    let epoch = 0;
    await this.transaction(async (tx) => {
      const current = await tx.demoVisitor.findUniqueOrThrow({ where: { id: visitor.id } });
      if (!current.activeScenarioId)
        fail(409, 'DEMO_NOT_STARTED', 'Start your synthetic scenario before selecting a persona.');
      await this.command(
        tx,
        visitor.id,
        key,
        'switch',
        { persona, scenarioId: current.activeScenarioId },
        async () => {
          const scenario = await tx.demoScenario.findUniqueOrThrow({
            where: { id: current.activeScenarioId! },
          });
          if (scenario.status !== 'ACTIVE' || scenario.visitorId !== visitor.id)
            fail(403, 'DEMO_ISOLATION', 'This scenario is unavailable.');
          return scenario;
        },
      );
      identity = await tx.demoIdentity.findUniqueOrThrow({
        where: { scenarioId_persona: { scenarioId: current.activeScenarioId, persona } },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: identity.userId } });
      if (user.status !== 'ACTIVE')
        fail(403, 'ACCOUNT_UNAVAILABLE', 'This synthetic account has been disabled.');
      const switched = await tx.demoVisitor.update({
        where: { id: visitor.id },
        data: { sessionEpoch: { increment: 1 } },
      });
      epoch = switched.sessionEpoch;
      const owned = await tx.demoIdentity.findMany({
        where: { scenarioId: current.activeScenarioId },
        select: { userId: true },
      });
      await tx.session.deleteMany({ where: { userId: { in: owned.map((row) => row.userId) } } });
    });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: identity!.userId } });
    // The provider creates/signs its own session and cookies. No session is fabricated by the demo.
    const result = await this.auth.auth.api.signInEmail({
      body: { email: user.email, password: this.password(identity!.scenarioId) },
      headers: fromNodeHeaders({
        origin: this.config.PUBLIC_APP_URL,
        'user-agent': req.headers['user-agent'] ?? 'NASJ synthetic showroom',
      }),
      asResponse: true,
    });
    if (!result.ok) fail(401, 'DEMO_SIGN_IN_FAILED', 'The synthetic account could not sign in.');
    const cookies = result.headers.getSetCookie();
    const issued = await this.auth.session({
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
    });
    // Reset may have raced the provider call. Recheck ownership and revoke any stale resulting session.
    await this.transaction(async (tx) => {
      const current = await tx.demoVisitor.findUniqueOrThrow({ where: { id: visitor.id } });
      const active = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        current.activeScenarioId !== identity!.scenarioId ||
        current.sessionEpoch !== epoch ||
        active.status !== 'ACTIVE'
      ) {
        if (issued)
          await tx.session.deleteMany({ where: { id: issued.session.id, userId: user.id } });
        fail(
          409,
          'STALE_DEMO_SCENARIO',
          'The scenario changed during sign-in. Resume its current generation.',
        );
      }
    });
    for (const cookie of cookies) res.append('Set-Cookie', cookie);
    return this.present(req, visitor.id, token, persona);
  }
  /* --------------------------------------------------- E15-06 showroom feedback */

  /**
   * Visitor capture. Ownership is resolved from the HttpOnly visitor cookie and re-checked against
   * the scenario, so a forged body can never name another visitor, generation or provenance.
   */
  async submitFeedback(req: Request, input: C.DemoFeedbackCreateInput, key?: string) {
    const { visitor } = await this.control(req, true);
    if (!key)
      fail(400, 'IDEMPOTENCY_REQUIRED', 'Use a unique idempotency key for showroom feedback.');
    validateIdempotencyKey(key);
    const result = await this.transaction(async (tx) => {
      // Reuse the showroom's own idempotency receipt: one key, one payload, one stored submission.
      const replay = await this.replayFeedback(tx, visitor.id, key, input);
      if (replay) return replay;
      const scenario = await tx.demoScenario.findUnique({ where: { id: input.scenarioId } });
      // A scenario this visitor does not own is indistinguishable from a missing one.
      if (!scenario || scenario.visitorId !== visitor.id)
        fail(404, 'NOT_FOUND', 'Scenario not found.');
      if (scenario.status !== 'ACTIVE')
        fail(
          409,
          'STALE_DEMO_SCENARIO',
          'This generation is archived. Resume your current scenario before leaving feedback.',
        );
      const used = await tx.demoFeedback.count({
        where: { scenarioId: scenario.id, visitorId: visitor.id },
      });
      if (used >= C.demoFeedbackPerScenarioLimit)
        fail(
          409,
          'FEEDBACK_LIMIT',
          'You have reached the feedback limit for this scenario. Start a fresh generation to continue.',
        );
      const created = await tx.demoFeedback.create({
        data: {
          scenarioId: scenario.id,
          visitorId: visitor.id,
          generation: scenario.generation,
          // Provenance is server-derived; the capture schema cannot supply it.
          sourceClass: 'VISITOR_SUBMITTED',
          screenKey: input.screenKey,
          category: input.category,
          comment: input.comment,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
      await tx.demoFeedbackEvent.create({
        data: { feedbackId: created.id, kind: 'SUBMITTED', toStatus: 'NEW' },
      });
      await tx.demoCommand.create({
        data: {
          visitorId: visitor.id,
          keyHash: demoTokenHash(key),
          operation: 'feedback',
          payloadHash: demoTokenHash(JSON.stringify(input)),
          scenarioId: scenario.id,
          feedbackId: created.id,
        },
      });
      return this.feedbackView(created);
    });
    return result;
  }

  /** Replay and conflict detection for feedback, sharing the showroom command receipt table. */
  private async replayFeedback(
    tx: Db,
    visitorId: string,
    key: string,
    input: C.DemoFeedbackCreateInput,
  ): Promise<C.DemoFeedbackView | null> {
    const keyHash = demoTokenHash(key);
    const old = await tx.demoCommand.findUnique({
      where: { visitorId_keyHash: { visitorId, keyHash } },
    });
    if (!old) return null;
    if (old.operation !== 'feedback' || old.payloadHash !== demoTokenHash(JSON.stringify(input)))
      fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This feedback key already belongs to a different submission.',
      );
    // Re-check current authority before disclosing a stored response.
    const visitor = await tx.demoVisitor.findUnique({ where: { id: visitorId } });
    if (!visitor || visitor.expiresAt <= new Date())
      fail(403, 'DEMO_VISITOR_REQUIRED', 'Open the showroom to resume your scenario.');
    const previous = old.feedbackId
      ? await tx.demoFeedback.findUnique({ where: { id: old.feedbackId } })
      : null;
    if (!previous) fail(409, 'STALE_FEEDBACK_COMMAND', 'Resubmit the feedback.');
    if (previous.visitorId !== visitorId)
      fail(409, 'STALE_FEEDBACK_COMMAND', 'Resubmit the feedback.');
    return this.feedbackView(previous);
  }

  /** A visitor reads only feedback they personally submitted, never another visitor's. */
  async myFeedback(req: Request, query: { page: number; pageSize: number; scenarioId?: string }) {
    const { visitor } = await this.control(req);
    const where = {
      visitorId: visitor.id,
      ...(query.scenarioId ? { scenarioId: query.scenarioId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.demoFeedback.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.demoFeedback.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.feedbackView(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      scenarioId: query.scenarioId ?? null,
      limitations: C.demoFeedbackLimitations,
    } satisfies C.DemoFeedbackMineList;
  }

  private feedbackView(row: {
    id: string;
    scenarioId: string;
    generation: number;
    screenKey: string;
    category: string;
    comment: string;
    status: string;
    sourceClass: string;
    createdAt: Date;
  }): C.DemoFeedbackView {
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
    };
  }

  async reset(req: Request, res: Response, input: C.DemoResetInput, key?: string) {
    const { token, visitor } = await this.control(req, true);
    const scenarioId = randomUUID();
    const passwordHash = await prepareDemoPassword(this.password(scenarioId));
    await this.transaction(async (tx) =>
      this.command(tx, visitor.id, key, 'reset', input, async () => {
        const current = await tx.demoVisitor.findUniqueOrThrow({ where: { id: visitor.id } });
        const old = await tx.demoScenario.findFirst({
          where: {
            id: input.scenarioId,
            visitorId: visitor.id,
            generation: input.generation,
            status: 'ACTIVE',
          },
        });
        if (!old || current.activeScenarioId !== old.id)
          fail(
            409,
            'STALE_DEMO_SCENARIO',
            'Only your current generation can be reset. Resume it before trying again.',
          );
        const identities = await tx.demoIdentity.findMany({ where: { scenarioId: old.id } });
        const userIds = identities.map((i) => i.userId);
        const owner = identities.find((i) => i.persona === 'production')!.userId;
        const seed = old.seedSpec as unknown as DemoSeedSpec;
        const publications = await tx.traceabilityPublication.findMany({
          where: {
            order: {
              rfq: {
                buyerOrganizationId: seed.buyerOrganizationId,
                operatorOrganizationId: seed.operatorOrganizationId,
              },
            },
            status: 'PUBLISHED',
          },
        });
        for (const publication of publications) {
          await tx.traceabilityPublication.update({
            where: { id: publication.id },
            data: { status: 'REVOKED', version: { increment: 1 } },
          });
          await tx.traceabilityRevision.create({
            data: {
              publicationId: publication.id,
              version: publication.version + 1,
              status: 'REVOKED',
              snapshot: { provenance: 'SYNTHETIC', scenarioId: old.id },
              actorId: owner,
              reason:
                'Visitor reset archived this synthetic scenario; historical records retained.',
            },
          });
        }
        await tx.session.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'DISABLED' } });
        await tx.demoScenario.update({
          where: { id: old.id },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        });
        const created = await seedDemoScenario(
          tx,
          visitor.id,
          old.generation + 1,
          scenarioId,
          passwordHash,
        );
        const actual = await this.totals(tx, created);
        if (!isDeepStrictEqual(actual, (created.seedSpec as unknown as DemoSeedSpec).initialTotals))
          fail(
            500,
            'DEMO_SEED_INCONSISTENT',
            'Reset reconciliation failed; the previous scenario remains active.',
          );
        await tx.auditEvent.create({
          data: {
            actorId: owner,
            action: 'demo.scenario.reset',
            targetType: 'DemoScenario',
            targetId: old.id,
            organizationId: seed.operatorOrganizationId,
            correlationId: randomUUID(),
            reason:
              'Only visitor-owned synthetic scope archived; immutable commerce and inventory history retained.',
            after: { newScenarioId: created.id, generation: created.generation },
          },
        });
        return created;
      }),
    );
    // Invalidate browser provider cookies as well as the deleted server sessions.
    for (const name of [
      'nasj_demo.session_token',
      'nasj_demo.session_data',
      'nasj_demo.dont_remember',
    ])
      res.clearCookie(name, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.PUBLIC_APP_URL.startsWith('https://'),
      });
    return this.present(req, visitor.id, token);
  }
}
