import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionException,
  exceptionBlocksReadiness,
  scheduleRevisionEffect,
  counterofferCreatesAgreement,
  availabilityPauseEffects,
  canTransitionTicket,
  notificationPlan,
  sanitizeDiscussionBody,
  localizedNotification,
  availabilityPauseSchema,
  feedbackEligibility,
  canTransitionFeedbackFollowUp,
  feedbackFollowUpRequiresReason,
  feedbackCaseLinkMatches,
  deriveFeedbackSource,
  feedbackSourceLabel,
  sanitizeFeedbackComment,
  feedbackCommentMaxLength,
  feedbackCreateSchema,
  feedbackCorrectionSchema,
  feedbackFollowUpSchema,
  feedbackCaseLinkSchema,
  feedbackListQuerySchema,
} from '@nasj/contracts';

test('exception lifecycle follows the documented order and a coordinator can close', () => {
  assert.equal(canTransitionException('OPEN', 'ACKNOWLEDGED'), true);
  assert.equal(canTransitionException('ACKNOWLEDGED', 'UNDER_REVIEW'), true);
  assert.equal(canTransitionException('UNDER_REVIEW', 'RESOLVED'), true);
  assert.equal(canTransitionException('RESOLVED', 'CLOSED'), true);
  assert.equal(
    canTransitionException('CLOSED', 'OPEN'),
    false,
    'a closed exception is not reopened',
  );
  assert.equal(canTransitionException('OPEN', 'RESOLVED'), false);
});

test('only a critical unresolved material shortage blocks readiness', () => {
  assert.equal(
    exceptionBlocksReadiness({
      category: 'MATERIAL_SHORTAGE',
      severity: 'CRITICAL',
      state: 'OPEN',
    }),
    true,
  );
  assert.equal(
    exceptionBlocksReadiness({ category: 'MATERIAL_SHORTAGE', severity: 'LOW', state: 'OPEN' }),
    false,
  );
  assert.equal(
    exceptionBlocksReadiness({ category: 'PRODUCTION_DELAY', severity: 'CRITICAL', state: 'OPEN' }),
    false,
  );
  assert.equal(
    exceptionBlocksReadiness({
      category: 'MATERIAL_SHORTAGE',
      severity: 'CRITICAL',
      state: 'RESOLVED',
    }),
    false,
  );
});

