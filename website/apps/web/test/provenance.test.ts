import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceExportFields, proposedEvidence, syntheticEvidence } from '@nasj/contracts';

test('presentation and screenshot labels distinguish hypotheses from synthetic software records', () => {
  const proposal = proposedEvidence(
    'presentation.problem',
    'Problem hypothesis',
    '/evidence#concept',
  );
  const demo = syntheticEvidence(
    'presentation.demo',
    'Software demonstration',
    '/evidence#scenario',
  );
  assert.match(proposal.displayLabel, /Proposed/);
  assert.match(demo.displayLabel, /Synthetic/);
  assert.ok(proposal.limitations.length > 0);
  assert.ok(demo.limitations.length > 0);
  assert.notEqual(proposal.displayLabel, demo.displayLabel);
});
test('export metadata cannot retain a forged verification label', () => {
  const simulated = syntheticEvidence(
    'payment.simulation',
    'Payment simulation',
    '/evidence#payments',
    ['A simulation is not a bank transfer.'],
  );
  const exported = evidenceExportFields({ ...simulated, displayLabel: 'Verified bank payment' });
  assert.match(exported.evidenceLabel, /Synthetic/);
  assert.equal(exported.evidenceLimitations, 'A simulation is not a bank transfer.');
  assert.equal(exported.sourceReference, '/evidence#payments');
});
