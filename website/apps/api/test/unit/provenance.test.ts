import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertEvidencePublication,
  evidenceClaimInputSchema,
  evidenceExportFields,
  proposedEvidence,
  publishEvidenceMetadata,
  syntheticEvidence,
  traceabilityDraftSchema,
} from '@nasj/contracts';

test('evidence classifications derive truthful labels and preserve limitations', () => {
  const proposed = proposedEvidence('market.hypothesis', 'Market-access hypothesis');
  assert.equal(proposed.evidenceStatus, 'PROPOSED');
  assert.match(proposed.displayLabel, /hypothesis/);
  const synthetic = syntheticEvidence(
    'scenario.capacity',
    'Declared capacity',
    '/evidence#scenario',
    ['Synthetic declared capacity is not measured throughput.'],
    { scenarioId: 'demo-v1', recordedAt: '2026-10-27T09:00:00Z' },
  );
  assert.equal(synthetic.scenarioId, 'demo-v1');
  assert.equal(synthetic.recordedAt, '2026-10-27T09:00:00Z');
  assert.match(synthetic.displayLabel, /not field evidence/);
  assert.deepEqual(evidenceExportFields(synthetic), {
    evidenceStatus: 'SYNTHETIC',
    evidenceLabel: synthetic.displayLabel,
    sourceReference: '/evidence#scenario',
    evidenceLimitations: 'Synthetic declared capacity is not measured throughput.',
  });
});
test('unconfigured measurement and verification authorities fail closed even with invented reviewer and policy', () => {
  const { displayLabel: _label, ...claim } = syntheticEvidence('claim.example', 'Example');
  for (const evidenceStatus of ['MEASURED', 'VERIFIED'] as const) {
    assert.throws(
      () =>
        publishEvidenceMetadata({
          ...claim,
          evidenceStatus,
          sourceType:
            evidenceStatus === 'VERIFIED' ? 'INDEPENDENT_VERIFICATION' : 'MEASUREMENT_RECORD',
          measuredAt: '2026-10-27T09:00:00Z',
          verifiedAt: '2026-10-27T10:00:00Z',
          reviewedBy: 'Caller-selected reviewer',
          verificationPolicyVersion: 'Caller-selected policy',
        }),
      /approved source and reviewer policy/,
    );
  }
  assert.throws(
    () => assertEvidencePublication({ ...claim, verifiedAt: '2026-10-27T10:00:00Z' }),
    /fabricated/,
  );
  assert.throws(
    () =>
      publishEvidenceMetadata({
        ...claim,
        evidenceStatus: 'SYNTHETIC',
        sourceType: 'MEASUREMENT_RECORD',
      }),
    /match its source/,
  );
  assert.throws(
    () =>
      evidenceExportFields({
        ...syntheticEvidence('claim.synthetic', 'Example'),
        evidenceStatus: 'VERIFIED',
      }),
    /approved source/,
  );
});
test('public source references exclude raw personal evidence and arbitrary links', () => {
  const { displayLabel: _label, ...claim } = proposedEvidence('claim.source', 'Example');
  for (const sourceReference of [
    'https://example.com/private-artisan-evidence?email=artisan@example.com',
    '/api/v1/finance/orders/private',
    'file:///private/evidence',
    'javascript:alert(1)',
  ]) {
    assert.equal(evidenceClaimInputSchema.safeParse({ ...claim, sourceReference }).success, false);
  }
  assert.equal(evidenceClaimInputSchema.safeParse({ ...claim, limitations: [] }).success, false);
});
test('public story inputs cannot claim caller-selected verification or private evidence', () => {
  const valid = { story: 'A synthetic reviewed embroidery craft story.' };
  assert.equal(traceabilityDraftSchema.safeParse(valid).success, true);
  assert.equal(
    traceabilityDraftSchema.safeParse({ ...valid, evidenceStatus: 'VERIFIED', reviewedBy: 'admin' })
      .success,
    false,
  );
  assert.equal(
    traceabilityDraftSchema.safeParse({
      ...valid,
      evidence: { status: 'VERIFIED', source: 'manual upload' },
    }).success,
    false,
  );
});