test('a proposed schedule change does not alter the contractual deadline until approved', () => {
  const pending = scheduleRevisionEffect({
    status: 'PENDING_APPROVAL',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(pending.applied, false);
  assert.equal(pending.effectiveDeadline, '2026-11-12T17:00:00.000+01:00');
  assert.equal(pending.requiresBuyerApproval, true);
  assert.equal(pending.deltaDays, 7);
  const approved = scheduleRevisionEffect({
    status: 'APPROVED',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(approved.applied, true);
  assert.equal(approved.effectiveDeadline, '2026-11-19T17:00:00.000+01:00');
  const earlier = scheduleRevisionEffect({
    status: 'APPROVED',
    previousDeadline: '2026-11-19T17:00:00.000+01:00',
    proposedDeadline: '2026-11-12T17:00:00.000+01:00',
  });
  assert.equal(
    earlier.requiresBuyerApproval,
    true,
    'an earlier date also changes contractual obligations',
  );
});

test('a counteroffer is never an agreement', () => {
  assert.equal(counterofferCreatesAgreement('PROPOSED'), false);
  assert.equal(counterofferCreatesAgreement('MANAGER_REVIEW'), false);
  assert.equal(counterofferCreatesAgreement('DECLINED'), false);
  assert.equal(counterofferCreatesAgreement('ARTISAN_ACCEPTED'), true);
});

test('availability pause preserves commitments and fairness eligibility', () => {
  const effects = availabilityPauseEffects({ paused: true, hasAcceptedCommitments: true });
  assert.equal(effects.blocksNewOffers, true);
  assert.equal(effects.preservesAcceptedCommitments, true);
  assert.equal(effects.affectsFairnessEligibility, false);
  assert.equal(effects.acceptedCommitmentsUnchanged, true);
});

test('support ticket lifecycle reaches closure only through resolution', () => {
  assert.equal(canTransitionTicket('OPEN', 'IN_PROGRESS'), true);
  assert.equal(canTransitionTicket('IN_PROGRESS', 'RESOLVED'), true);
  assert.equal(canTransitionTicket('RESOLVED', 'CLOSED'), true);
  assert.equal(canTransitionTicket('CLOSED', 'OPEN'), false);
  assert.equal(canTransitionTicket('OPEN', 'CLOSED'), true, 'a duplicate may be closed directly');
});

test('notifications never claim delivery without an opted-in channel and provider', () => {
  const noPreference = notificationPlan({
    category: 'NEW_OFFER',
    preference: null,
    providerConfigured: false,
  });
  assert.equal(noPreference.deliver, false);
  assert.equal(noPreference.status, 'SKIPPED_NO_OPT_IN');
  const noProvider = notificationPlan({
    category: 'NEW_OFFER',
    preference: { channel: 'EMAIL', optedIn: true },
    providerConfigured: false,
  });
  assert.equal(noProvider.deliver, false);
  assert.equal(noProvider.status, 'UNDELIVERABLE_NO_PROVIDER');
  const inApp = notificationPlan({
    category: 'NEW_OFFER',
    preference: { channel: 'IN_APP', optedIn: true },
    providerConfigured: false,
  });
  assert.equal(inApp.deliver, true);
  assert.equal(inApp.status, 'PENDING');
});

test('discussion bodies are sanitised before display', () => {
  const raw = '  <script>alert(1)</script>Hello\u0007 world  ';
  const safe = sanitizeDiscussionBody(raw);
  assert.ok(!safe.includes('<script>'), 'markup is stripped');
  assert.ok(!safe.includes('\u0007'), 'control characters are stripped');
  assert.ok(safe.includes('Hello world'));
  assert.equal(sanitizeDiscussionBody('x'.repeat(5000)).length, 4000, 'bounded length');
});

test('a schedule change is not applied until both parties approve', () => {
  const awaiting = scheduleRevisionEffect({
    status: 'AWAITING_ARTISAN',
    previousDeadline: '2026-11-12T17:00:00.000+01:00',
    proposedDeadline: '2026-11-19T17:00:00.000+01:00',
  });
  assert.equal(awaiting.applied, false);
  assert.equal(awaiting.effectiveDeadline, '2026-11-12T17:00:00.000+01:00');
});

test('withdrawal and escalation preserve the case lifecycle', () => {
  assert.equal(canTransitionTicket('OPEN', 'WITHDRAWN'), true);
  assert.equal(canTransitionTicket('IN_PROGRESS', 'ESCALATED'), true);
  assert.equal(canTransitionTicket('ESCALATED', 'RESOLVED'), true);
  assert.equal(canTransitionTicket('WITHDRAWN', 'IN_PROGRESS'), false);
});
test('pause accepts an effective date and no justification', () => {
  assert.equal(availabilityPauseSchema.parse({ effectiveFrom: '2027-01-01T00:00:00Z' }).reason, '');
});
test('notifications localize generic content without exposing facts', () => {
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'fr').locale, 'fr');
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'ar').locale, 'ar');
  assert.equal(localizedNotification('SUPPORT_CASE_UPDATE', 'unsupported').locale, 'en');
  assert.notEqual(
    localizedNotification('SUPPORT_CASE_UPDATE', 'en').body,
    localizedNotification('SUPPORT_CASE_UPDATE', 'fr').body,
  );
});

/* ---------------------------------------------- buyer order feedback (E18-06) */

