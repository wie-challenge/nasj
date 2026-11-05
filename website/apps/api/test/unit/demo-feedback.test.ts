import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionDemoFeedback,
  demoFeedbackRequiresNote,
  demoFeedbackLabel,
  sanitizeDemoFeedbackComment,
  demoFeedbackCreateSchema,
  demoFeedbackDecisionSchema,
  demoFeedbackQuerySchema,
  demoScreenKeys,
  demoFeedbackCategories,
  demoFeedbackCommentMaxLength,
  demoFeedbackPerScenarioLimit,
} from '@nasj/contracts';

test('showroom feedback follows the documented triage order and closes terminally', () => {
  assert.equal(canTransitionDemoFeedback('NEW', 'TRIAGED'), true);
  assert.equal(canTransitionDemoFeedback('NEW', 'DISMISSED'), true);
  assert.equal(canTransitionDemoFeedback('TRIAGED', 'ACTIONED'), true);
  assert.equal(canTransitionDemoFeedback('TRIAGED', 'DISMISSED'), true);
  assert.equal(canTransitionDemoFeedback('TRIAGED', 'NEW'), true, 're-queue is allowed');
  assert.equal(canTransitionDemoFeedback('ACTIONED', 'TRIAGED'), false, 'closed stays closed');
  assert.equal(canTransitionDemoFeedback('DISMISSED', 'NEW'), false);
  assert.equal(canTransitionDemoFeedback('NEW', 'ACTIONED'), false, 'must be triaged first');
  assert.equal(canTransitionDemoFeedback('NEW', 'NEW'), false);
});

test('closing showroom feedback out requires a stated reason', () => {
  assert.equal(demoFeedbackRequiresNote('ACTIONED'), true);
  assert.equal(demoFeedbackRequiresNote('DISMISSED'), true);
  assert.equal(demoFeedbackRequiresNote('TRIAGED'), false);
  assert.equal(demoFeedbackRequiresNote('NEW'), false);
});

test('showroom feedback provenance never claims a real participant view', () => {
  for (const source of ['VISITOR_SUBMITTED', 'SYNTHETIC_SEEDED'] as const) {
    const label = demoFeedbackLabel(source);
    assert.equal(label.provesRealParticipantView, false);
    assert.equal(label.synthetic, true);
    assert.ok(label.label.length > 10);
  }
  assert.notEqual(
    demoFeedbackLabel('VISITOR_SUBMITTED').label,
    demoFeedbackLabel('SYNTHETIC_SEEDED').label,
    'seeded fixtures are visibly distinct from visitor submissions',
  );
});

test('showroom feedback rejects forged identity, provenance and status', () => {
  const valid = {
    scenarioId: 'scenario-1',
    screenKey: 'SHOWROOM_OVERVIEW',
    category: 'USABILITY',
    comment: 'The stage progress helped me follow the workflow.',
  };
  assert.equal(demoFeedbackCreateSchema.safeParse(valid).success, true);
  for (const extra of [
    { visitorId: 'forged' },
    { sourceClass: 'SYNTHETIC_SEEDED' },
    { generation: 9 },
    { status: 'ACTIONED' },
    { createdAt: '2020-01-01T00:00:00Z' },
    { actorId: 'forged' },
  ]) {
    assert.equal(
      demoFeedbackCreateSchema.safeParse({ ...valid, ...extra }).success,
      false,
      `must reject ${Object.keys(extra)[0]}`,
    );
  }
});

test('showroom feedback validates category, screen and comment bounds', () => {
  const base = { scenarioId: 'scenario-1', screenKey: 'SHOWROOM_OVERVIEW', category: 'IDEA' };
  assert.equal(demoFeedbackCreateSchema.safeParse({ ...base, category: 'MAGIC' }).success, false);
  assert.equal(
    demoFeedbackCreateSchema.safeParse({ ...base, screenKey: 'SOME_ARBITRARY_PAGE' }).success,
    false,
  );
  assert.equal(
    demoFeedbackCreateSchema.safeParse({ ...base, comment: 'x'.repeat(2001) }).success,
    false,
  );
  assert.equal(
    demoFeedbackCreateSchema.safeParse({ ...base, comment: 'x'.repeat(2000) }).success,
    true,
  );
  assert.equal(
    demoFeedbackCreateSchema.safeParse({ ...base, dedupeKey: 'short' }).success,
    false,
    'a dedupe key is bounded',
  );
  assert.ok(demoScreenKeys.length >= 10);
  assert.ok(demoFeedbackCategories.length === 4);
  assert.ok(demoFeedbackPerScenarioLimit > 0 && demoFeedbackPerScenarioLimit <= 50);
});

test('showroom feedback comments are bounded plain text', () => {
  const safe = sanitizeDemoFeedbackComment('  <img src=x onerror=alert(1)>Useful tour\u0007  ');
  assert.equal(safe.includes('<img'), false);
  assert.equal(safe.includes('\u0007'), false);
  assert.ok(safe.startsWith('Useful tour'));
  assert.equal(sanitizeDemoFeedbackComment('x'.repeat(3000)).length, demoFeedbackCommentMaxLength);
});

test('moderation decisions require an expected status and reject unknown fields', () => {
  assert.equal(
    demoFeedbackDecisionSchema.safeParse({ expectedStatus: 'NEW', status: 'TRIAGED' }).success,
    true,
  );
  assert.equal(demoFeedbackDecisionSchema.safeParse({ status: 'TRIAGED' }).success, false);
  assert.equal(
    demoFeedbackDecisionSchema.safeParse({
      expectedStatus: 'NEW',
      status: 'TRIAGED',
      actorId: 'forged',
    }).success,
    false,
  );
  assert.equal(
    demoFeedbackDecisionSchema.safeParse({
      expectedStatus: 'NEW',
      status: 'TRIAGED',
      note: 'x'.repeat(1001),
    }).success,
    false,
  );
  assert.equal(demoFeedbackQuerySchema.parse({}).pageSize, 20);
  assert.equal(demoFeedbackQuerySchema.safeParse({ pageSize: 51 }).success, false);
  assert.equal(demoFeedbackQuerySchema.safeParse({ status: 'MAGIC' }).success, false);
});
