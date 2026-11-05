import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { DemoSessionView } from '@nasj/contracts';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { captureMail, disposableDatabase, testConfig, promoteDisposableAdmin } from './support.js';

export async function runDemoScenarios(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const database = await disposableDatabase({ demo: true });
  const mail = await captureMail();
  const config = testConfig(database.url, mail.port, {
    DEMO_MODE: 'true',
    RATE_API_MAX: 3000,
    // The dedicated feedback bucket is verified separately with its own app instance.
    RATE_FEEDBACK_MAX: 500,
  });
  const app = await createApp({ config });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const db = app.get(PrismaService);
    function visitor() {
      const jar = new Map<string, string>();
      let proof = '';
      async function request(
        path: string,
        method = 'GET',
        body?: unknown,
        extra: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL, ...extra };
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        const res = await fetch(base + path, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        });
        for (const cookie of res.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          const at = pair.indexOf('=');
          if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
          else jar.delete(pair.slice(0, at));
        }
        const value = await res.json();
        if (value.csrfToken && path.endsWith('/demo/session')) proof = value.csrfToken;
        return { status: res.status, body: value };
      }
      return {
        jar,
        request,
        // The visitor-bound HMAC proof, refreshed from the session view where needed.
        proof: () => proof,
        session: async () => (await request('/api/v1/demo/session')).body as DemoSessionView,
        command: (op: string, body = {}, key = randomUUID()) =>
          request(`/api/v1/demo/${op}`, 'POST', body, {
            'X-Demo-CSRF': proof,
            'Idempotency-Key': key,
          }),
      };
    }
    const a = visitor(),
      b = visitor();
    let first!: DemoSessionView, second!: DemoSessionView;
    await check(
      'showroom uses six real scoped authenticated accounts without exposing credentials',
      async () => {
        await a.session();
        await b.session();
        const missing = await a.request('/api/v1/demo/start', 'POST', {});
        assert.equal(missing.status, 403);
        const key = randomUUID();
        const started = await a.command('start', {}, key);
        assert.equal(started.status, 201, JSON.stringify(started.body));
        first = started.body;
        assert.equal((await a.command('start', {}, key)).body.scenario.id, first.scenario!.id);
        second = (await b.command('start')).body;
        assert.notEqual(first.scenario!.id, second.scenario!.id);
        assert.equal(first.personas.length, 6);
        assert.equal(JSON.stringify(first).includes('password'), false);
        for (const persona of first.personas) {
          const switched = await a.command('switch', { persona: persona.id });
          assert.equal(switched.status, 201, JSON.stringify(switched.body));
          assert.equal((await a.request('/api/v1/me')).status, 200);
          assert.equal((await a.session()).scenario!.id, first.scenario!.id);
        }
        const previousPersona = visitor();
        for (const [name, value] of a.jar) previousPersona.jar.set(name, value);
        await a.command('switch', { persona: 'buyer' });
        assert.notEqual((await previousPersona.request('/api/v1/me')).status, 200);
        assert.equal(
          (await a.request(`/api/v1/procurement/rfqs/${second.scenario!.rfqId}`)).status,
          404,
        );
        assert.equal((await a.request('/api/v1/admin/users')).status, 403);
        const stolen = visitor();
        for (const [name, value] of a.jar)
          if (name !== 'nasj_demo_visitor') stolen.jar.set(name, value);
        assert.equal((await stolen.request('/api/v1/me')).status, 403);
        const body = await a.session();
        assert.equal(body.scenario!.totals.payableMillimes, '0');
      },
    );
    await check(
      'accountless showroom reports remain pending and revoked memberships cannot be restored by switching',
      async () => {
        const business = async (who: ReturnType<typeof visitor>, path: string, body: unknown) => {
          const me = await who.request('/api/v1/me');
          return who.request(path, 'POST', body, {
            'X-CSRF-Token': me.body.csrfToken,
            'Idempotency-Key': randomUUID(),
          });
        };
        await b.command('switch', { persona: 'buyer' });
        const detail = await b.request(`/api/v1/procurement/rfqs/${second.scenario!.rfqId}`);
        const quote = detail.body.quotes[0];
        const accepted = await business(
          b,
          `/api/v1/procurement/rfqs/${second.scenario!.rfqId}/accept`,
          {
            version: detail.body.rfq.version,
            quoteId: quote.id,
            confirm: true,
            termsSha256: quote.termsSha256,
          },
        );
        assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
        const orderId = (await b.session()).scenario!.orderId!;
        assert.ok(orderId);
        for (const persona of second.personas) {
          const shared = await b.command('switch', { persona: persona.id });
          assert.equal(shared.status, 201);
          assert.equal(shared.body.scenario.id, second.scenario!.id);
          assert.equal(shared.body.scenario.orderId, orderId);
          assert.equal(shared.body.scenario.rfqId, second.scenario!.rfqId);
          assert.equal(shared.body.scenario.totals.orders, 1);
          assert.equal((await b.session()).scenario!.orderId, orderId);
        }
        await b.command('switch', { persona: 'production' });
        const assessed = await business(
          b,
          `/api/v1/procurement/orders/${orderId}/eligibility-assessments`,
          { version: 1, restrictionsReviewed: true, restrictionSource: 'Synthetic source review' },
        );
        assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
        const candidate = assessed.body.assessments.find(
          (a: { artisanProfileId: string }) =>
            a.artisanProfileId === second.scenario!.accountlessArtisanId,
        );
        assert.equal(candidate.decision, 'ELIGIBLE');
        const prepared = await business(b, `/api/v1/procurement/orders/${orderId}/offers`, {
          version: assessed.body.summary.orderVersion,
          eligibilityId: candidate.id,
          quantity: 1,
          expiresAt: second.scenario!.offerExpiresAt,
          materials: 'Synthetic thread',
          reworkTerms: 'New voluntary agreement',
          paymentConditions: 'Synthetic governed payable',
          collectionArrangement: 'Association pickup',
          instructions: 'Synthetic sample',
        });
        assert.equal(prepared.status, 201, JSON.stringify(prepared.body));
        const issued = await business(b, `/api/v1/procurement/offers/${prepared.body.id}/issue`, {
          version: prepared.body.version,
        });
        assert.equal(issued.status, 201);
        await b.command('switch', { persona: 'coordinator' });
        const reported = await business(
          b,
          `/api/v1/procurement/offers/${prepared.body.id}/assisted-decisions`,
          {
            version: issued.body.version,
            decision: 'ACCEPT',
            evidenceReference: 'Synthetic reported acceptance, unapproved method',
          },
        );
        assert.equal(reported.status, 201, JSON.stringify(reported.body));
        assert.equal(reported.body.assisted.verificationStatus, 'PENDING_UNAPPROVED_METHOD');
        const verified = await business(
          b,
          `/api/v1/procurement/offers/${prepared.body.id}/assisted-decisions/${reported.body.assisted.id}/verify`,
          {},
        );
        assert.equal(verified.status, 409);
        assert.equal(await db.commercialBatch.count({ where: { orderId } }), 0);
        const identity = await db.demoIdentity.findUniqueOrThrow({
          where: { scenarioId_persona: { scenarioId: second.scenario!.id, persona: 'production' } },
        });
        await db.organizationMember.update({
          where: {
            organizationId_userId: {
              organizationId: second.scenario!.operatorOrganizationId,
              userId: identity.userId,
            },
          },
          data: { status: 'SUSPENDED' },
        });
        await b.command('switch', { persona: 'production' });
        assert.notEqual(
          (await b.request(`/api/v1/procurement/orders/${orderId}/execution`)).status,
          200,
        );
        // Existing permissions stay revoked; switching never provisions them again.
        assert.equal(
          (
            await db.organizationMember.findUniqueOrThrow({
              where: {
                organizationId_userId: {
                  organizationId: second.scenario!.operatorOrganizationId,
                  userId: identity.userId,
                },
              },
            })
          ).status,
          'SUSPENDED',
        );
      },
    );
    await check(
      'showroom buyer feedback is visitor-scoped, source-labelled and never shared across generations',
      async () => {
        const business = async (who: ReturnType<typeof visitor>, path: string, body: unknown) => {
          const me = await who.request('/api/v1/me');
          return who.request(path, 'POST', body, {
            'X-CSRF-Token': me.body.csrfToken,
            'Idempotency-Key': randomUUID(),
          });
        };
        await b.command('switch', { persona: 'buyer' });
        const orderId = (await b.session()).scenario!.orderId!;
        const buyerIdentity = await db.demoIdentity.findUniqueOrThrow({
          where: {
            scenarioId_persona: { scenarioId: second.scenario!.id, persona: 'buyer' },
          },
        });
        // Synthetic fixture only: a real receipt row so eligibility can be exercised over HTTP.
        const shipment = await db.shipment.create({
          data: {
            orderId,
            status: 'BUYER_CONFIRMED',
            hub: 'Synthetic showroom hub',
            destination: 'Synthetic Tunis buyer studio',
            actorId: buyerIdentity.userId,
            deliveryReport: {
              create: {
                quantity: 4,
                actorId: buyerIdentity.userId,
                occurredAt: new Date('2026-10-01T09:00:00Z'),
              },
            },
          },
        });
        const receipt = await db.buyerDeliveryConfirmation.create({
          data: {
            shipmentId: shipment.id,
            received: 4,
            accepted: 4,
            missing: 0,
            damaged: 0,
            actorId: buyerIdentity.userId,
            occurredAt: new Date('2026-10-01T10:00:00Z'),
          },
        });
        const created = await business(b, `/api/v1/collaboration/orders/${orderId}/feedback`, {
          receiptConfirmationId: receipt.id,
          category: 'QUALITY',
          rating: 4,
          comment: 'Synthetic visitor opinion about the showroom sample.',
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.equal(created.body.sourceClass, 'DEMO_USER_SUBMITTED');
        const stored = await db.buyerOrderFeedback.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        assert.equal(stored.scenarioId, second.scenario!.id);
        const ownView = await b.request(`/api/v1/collaboration/order-feedback?orderId=${orderId}`);
        assert.equal(ownView.status, 200);
        assert.deepEqual(
          (ownView.body as { items: { id: string }[] }).items.map((row) => row.id),
          [created.body.id],
        );
        // Another visitor never sees this synthetic assessment, even with the same buyer persona.
        await a.command('switch', { persona: 'buyer' });
        assert.equal(
          (await a.request(`/api/v1/collaboration/order-feedback?orderId=${orderId}`)).status,
          404,
        );
        assert.equal(
          (await a.request(`/api/v1/collaboration/order-feedback/${created.body.id}/history`))
            .status,
          404,
        );
        assert.equal(
          (
            await business(a, `/api/v1/collaboration/orders/${orderId}/feedback`, {
              receiptConfirmationId: receipt.id,
              category: 'OVERALL',
            })
          ).status,
          404,
        );
        assert.equal(
          JSON.stringify((await a.request('/api/v1/collaboration')).body).includes(created.body.id),
          false,
        );
        assert.equal(await db.buyerOrderFeedback.count({ where: { orderId } }), 1);
      },
    );
    await check(
      'showroom reset archives only owned scope, replays safely and rolls back interrupted recreation',
      async () => {
        const old = first.scenario!;
        const sentinel = await db.user.create({
          data: {
            id: randomUUID(),
            name: 'Unrelated synthetic sentinel',
            email: `sentinel-${randomUUID()}@example.com`,
            emailVerified: true,
          },
        });
        const sentinelSession = await db.session.create({
          data: {
            id: randomUUID(),
            userId: sentinel.id,
            token: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const before = await db.demoScenario.findUniqueOrThrow({
          where: { id: second.scenario!.id },
        });
        const oldIdentities = await db.demoIdentity.findMany({ where: { scenarioId: old.id } });
        const key = randomUUID();
        const input = { scenarioId: old.id, generation: old.generation, confirm: true };
        const raced = await Promise.all([
          a.command('reset', input, key),
          a.command('reset', input, key),
        ]);
        assert.deepEqual(
          raced.map((r) => r.status),
          [201, 201],
        );
        const fresh = raced[0].body.scenario;
        assert.notEqual(fresh.id, old.id);
        assert.deepEqual(fresh.totals, fresh.initialTotals);
        assert.equal((await a.command('reset', input, key)).body.scenario.id, fresh.id);
        assert.equal((await a.command('reset', input)).status, 409);
        assert.equal(
          (await db.demoScenario.findUniqueOrThrow({ where: { id: old.id } })).status,
          'ARCHIVED',
        );
        assert.equal(
          await db.session.count({ where: { userId: { in: oldIdentities.map((i) => i.userId) } } }),
          0,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: sentinel.id } })).status,
          'ACTIVE',
        );
        assert.deepEqual(
          await db.session.findUniqueOrThrow({ where: { id: sentinelSession.id } }),
          sentinelSession,
        );
        assert.deepEqual(
          await db.demoScenario.findUniqueOrThrow({ where: { id: before.id } }),
          before,
        );
        assert.equal((await b.session()).scenario!.id, before.id);
        assert.equal(
          (
            await a.command('reset', {
              scenarioId: before.id,
              generation: before.generation,
              confirm: true,
            })
          ).status,
          409,
        );
        // A test-only DB trigger interrupts activation; transaction must retain the old generation.
        await db.$executeRawUnsafe(
          `CREATE FUNCTION test_interrupt_demo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic reset interruption'; END $$`,
        );
        await db.$executeRawUnsafe(
          `CREATE TRIGGER test_interrupt_demo BEFORE INSERT ON "DemoScenario" FOR EACH ROW EXECUTE FUNCTION test_interrupt_demo()`,
        );
        assert.equal(
          (
            await a.command('reset', {
              scenarioId: fresh.id,
              generation: fresh.generation,
              confirm: true,
            })
          ).status,
          500,
        );
        assert.equal((await a.session()).scenario!.id, fresh.id);
        assert.equal(
          (await db.demoScenario.findUniqueOrThrow({ where: { id: fresh.id } })).status,
          'ACTIVE',
        );
        await db.$executeRawUnsafe('DROP TRIGGER test_interrupt_demo ON "DemoScenario"');
        await db.$executeRawUnsafe('DROP FUNCTION test_interrupt_demo()');
        const again = await a.command('reset', {
          scenarioId: fresh.id,
          generation: fresh.generation,
          confirm: true,
        });
        assert.equal(again.status, 201);
        assert.deepEqual(again.body.scenario.totals, again.body.scenario.initialTotals);
        assert.equal(await db.demoScenario.count(), 4);
        assert.ok((await db.auditEvent.count({ where: { action: 'demo.scenario.reset' } })) >= 2);
      },
    );
    await check(
      'E15-06 visitor feedback is captured once, validated, rate limited and visitor-scoped',
      async () => {
        const feedback = (who: ReturnType<typeof visitor>, body: unknown, key = randomUUID()) =>
          who.request('/api/v1/demo/feedback', 'POST', body, {
            'X-Demo-CSRF': who.proof(),
            'Idempotency-Key': key,
          });
        await a.command('switch', { persona: 'buyer' });
        const scenarioId = (await a.session()).scenario!.id;
        const otherScenarioId = (await b.session()).scenario!.id;

        // The demo CSRF proof is mandatory for a write.
        const noProof = await a.request('/api/v1/demo/feedback', 'POST', {
          scenarioId,
          screenKey: 'SHOWROOM_OVERVIEW',
          category: 'USABILITY',
        });
        assert.equal(noProof.status, 403);
        assert.equal(noProof.body.code, 'DEMO_CSRF_REJECTED');

        for (const invalid of [
          { scenarioId, screenKey: 'SHOWROOM_OVERVIEW', category: 'MAGIC' },
          { scenarioId, screenKey: 'NOT_A_SCREEN', category: 'IDEA' },
          {
            scenarioId,
            screenKey: 'SHOWROOM_OVERVIEW',
            category: 'IDEA',
            comment: 'x'.repeat(2001),
          },
          { scenarioId, screenKey: 'SHOWROOM_OVERVIEW', category: 'IDEA', visitorId: 'forged' },
          {
            scenarioId,
            screenKey: 'SHOWROOM_OVERVIEW',
            category: 'IDEA',
            sourceClass: 'SYNTHETIC_SEEDED',
          },
        ]) {
          assert.equal((await feedback(a, invalid)).status, 400, JSON.stringify(invalid));
        }
        assert.equal(await db.demoFeedback.count(), 0);

        // Another visitor's scenario is indistinguishable from a missing one.
        assert.equal(
          (
            await feedback(a, {
              scenarioId: otherScenarioId,
              screenKey: 'SHOWROOM_OVERVIEW',
              category: 'IDEA',
            })
          ).status,
          404,
        );

        const key = randomUUID();
        const body = {
          scenarioId,
          screenKey: 'PRESENTATION:workflow',
          category: 'CONTENT',
          comment: 'The stage progress made the workflow easy to follow.',
        };
        const created = await feedback(a, body, key);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const id = created.body.id;
        assert.equal(created.body.sourceClass, 'VISITOR_SUBMITTED');
        assert.equal(created.body.status, 'NEW');
        assert.equal(created.body.generation, (await a.session()).scenario!.generation);
        // Same key replays the original result; a changed payload conflicts.
        assert.deepEqual((await feedback(a, body, key)).body, created.body);
        const conflict = await feedback(a, { ...body, category: 'DEFECT' }, key);
        assert.equal(conflict.status, 409);
        assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
        assert.equal(await db.demoFeedback.count(), 1);

        // A promoted duplicate key cannot double-insert either.
        const stored = await db.demoFeedback.findUniqueOrThrow({ where: { id } });
        assert.equal(
          stored.visitorId,
          (await db.demoVisitor.findFirstOrThrow({ where: { activeScenarioId: scenarioId } })).id,
        );
        assert.equal(stored.comment, body.comment);

        // The visitor sees only their own rows.
        const mineA = await a.request(`/api/v1/demo/feedback?scenarioId=${scenarioId}`);
        assert.equal(mineA.status, 200);
        assert.deepEqual(
          mineA.body.items.map((r: { id: string }) => r.id),
          [id],
        );
        const mineB = await b.request(`/api/v1/demo/feedback?scenarioId=${scenarioId}`);
        assert.deepEqual(mineB.body.items, [], 'another visitor never sees this feedback');
        assert.equal(JSON.stringify(await b.session()).includes(id), false);

        // Deduplication by client key.
        const dedupe = {
          scenarioId,
          screenKey: 'SHOWROOM_OVERVIEW',
          category: 'USABILITY',
          dedupeKey: `dedupe-${randomUUID().slice(0, 8)}`,
        };
        assert.equal((await feedback(a, dedupe)).status, 201);
        await assert.rejects(
          db.demoFeedback.create({
            data: {
              scenarioId,
              visitorId: stored.visitorId,
              generation: stored.generation,
              screenKey: 'SHOWROOM_OVERVIEW',
              category: 'USABILITY',
              dedupeKey: dedupe.dedupeKey,
            },
          }),
          (error: unknown) => (error as { code?: string }).code === 'P2002',
        );

        // Per-scenario cap.
        const limit = 10;
        const before = await db.demoFeedback.count({ where: { scenarioId } });
        for (let index = before; index < limit; index++) {
          const extra = await feedback(a, {
            scenarioId,
            screenKey: 'SHOWROOM_OVERVIEW',
            category: 'IDEA',
            comment: `Synthetic entry ${index}`,
          });
          assert.equal(extra.status, 201, JSON.stringify(extra.body));
        }
        const capped = await feedback(a, {
          scenarioId,
          screenKey: 'SHOWROOM_OVERVIEW',
          category: 'IDEA',
        });
        assert.equal(capped.status, 409);
        assert.equal(capped.body.code, 'FEEDBACK_LIMIT');
        assert.equal(await db.demoFeedback.count({ where: { scenarioId } }), limit);

        // Every stored row is honestly labelled, and the showroom session still carries no password.
        const listed = await a.request(`/api/v1/demo/feedback?scenarioId=${scenarioId}`);
        assert.ok(
          listed.body.items.every(
            (row: { sourceLabel: string }) =>
              row.sourceLabel === 'Visitor feedback about a synthetic demonstration',
          ),
        );
        assert.equal(JSON.stringify(listed.body).includes('password'), false);
      },
    );
    await check(
      'E15-06 showroom personas cannot moderate feedback, and reset preserves it',
      async () => {
        const feedback = (who: ReturnType<typeof visitor>, body: unknown) =>
          who.request('/api/v1/demo/feedback', 'POST', body, {
            'X-Demo-CSRF': who.proof(),
            'Idempotency-Key': randomUUID(),
          });
        // Start from a fresh generation: the previous check deliberately exhausted its cap.
        const before = (await a.session()).scenario!;
        await a.command('reset', {
          scenarioId: before.id,
          generation: before.generation,
          confirm: true,
        });
        const scenarioId = (await a.session()).scenario!.id;
        const created = await feedback(a, {
          scenarioId,
          screenKey: 'SHOWROOM_STAGE_PROGRESS',
          category: 'USABILITY',
          comment: 'Archived-generation feedback must survive the reset.',
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const id = created.body.id;

        // Every showroom persona is a real authenticated session, yet none may moderate.
        const identities = await db.demoIdentity.findMany({ where: { scenarioId } });
        for (const identity of identities) {
          await a.command('switch', { persona: identity.persona as never });
          for (const [method, path, payload] of [
            ['GET', '/api/v1/admin/demo-feedback', undefined],
            ['GET', `/api/v1/admin/demo-feedback/${id}`, undefined],
            [
              'PATCH',
              `/api/v1/admin/demo-feedback/${id}`,
              { expectedStatus: 'NEW', status: 'ACTIONED', note: 'Unauthorized' },
            ],
          ] as const) {
            const denied = await a.request(path, method, payload);
            assert.equal(denied.status, 403, `${identity.persona} ${method} ${path}`);
          }
        }
        // Strongest case: give a persona the real SUPPORT role that can reach /collaboration, then
        // confirm moderation is still denied because it is ADMIN-only, not support-scoped.
        const supportIdentity = identities.find((row) => row.persona === 'production')!;
        const supportMembership = await db.organizationMember.findFirstOrThrow({
          where: { userId: supportIdentity.userId },
        });
        await db.membershipRole.create({
          data: {
            membershipId: supportMembership.id,
            role: 'SUPPORT',
            assignedByUserId: supportIdentity.userId,
          },
        });
        await a.command('switch', { persona: 'production' });
        assert.equal((await a.request('/api/v1/collaboration')).status, 200);
        assert.equal((await a.request('/api/v1/admin/demo-feedback')).status, 403);
        assert.equal((await a.request(`/api/v1/admin/demo-feedback/${id}`)).status, 403);
        assert.equal(
          (
            await a.request(`/api/v1/admin/demo-feedback/${id}`, 'PATCH', {
              expectedStatus: 'NEW',
              status: 'ACTIONED',
              note: 'Unauthorized',
            })
          ).status,
          403,
        );
        assert.equal((await db.demoFeedback.findUniqueOrThrow({ where: { id } })).status, 'NEW');
        assert.equal(
          await db.demoFeedbackEvent.count({ where: { feedbackId: id, kind: 'STATUS_CHANGED' } }),
          0,
        );

        // Reset archives the generation and preserves the feedback.
        const beforeReset = await a.session();
        const archived = beforeReset.scenario!;
        const reset = await a.command('reset', {
          scenarioId: archived.id,
          generation: archived.generation,
          confirm: true,
        });
        assert.equal(reset.status, 201, JSON.stringify(reset.body));
        assert.notEqual(reset.body.scenario.id, archived.id);
        assert.equal(
          (await db.demoScenario.findUniqueOrThrow({ where: { id: archived.id } })).status,
          'ARCHIVED',
        );
        assert.equal(
          await db.demoFeedback.count({ where: { id } }),
          1,
          'reset never deletes feedback',
        );
        assert.equal(
          (await db.demoFeedback.findUniqueOrThrow({ where: { id } })).comment,
          'Archived-generation feedback must survive the reset.',
        );
        // The archived generation no longer accepts new feedback from this visitor.
        const stale = await a.request(
          '/api/v1/demo/feedback',
          'POST',
          {
            scenarioId: archived.id,
            screenKey: 'SHOWROOM_OVERVIEW',
            category: 'IDEA',
          },
          { 'X-Demo-CSRF': a.proof(), 'Idempotency-Key': randomUUID() },
        );
        assert.equal(stale.status, 409);
        assert.equal(stale.body.code, 'STALE_DEMO_SCENARIO');
        // The visitor still sees their own archived submission and only their own.
        const mine = await a.request('/api/v1/demo/feedback');
        assert.ok(mine.body.items.some((r: { id: string }) => r.id === id));
        const stranger = await b.request('/api/v1/demo/feedback');
        assert.equal(JSON.stringify(stranger.body).includes(id), false);
      },
    );
    await check(
      'E15-06 an ADMIN reviewer triages feedback with attributable immutable history',
      async () => {
        // A real, separately authenticated administrator — not a showroom persona.
        const reviewer = visitor();
        const email = 'demo-feedback-reviewer@example.com';
        assert.equal(
          (
            await reviewer.request('/api/auth/sign-up/email', 'POST', {
              email,
              name: 'Synthetic feedback reviewer',
              password: 'Synthetic-review-password-2026!',
            })
          ).status,
          202,
        );
        const token = await mail.token(email, '/auth/verify-email');
        assert.equal(
          (await reviewer.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`))
            .status,
          200,
        );
        assert.equal(
          (
            await reviewer.request('/api/auth/sign-in/email', 'POST', {
              email,
              password: 'Synthetic-review-password-2026!',
            })
          ).status,
          200,
        );
        const me = await reviewer.request('/api/v1/me');
        const csrf = (me.body as { csrfToken: string }).csrfToken;
        // Before promotion the same real account is denied, so ADMIN is the gate.
        assert.equal((await reviewer.request('/api/v1/admin/demo-feedback')).status, 403);
        await promoteDisposableAdmin(database.url, email);
        assert.equal(
          (
            await reviewer.request('/api/auth/sign-in/email', 'POST', {
              email,
              password: 'Synthetic-review-password-2026!',
            })
          ).status,
          200,
        );
        const adminMe = await reviewer.request('/api/v1/me');
        const adminCsrf = (adminMe.body as { csrfToken: string }).csrfToken;

        const feedback = (who: ReturnType<typeof visitor>, body: unknown) =>
          who.request('/api/v1/demo/feedback', 'POST', body, {
            'X-Demo-CSRF': who.proof(),
            'Idempotency-Key': randomUUID(),
          });
        const scenarioId = (await a.session()).scenario!.id;
        const created = await feedback(a, {
          scenarioId,
          screenKey: 'WORKSPACE:buyer',
          category: 'DEFECT',
          comment: 'The buyer workspace button did not respond on my first attempt.',
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const id = created.body.id;

        const list = await reviewer.request('/api/v1/admin/demo-feedback');
        assert.equal(list.status, 200, JSON.stringify(list.body));
        const items = (
          list.body as { items: { id: string; generation: number; events: unknown[] }[] }
        ).items;
        assert.ok(items.some((row) => row.id === id));
        const summary = (list.body as { summary: { status: string; count: number }[] }).summary;
        assert.ok(summary.some((row) => row.status === 'NEW' && row.count >= 1));
        assert.equal(
          (list.body as { items: { sourceLabel: string }[] }).items.every((row) =>
            row.sourceLabel.startsWith('Visitor feedback'),
          ),
          true,
        );
        // Filters are bounded and functional.
        assert.equal(
          (await reviewer.request('/api/v1/admin/demo-feedback?status=ACTIONED')).body.items.length,
          0,
        );
        assert.equal(
          (await reviewer.request('/api/v1/admin/demo-feedback?status=NOPE')).status,
          400,
        );
        assert.equal(
          (await reviewer.request(`/api/v1/admin/demo-feedback?scenarioId=${scenarioId}`)).status,
          200,
        );

        const detail = await reviewer.request(`/api/v1/admin/demo-feedback/${id}`);
        assert.equal(detail.status, 200);
        assert.equal((detail.body as { events: unknown[] }).events.length, 1);
        assert.equal(
          (detail.body as { events: { actorName: string }[] }).events[0].actorName,
          'Visitor (anonymous)',
          'an anonymous submission is labelled, not attributed to a fabricated user',
        );

        const patch = (body: unknown) =>
          reviewer.request(`/api/v1/admin/demo-feedback/${id}`, 'PATCH', body, {
            'X-CSRF-Token': adminCsrf,
          });
        // Closing out requires a stated reason.
        assert.equal(
          (await patch({ expectedStatus: 'NEW', status: 'ACTIONED', note: '' })).status,
          400,
        );
        // NEW cannot jump straight to ACTIONED.
        assert.equal(
          (await patch({ expectedStatus: 'NEW', status: 'ACTIONED', note: 'Skip triage' })).status,
          409,
        );
        const triaged = await patch({
          expectedStatus: 'NEW',
          status: 'TRIAGED',
          note: 'Reproduced on mobile',
        });
        assert.equal(triaged.status, 200, JSON.stringify(triaged.body));
        // A stale tab cannot overwrite a colleague's decision.
        const stale = await patch({
          expectedStatus: 'NEW',
          status: 'DISMISSED',
          note: 'Stale tab',
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.code, 'STALE_STATUS');
        const actioned = await patch({
          expectedStatus: 'TRIAGED',
          status: 'ACTIONED',
          note: 'Fixed in the next generation',
        });
        assert.equal(actioned.status, 200, JSON.stringify(actioned.body));
        // Closed is terminal for both the API and the database.
        assert.equal(
          (await patch({ expectedStatus: 'ACTIONED', status: 'TRIAGED', note: 'Reopen' })).status,
          409,
        );
        await assert.rejects(
          db.demoFeedback.update({ where: { id }, data: { status: 'NEW' } }),
          /terminal/i,
        );

        const finalDetail = await reviewer.request(`/api/v1/admin/demo-feedback/${id}`);
        const events = (
          finalDetail.body as {
            events: { kind: string; actorName: string; toStatus: string | null }[];
          }
        ).events;
        assert.deepEqual(
          events.map((event) => event.kind),
          ['SUBMITTED', 'STATUS_CHANGED', 'STATUS_CHANGED'],
        );
        assert.equal(events[1].actorName, 'Synthetic feedback reviewer');
        assert.equal(events[2].toStatus, 'ACTIONED');
        const stored = await db.demoFeedback.findUniqueOrThrow({ where: { id } });
        assert.equal(
          stored.comment,
          'The buyer workspace button did not respond on my first attempt.',
        );
        assert.equal(stored.status, 'ACTIONED');
        // Attributable audit, without the private comment body.
        const auditRows = await db.auditEvent.findMany({
          where: { targetType: 'DemoFeedback', targetId: id },
        });
        assert.equal(auditRows.length, 2);
        assert.equal(JSON.stringify(auditRows).includes('button did not respond'), false);
        // The visitor still cannot moderate their own feedback, even with a live persona session.
        assert.equal((await a.command('switch', { persona: 'buyer' })).status, 201);
        assert.equal((await a.request('/api/v1/me')).status, 200);
        assert.equal((await a.request('/api/v1/admin/demo-feedback')).status, 403);
        assert.equal((await a.request(`/api/v1/admin/demo-feedback/${id}`)).status, 403);
        // Immutable history.
        const historyRow = await db.demoFeedbackEvent.findFirstOrThrow({
          where: { feedbackId: id },
        });
        await assert.rejects(
          db.demoFeedbackEvent.update({
            where: { id: historyRow.id },
            data: { note: 'rewritten' },
          }),
          /append-only/i,
        );
        await assert.rejects(
          db.demoFeedbackEvent.delete({ where: { id: historyRow.id } }),
          /append-only/i,
        );
        void csrf;
      },
    );
    await check(
      'E15-06 dedicated feedback bucket limits abuse without touching financial or claims state',
      async () => {
        const tightDatabase = await disposableDatabase({ demo: true });
        const tightMail = await captureMail();
        const tight = await createApp({
          config: testConfig(tightDatabase.url, tightMail.port, {
            DEMO_MODE: 'true',
            RATE_API_MAX: 3000,
            RATE_FEEDBACK_MAX: 2,
            RATE_FEEDBACK_WINDOW: 300,
          }),
        });
        try {
          await tight.listen(0, '127.0.0.1');
          const base = await tight.getUrl();
          const jar = new Map<string, string>();
          let proof = '';
          const request = async (
            path: string,
            method = 'GET',
            body?: unknown,
            extra: Record<string, string> = {},
          ) => {
            const headers: Record<string, string> = {
              Origin: testConfig(tightDatabase.url, tightMail.port).PUBLIC_APP_URL,
              ...extra,
            };
            if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
            if (method !== 'GET') headers['Content-Type'] = 'application/json';
            const response = await fetch(base + path, {
              method,
              headers,
              body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
            });
            for (const cookie of response.headers.getSetCookie()) {
              const pair = cookie.split(';')[0];
              const at = pair.indexOf('=');
              if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
              else jar.delete(pair.slice(0, at));
            }
            const payload = await response.json().catch(() => null);
            if (payload?.csrfToken) proof = payload.csrfToken;
            return { status: response.status, body: payload, headers: response.headers };
          };
          const session = await request('/api/v1/demo/session');
          assert.equal(session.status, 200);
          const started = await request(
            '/api/v1/demo/start',
            'POST',
            {},
            {
              'X-Demo-CSRF': proof,
              'Idempotency-Key': randomUUID(),
            },
          );
          assert.equal(started.status, 201, JSON.stringify(started.body));
          const scenarioId = started.body.scenario.id;
          const tightDb = tight.get(PrismaService);
          const financial = async () =>
            JSON.stringify({
              payables: await tightDb.artisanPayable.count(),
              adjustments: await tightDb.financialAdjustment.count(),
              disputes: await tightDb.paymentDispute.count(),
              tickets: await tightDb.supportTicket.count(),
              ownerFeedback: await tightDb.buyerOrderFeedback.count(),
              settlements: await tightDb.simulatedSettlement.count(),
              deliveries: await tightDb.buyerDeliveryConfirmation.count(),
            });
          const before = await financial();

          const send = () =>
            request(
              '/api/v1/demo/feedback',
              'POST',
              {
                scenarioId,
                screenKey: 'SHOWROOM_OVERVIEW',
                category: 'IDEA',
                comment: 'Bucket probe',
              },
              { 'X-Demo-CSRF': proof, 'Idempotency-Key': randomUUID() },
            );
          assert.equal((await send()).status, 201);
          assert.equal((await send()).status, 201);
          const limited = await send();
          assert.equal(limited.status, 429);
          assert.equal(limited.body.code, 'RATE_LIMITED');
          assert.ok(Number(limited.headers.get('retry-after')) > 0, 'Retry-After is present');
          assert.equal(await tightDb.demoFeedback.count(), 2, 'a limited request stores nothing');
          assert.equal(
            await financial(),
            before,
            'feedback never touches financial or claim state',
          );

          // Concurrent submissions from one visitor: the cap holds and no duplicate key is stored.
          const responses = await Promise.all(
            Array.from({ length: 6 }, (_unused, index) =>
              request(
                '/api/v1/demo/feedback',
                'POST',
                {
                  scenarioId,
                  screenKey: 'SHOWROOM_OVERVIEW',
                  category: 'IDEA',
                  comment: `Concurrent ${index}`,
                },
                { 'X-Demo-CSRF': proof, 'Idempotency-Key': randomUUID() },
              ),
            ),
          );
          assert.ok(
            responses.every((response) => response.status === 429 || response.status === 409),
            'every parallel submission is refused, not silently stored',
          );
          assert.equal(await tightDb.demoFeedback.count(), 2);
          // Concurrent submissions with the same key store exactly one row.
          const sharedKey = randomUUID();
          const same = await Promise.all(
            Array.from({ length: 4 }, () =>
              request(
                '/api/v1/demo/feedback',
                'POST',
                {
                  scenarioId,
                  screenKey: 'SHOWROOM_OVERVIEW',
                  category: 'IDEA',
                  comment: 'Same key',
                },
                { 'X-Demo-CSRF': proof, 'Idempotency-Key': sharedKey },
              ),
            ),
          );
          assert.ok(same.every((response) => response.status >= 200));
          assert.equal(await financial(), before);
        } finally {
          await tight.close();
          await tightMail.stop();
          await tightDatabase.stop();
        }
      },
    );
    await check(
      'ordinary mode denies anonymous showroom mutations without creating scenarios',
      async () => {
        const normal = await createApp({
          config: testConfig(database.url, mail.port, { DEMO_MODE: 'false' }),
        });
        try {
          await normal.listen(0, '127.0.0.1');
          const normalBase = await normal.getUrl();
          const before = await db.demoScenario.count();
          const response = await fetch(`${normalBase}/api/v1/demo/session`);
          assert.equal(response.status, 200);
          assert.equal((await response.json()).available, false);
          for (const operation of ['start', 'switch', 'reset']) {
            const denied = await fetch(`${normalBase}/api/v1/demo/${operation}`, {
              method: 'POST',
              headers: {
                Origin: config.PUBLIC_APP_URL,
                'Content-Type': 'application/json',
                'Idempotency-Key': randomUUID(),
              },
              body: JSON.stringify(operation === 'switch' ? { persona: 'buyer' } : {}),
            });
            assert.notEqual(denied.status, 201);
            assert.notEqual(denied.status, 200);
          }
          assert.equal(await db.demoScenario.count(), before);
        } finally {
          await normal.close();
        }
      },
    );
  } finally {
    await app.close();
    await mail.stop();
    await database.stop();
  }
}