test('feedback eligibility needs a real receipt on this order with received above zero', () => {
  assert.equal(
    feedbackEligibility({ received: 9, accepted: 9, missing: 1, damaged: 0, sameOrder: true })
      .eligible,
    true,
  );
  const partial = feedbackEligibility({
    received: 7,
    accepted: 0,
    missing: 2,
    damaged: 7,
    sameOrder: true,
  });
  assert.equal(
    partial.eligible,
    true,
    'a damaged receipt with zero accepted pieces stays eligible',
  );
  assert.equal(partial.acceptedZero, true);
  assert.equal(partial.partialOrDamaged, true);
  const missing = feedbackEligibility({
    received: 0,
    accepted: 0,
    missing: 10,
    damaged: 0,
    sameOrder: true,
  });
  assert.equal(missing.eligible, false, 'nothing received belongs in the claim workflow');
  assert.equal(missing.reason, 'NO_CONFIRMED_RECEIPT');
  const foreign = feedbackEligibility({
    received: 10,
    accepted: 10,
    missing: 0,
    damaged: 0,
    sameOrder: false,
  });
  assert.equal(foreign.eligible, false);
  assert.equal(foreign.reason, 'RECEIPT_ORDER_MISMATCH');
});

test('follow-up transitions require an owner and a reason to reopen or resolve', () => {
  assert.equal(canTransitionFeedbackFollowUp('OPEN', 'FOLLOW_UP'), true);
  assert.equal(canTransitionFeedbackFollowUp('FOLLOW_UP', 'RESOLVED'), true);
  assert.equal(canTransitionFeedbackFollowUp('RESOLVED', 'OPEN'), false);
  assert.equal(canTransitionFeedbackFollowUp('RESOLVED', 'FOLLOW_UP'), true);
  assert.equal(canTransitionFeedbackFollowUp('OPEN', 'OPEN'), false);
  assert.equal(feedbackFollowUpRequiresReason('RESOLVED', 'FOLLOW_UP'), true);
  assert.equal(feedbackFollowUpRequiresReason('OPEN', 'FOLLOW_UP'), false);
});

test('a case link matches only an order-related ticket for this order and operator', () => {
  const matched = feedbackCaseLinkMatches({
    ticketRelatedType: 'ORDER',
    ticketRelatedId: 'order-1',
    ticketOrganizationId: 'operator-1',
    orderId: 'order-1',
    operatorOrganizationId: 'operator-1',
  });
  assert.equal(matched.matches, true);
  assert.equal(
    feedbackCaseLinkMatches({
      ticketRelatedType: 'ORDER',
      ticketRelatedId: 'order-2',
      ticketOrganizationId: 'operator-1',
      orderId: 'order-1',
      operatorOrganizationId: 'operator-1',
    }).reason,
    'DIFFERENT_ORDER',
  );
  assert.equal(
    feedbackCaseLinkMatches({
      ticketRelatedType: 'BATCH',
      ticketRelatedId: 'order-1',
      ticketOrganizationId: 'operator-1',
      orderId: 'order-1',
      operatorOrganizationId: 'operator-1',
    }).reason,
    'NOT_ORDER_RELATED',
    'a legacy support case or another related type never satisfies the link',
  );
  assert.equal(
    feedbackCaseLinkMatches({
      ticketRelatedType: 'ORDER',
      ticketRelatedId: 'order-1',
      ticketOrganizationId: 'operator-2',
      orderId: 'order-1',
      operatorOrganizationId: 'operator-1',
    }).reason,
    'DIFFERENT_OPERATOR',
  );
});

