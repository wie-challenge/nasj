import { z } from 'zod';
import { requireRule } from './commerce/domain.js';

export const evidenceStatuses = ['PROPOSED', 'SYNTHETIC', 'MEASURED', 'VERIFIED'] as const;
export type EvidenceStatus = (typeof evidenceStatuses)[number];
export const publicEvidenceReferences = [
  '/evidence#concept',
  '/evidence#software',
  '/evidence#scenario',
  '/evidence#methodology',
  '/evidence#producer-share',
  '/evidence#payments',
  '/evidence#physical-evidence',
  '/evidence#safety',
  '/evidence#limitations',
  '/evidence#privacy',
] as const;
export const evidenceLabels: Record<EvidenceStatus, string> = {
  PROPOSED: 'Proposed · hypothesis or planned outcome',
  SYNTHETIC: 'Synthetic · demonstration, not field evidence',
  MEASURED: 'Measured · source measurement required',
  VERIFIED: 'Verified · approved independent review required',
};
const sourceTypes = [
  'PRODUCT_HYPOTHESIS',
  'IMPLEMENTATION_RECORD',
  'SYNTHETIC_SCENARIO',
  'MEASUREMENT_RECORD',
  'INDEPENDENT_VERIFICATION',
] as const;
export const evidenceClaimInputSchema = z
  .object({
    claimId: z.string().regex(/^[a-zA-Z0-9_.:-]{1,180}$/),
    claimType: z.string().trim().min(1).max(100),
    evidenceStatus: z.enum(evidenceStatuses),
    sourceReference: z.enum(publicEvidenceReferences),
    sourceType: z.enum(sourceTypes),
    scenarioId: z
      .string()
      .regex(/^[a-zA-Z0-9_.:-]{1,180}$/)
      .optional(),
    recordedAt: z.iso.datetime({ offset: true }).optional(),
    measuredAt: z.iso.datetime({ offset: true }).optional(),
    verifiedAt: z.iso.datetime({ offset: true }).optional(),
    reviewedBy: z.string().min(1).max(180).optional(),
    verificationPolicyVersion: z.string().min(1).max(100).optional(),
    limitations: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  })
  .strict();
export type EvidenceClaimInput = z.infer<typeof evidenceClaimInputSchema>;
export type EvidenceMetadata = EvidenceClaimInput & { displayLabel: string };

// No reviewed measurement or external-verification policy is configured in this release.
// Neither caller-supplied reviewer names nor a manually entered policy ID confer authority.
// Add an approved server-owned source/reviewer policy before extending this boundary.
export function assertEvidencePublication(input: EvidenceClaimInput): void {
  const claim = evidenceClaimInputSchema.parse(input);
  requireRule(
    claim.evidenceStatus !== 'MEASURED' && claim.evidenceStatus !== 'VERIFIED',
    'EVIDENCE_AUTHORITY_UNAVAILABLE',
    'Measurement and verification publication require an approved source and reviewer policy. None is configured.',
  );
  requireRule(
    !claim.measuredAt && !claim.verifiedAt && !claim.reviewedBy && !claim.verificationPolicyVersion,
    'UNSUPPORTED_EVIDENCE_AUTHORITY',
    'A proposed or synthetic claim cannot carry fabricated measurement or verification metadata.',
  );
  requireRule(
    claim.evidenceStatus === 'SYNTHETIC'
      ? ['SYNTHETIC_SCENARIO', 'IMPLEMENTATION_RECORD'].includes(claim.sourceType)
      : claim.sourceType === 'PRODUCT_HYPOTHESIS',
    'EVIDENCE_SOURCE_MISMATCH',
    'The evidence classification must match its source.',
  );
}
export function publishEvidenceMetadata(input: EvidenceClaimInput): EvidenceMetadata {
  const parsed = evidenceClaimInputSchema.parse(input);
  assertEvidencePublication(parsed);
  return { ...parsed, displayLabel: evidenceLabels[parsed.evidenceStatus] };
}
export function syntheticEvidence(
  claimId: string,
  claimType: string,
  sourceReference: (typeof publicEvidenceReferences)[number] = '/evidence#software',
  limitations: string[] = [
    'Synthetic application records do not establish physical, financial or field outcomes.',
  ],
  context: { scenarioId?: string; recordedAt?: string } = {},
): EvidenceMetadata {
  return publishEvidenceMetadata({
    claimId,
    claimType,
    sourceReference,
    evidenceStatus: 'SYNTHETIC',
    sourceType: 'SYNTHETIC_SCENARIO',
    limitations,
    ...context,
  });
}
export function proposedEvidence(
  claimId: string,
  claimType: string,
  sourceReference: (typeof publicEvidenceReferences)[number] = '/evidence#concept',
  limitations: string[] = ['This is a proposal or hypothesis; no field outcome is established.'],
): EvidenceMetadata {
  return publishEvidenceMetadata({
    claimId,
    claimType,
    sourceReference,
    evidenceStatus: 'PROPOSED',
    sourceType: 'PRODUCT_HYPOTHESIS',
    limitations,
  });
}

// Export helpers retain both the classification and its material limitations.
export function evidenceExportFields(metadata: EvidenceMetadata) {
  assertEvidencePublication(metadataWithoutDisplay(metadata));
  return {
    evidenceStatus: metadata.evidenceStatus,
    evidenceLabel: evidenceLabels[metadata.evidenceStatus],
    sourceReference: metadata.sourceReference,
    evidenceLimitations: metadata.limitations.join(' | '),
  };
}
function metadataWithoutDisplay(metadata: EvidenceMetadata): EvidenceClaimInput {
  const { displayLabel: _label, ...claim } = metadata;
  return claim;
}
