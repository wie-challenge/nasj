import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessCandidate, type EligibilityFacts } from '@nasj/contracts';

const ready: EligibilityFacts = {
  craftMatch: true,
  participantActive: true,
  availabilityAvailable: true,
  accountLinked: false,
  accountActive: false,
  participationAuthorized: true,
  periodKnown: true,
  periodCompatible: true,
  declarationPresent: true,
  unitCompatible: true,
  availabilityKnown: true,
  remaining: '30.00',
  capacityConstraints: [],
  restrictionsReviewed: true,
  equipmentRequired: null,
  equipmentHeld: true,
  feasibilityFeasible: true,
};
test('eligibility explains a matching accountless artisan and ignores missing login', () => {
  const result = assessCandidate(ready);
  assert.equal(result.decision, 'ELIGIBLE');
  assert.deepEqual(result.unknown, []);
  assert.equal(
    result.reasons.some((reason) => reason.code === 'ACCOUNTLESS_PARTICIPATION'),
    true,
  );
  assert.equal(JSON.stringify(result).includes('health'), false);
});
test('eligibility distinguishes hard failures from unknown capacity', () => {
  assert.equal(assessCandidate({ ...ready, craftMatch: false }).decision, 'INELIGIBLE');
  assert.equal(assessCandidate({ ...ready, unitCompatible: false }).decision, 'INELIGIBLE');
  assert.equal(assessCandidate({ ...ready, remaining: '0.00' }).decision, 'INELIGIBLE');
  assert.equal(assessCandidate({ ...ready, participantActive: false }).decision, 'INELIGIBLE');
  assert.equal(assessCandidate({ ...ready, availabilityAvailable: false }).decision, 'INELIGIBLE');
  assert.equal(
    assessCandidate({ ...ready, participationAuthorized: false }).decision,
    'INELIGIBLE',
  );
  assert.equal(assessCandidate({ ...ready, periodCompatible: false }).decision, 'INELIGIBLE');
  const unknown = assessCandidate({
    ...ready,
    declarationPresent: false,
    availabilityKnown: false,
    remaining: null,
  });
  assert.equal(unknown.decision, 'NEEDS_REVIEW');
  assert.equal(unknown.unknown.includes('CAPACITY_UNKNOWN'), true);
  const unverified = assessCandidate({ ...ready, restrictionsReviewed: false });
  assert.equal(unverified.decision, 'NEEDS_REVIEW');
  assert.equal(unverified.unknown.includes('PRODUCT_RESTRICTIONS_UNVERIFIED'), true);
});
test('the same facts always produce the same eligibility decision', () => {
  assert.deepEqual(assessCandidate(ready), assessCandidate(ready));
});
