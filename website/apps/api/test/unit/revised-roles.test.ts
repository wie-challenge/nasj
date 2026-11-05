import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  permissionsForMembership,
  rolesForOrganization,
  grantAllowed,
  operationalPersonas,
  registryCreateSchema,
  assistedCapacitySchema,
  artisanDecisionEvidenceSchema,
} from '@nasj/contracts';
test('personas separate platform governance, buyer authority and internal financial permissions', () => {
  assert.deepEqual(operationalPersonas, [
    'PLATFORM_ADMIN',
    'NASJ_OPERATOR',
    'NASJ_COORDINATOR',
    'NASJ_FINANCE',
    'BUYER_REPRESENTATIVE',
    'ASSOCIATION_COORDINATOR',
  ]);
  assert.deepEqual(rolesForOrganization('BUYER_BUSINESS'), ['BUYER_REPRESENTATIVE']);
  assert.deepEqual(rolesForOrganization('INTERNAL'), ['NASJ_OPERATOR']);
  assert.equal(grantAllowed('BUYER_BUSINESS', 'operator.payout.approve'), false);
  const buyer = {
    status: 'ACTIVE',
    isManager: true,
    organization: { type: 'BUYER_BUSINESS', approvalStatus: 'APPROVED' },
    roles: [{ role: 'BUYER_REPRESENTATIVE' as const }],
  };
  const p = permissionsForMembership(buyer);
  assert.ok(p.includes('buyer.rfq.create'));
  assert.ok(
    !permissionsForMembership({
      ...buyer,
      permissionGrants: [{ permission: 'buyer.rfq.create', enabled: false }],
    }).includes('buyer.rfq.create'),
  );
  assert.ok(!p.includes('buyer.quotation.approve'));
  assert.ok(!p.some((v) => v.startsWith('operator.')));
  assert.ok(
    permissionsForMembership({
      ...buyer,
      permissionGrants: [{ permission: 'buyer.quotation.approve' }],
    }).includes('buyer.quotation.approve'),
  );
  assert.ok(
    !permissionsForMembership({
      ...buyer,
      roles: [],
      permissionGrants: [{ permission: 'buyer.quotation.approve' }],
    }).includes('buyer.quotation.approve'),
  );
  assert.ok(
    !permissionsForMembership({ ...buyer, roles: [{ role: 'FINANCE_MANAGER' }] }).includes(
      'finance.payout.read',
    ),
  );
  assert.deepEqual(permissionsForMembership({ ...buyer, status: 'REVOKED' }), []);
});
test('association coordination does not implicitly delegate coordinator management or any financial scope', () => {
  const p = permissionsForMembership({
    status: 'ACTIVE',
    isManager: true,
    organization: { type: 'ASSOCIATION', approvalStatus: 'APPROVED' },
    roles: [{ role: 'ASSOCIATION_COORDINATOR' }],
  });
  assert.ok(p.includes('association.artisan.create'));
  assert.ok(!p.includes('organization.members.invite'));
  assert.ok(!p.includes('organization.roles.assign'));
  assert.ok(!p.some((v) => v.startsWith('finance.') || v.startsWith('operator.')));
});
test('assisted contracts reject unchecked scope, missing witness and wearable capacity inputs', () => {
  const evidence = {
    policyId: 'reviewed-policy',
    purpose: 'PARTICIPATION',
    method: 'WITNESSED_VERBAL',
    occurredAt: '2026-10-20T00:00:00Z',
    language: 'fr',
    evidenceReference: 'synthetic-reference',
  };
  const profile = {
    displayName: 'Synthetic Participant',
    region: 'Tunis',
    preferredLanguage: 'fr',
    equipment: [],
    availabilityStatus: 'AVAILABLE',
    skills: ['weaving'],
    authorization: evidence,
  };
  assert.equal(registryCreateSchema.safeParse(profile).success, false);
  const valid = {
    ...profile,
    authorization: { ...evidence, witnessReference: 'separate-witness' },
  };
  assert.equal(registryCreateSchema.safeParse(valid).success, true);
  for (const field of ['userId', 'organizationId', 'role'])
    assert.equal(registryCreateSchema.safeParse({ ...valid, [field]: 'forged' }).success, false);
  assert.equal(
    assistedCapacitySchema.safeParse({
      craftSkillId: 'weaving',
      quantity: '10',
      unitType: 'PIECES',
      effectiveFrom: '2027-01-01T00:00:00Z',
      effectiveTo: '2027-01-08T00:00:00Z',
      authorizationId: 'reference',
      wearable: 1,
    }).success,
    false,
  );
  assert.equal(
    artisanDecisionEvidenceSchema.safeParse({
      artisanId: 'participant',
      offerId: 'offer',
      termsVersion: 1,
      decision: 'ACCEPTED',
      method: 'SIGNED',
      occurredAt: '2026-10-20T00:00:00Z',
      recordedByCoordinatorId: 'recorder',
      confirmationReference: 'documented exact terms',
      authorizationId: 'evidence',
      reviewStatus: 'PENDING_REVIEW',
    }).success,
    true,
  );
});
