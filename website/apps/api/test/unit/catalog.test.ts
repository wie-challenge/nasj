import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionSpecification,
  canTransitionSample,
  sampleMayStart,
  sampleApprovalAuthorizesWork,
} from '@nasj/contracts';

test('specification transitions preserve approved history and forbid reopening', () => {
  assert.equal(canTransitionSpecification('DRAFT', 'SUBMITTED_FOR_REVIEW'), true);
  assert.equal(canTransitionSpecification('SUBMITTED_FOR_REVIEW', 'APPROVED'), true);
  assert.equal(canTransitionSpecification('SUBMITTED_FOR_REVIEW', 'REJECTED'), true);
  assert.equal(canTransitionSpecification('APPROVED', 'SUPERSEDED'), true);
  assert.equal(
    canTransitionSpecification('APPROVED', 'DRAFT'),
    false,
    'approved work is immutable',
  );
  assert.equal(canTransitionSpecification('SUPERSEDED', 'APPROVED'), false);
  assert.equal(canTransitionSpecification('DRAFT', 'APPROVED'), false, 'review cannot be skipped');
});

test('sample transitions never jump straight to approval', () => {
  assert.equal(canTransitionSample('REQUESTED', 'TERMS_PENDING'), true);
  assert.equal(canTransitionSample('TERMS_PENDING', 'ACCEPTED_FOR_PRODUCTION'), true);
  assert.equal(canTransitionSample('IN_PROGRESS', 'APPROVED'), false);
  assert.equal(canTransitionSample('UNDER_REVIEW', 'APPROVED'), true);
  assert.equal(canTransitionSample('REQUESTED', 'APPROVED'), false);
  assert.equal(canTransitionSample('APPROVED', 'REJECTED'), false, 'a decision is final');
});

test('sample work is never unpaid by default', () => {
  assert.deepEqual(
    sampleMayStart({ compensationMillimes: null, compensationBasis: 'UNPAID_BY_DEFAULT_BLOCKED' }),
    {
      allowed: false,
      reason: 'No compensation basis has been agreed.',
    },
  );
  assert.equal(
    sampleMayStart({ compensationMillimes: null, compensationBasis: 'PER_SAMPLE' }).allowed,
    false,
  );
  assert.equal(
    sampleMayStart({ compensationMillimes: '0', compensationBasis: 'PER_SAMPLE' }).allowed,
    false,
  );
  assert.equal(
    sampleMayStart({ compensationMillimes: '12500', compensationBasis: 'PER_SAMPLE' }).allowed,
    true,
  );
});

test('sample approval only authorizes the matching buyer organization and revision', () => {
  const base = {
    approvalDecision: 'APPROVED',
    approvalBuyerOrganizationId: 'buyer_a',
    releaseBuyerOrganizationId: 'buyer_a',
    approvalRevisionId: 'rev_2',
    releaseRevisionId: 'rev_2',
    revisionState: 'APPROVED' as const,
  };
  assert.equal(sampleApprovalAuthorizesWork(base).authorized, true);
  assert.equal(
    sampleApprovalAuthorizesWork({ ...base, approvalBuyerOrganizationId: 'buyer_b' }).authorized,
    false,
  );
  assert.equal(
    sampleApprovalAuthorizesWork({ ...base, approvalRevisionId: 'rev_1' }).authorized,
    false,
  );
  assert.equal(
    sampleApprovalAuthorizesWork({ ...base, revisionState: 'SUPERSEDED' }).authorized,
    false,
  );
  assert.equal(
    sampleApprovalAuthorizesWork({ ...base, approvalDecision: 'REJECTED' }).authorized,
    false,
  );
});
