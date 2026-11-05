import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as C from '@nasj/contracts';
test('payout capacity and maker checker protect exact partial obligations', () => {
  C.assertPayoutCapacity(1001n, 500n, 501n);
  assert.throws(() => C.assertPayoutCapacity(1001n, 500n, 502n));
  assert.throws(() => C.assertPayoutCapacity(1001n, 0n, 0n));
  assert.throws(() => C.assertIndependentApproval('maker', 'maker'));
  C.assertIndependentApproval('maker', 'checker');
  assert.equal(C.parseTnd('0.001') + C.parseTnd('0.009'), 10n);
});
test('evidence contracts reject fabricated verification and floating point amounts', () => {
  assert.equal(
    C.depositReviewSchema.safeParse({ decision: 'VERIFIED', reason: 'Manual screenshot' }).success,
    false,
  );
  assert.equal(
    C.payoutExecutionSchema.safeParse({
      amountTnd: '1.000',
      reference: 'manual',
      evidence: 'Manual screenshot',
      occurredAt: '2026-10-01T00:00:00Z',
      outcome: 'PAID_VERIFIED',
    }).success,
    false,
  );
  assert.equal(
    C.payoutRequestSchema.safeParse({ payableId: 'payable', amountTnd: 1.1, reason: 'Requested' })
      .success,
    false,
  );
});
test('reviewers cannot waive claims or bypass dispute lifecycle', () => {
  C.assertDisputeTransition('OPEN', 'UNDER_REVIEW', false);
  C.assertDisputeTransition('UNDER_REVIEW', 'PROPOSED_RESOLUTION', false);
  assert.throws(() => C.assertDisputeTransition('OPEN', 'CLOSED', true));
  assert.throws(() => C.assertDisputeTransition('PROPOSED_RESOLUTION', 'RESOLVED', false));
  C.assertDisputeTransition('PROPOSED_RESOLUTION', 'RESOLVED', true);
});
test('read-only finance and admin persona never acquire reconciliation grant', () => {
  const member = {
    status: 'ACTIVE',
    isManager: false,
    organization: { type: 'INTERNAL', approvalStatus: 'APPROVED' },
    roles: [{ role: 'FINANCE_MANAGER' as const }],
  };
  assert.equal(C.permissionsForMembership(member).includes('finance.payable.reconcile'), false);
  assert.equal(
    C.permissionsForMembership({
      ...member,
      permissionGrants: [{ permission: 'finance.payable.reconcile', enabled: true }],
    }).includes('finance.payable.reconcile'),
    true,
  );
  assert.equal(
    C.permissionsForMembership({
      ...member,
      status: 'SUSPENDED',
      permissionGrants: [{ permission: 'finance.payable.reconcile', enabled: true }],
    }).includes('finance.payable.reconcile'),
    false,
  );
  assert.equal(
    C.permissionsForMembership({
      ...member,
      permissionGrants: [{ permission: 'finance.payout.approve', enabled: false }],
    }).includes('finance.payout.approve'),
    false,
  );
});