test('feedback provenance is derived by the server and never claims real satisfaction', () => {
  assert.deepEqual(
    deriveFeedbackSource({ demoScenarioId: 'scenario-1', orderProvenance: 'SYNTHETIC' }),
    {
      sourceClass: 'DEMO_USER_SUBMITTED',
      scenarioId: 'scenario-1',
    },
  );
  assert.deepEqual(deriveFeedbackSource({ demoScenarioId: null, orderProvenance: 'SYNTHETIC' }), {
    sourceClass: 'OPERATIONAL_USER_SUBMITTED',
    scenarioId: null,
  });
  assert.equal(
    feedbackSourceLabel({ sourceClass: 'DEMO_USER_SUBMITTED', orderProvenance: 'SYNTHETIC' })
      .provesRealCustomerSatisfaction,
    false,
  );
  assert.equal(
    feedbackSourceLabel({ sourceClass: 'SYNTHETIC_SEEDED', orderProvenance: 'SYNTHETIC' })
      .provesRealCustomerSatisfaction,
    false,
  );
  assert.equal(
    feedbackSourceLabel({ sourceClass: 'OPERATIONAL_USER_SUBMITTED', orderProvenance: 'SYNTHETIC' })
      .provesRealCustomerSatisfaction,
    false,
  );
});

test('feedback commands reject forged identity, scope and over-long input', () => {
  assert.equal(
    feedbackCreateSchema.safeParse({
      receiptConfirmationId: 'receipt-1',
      category: 'QUALITY',
      rating: 4,
      comment: 'Synthetic comment',
      reporterId: 'forged',
    }).success,
    false,
    'the client cannot choose the reporter',
  );
  assert.equal(
    feedbackCreateSchema.safeParse({
      receiptConfirmationId: 'receipt-1',
      category: 'QUALITY',
      rating: 6,
    }).success,
    false,
    'a rating above five is rejected',
  );
  assert.equal(
    feedbackCreateSchema.safeParse({ receiptConfirmationId: 'receipt-1', category: 'MAGIC' })
      .success,
    false,
  );
  assert.equal(
    feedbackCreateSchema.safeParse({
      receiptConfirmationId: 'receipt-1',
      category: 'QUALITY',
      comment: 'x'.repeat(2001),
    }).success,
    false,
  );
  const sanitized = feedbackCreateSchema.parse({
    receiptConfirmationId: 'receipt-1',
    category: 'OVERALL',
    comment: '<b>hello</b>',
  });
  assert.equal(sanitized.comment, 'hello', 'markup is stripped before storage');
});

test('feedback comments are bounded plain text', () => {
  const safe = sanitizeFeedbackComment('  <img src=x onerror=alert(1)>Great quality\u0007  ');
  assert.equal(safe.includes('<img'), false);
  assert.equal(safe.includes('\u0007'), false);
  assert.ok(safe.startsWith('Great quality'));
  assert.equal(sanitizeFeedbackComment('x'.repeat(3000)).length, feedbackCommentMaxLength);
});

test('feedback correction and follow-up schemas demand a version and a reason', () => {
  assert.equal(
    feedbackCorrectionSchema.safeParse({ expectedVersion: 1, category: 'QUALITY', reason: '' })
      .success,
    false,
  );
  assert.equal(
    feedbackCorrectionSchema.safeParse({ category: 'QUALITY', reason: 'Synthetic fix' }).success,
    false,
  );
  assert.equal(
    feedbackFollowUpSchema.safeParse({ expectedVersion: 2, status: 'RESOLVED', reason: '' })
      .success,
    false,
    'a later revision always states why',
  );
  assert.equal(
    feedbackFollowUpSchema.parse({
      expectedVersion: 2,
      status: 'OPEN',
      note: '<i>note</i>',
      reason: 'Reopened after a claim update',
    }).note,
    'note',
    'an internal note is stored as plain text',
  );
  assert.equal(
    feedbackCaseLinkSchema.safeParse({ expectedVersion: 1, ticketId: 'ticket-1', reason: 'Link' })
      .success,
    true,
  );
  assert.equal(feedbackListQuerySchema.parse({}).pageSize, 20, 'the default page size is bounded');
  assert.equal(feedbackListQuerySchema.safeParse({ pageSize: 51 }).success, false);
});
