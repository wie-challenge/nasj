import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  permissionsForMembership,
  rolesForOrganization,
  capacityDeclarationSchema,
} from '@nasj/contracts';
import { validateEnvironment } from '../../src/config/env.js';
test('membership permissions deny revoked access and separate management from financial authority', () => {
  const member = {
    status: 'ACTIVE',
    isManager: true,
    roles: [],
    organization: { approvalStatus: 'APPROVED' },
  };
  assert.ok(permissionsForMembership(member).includes('organization.members.invite'));
  assert.equal(permissionsForMembership(member).includes('finance.payout.approve'), false);
  assert.deepEqual(permissionsForMembership({ ...member, status: 'REVOKED' }), []);
  assert.equal(
    permissionsForMembership({
      ...member,
      organization: { approvalStatus: 'PENDING_REVIEW' },
    }).includes('organization.members.invite'),
    false,
  );
  assert.equal(rolesForOrganization('BUYER_BUSINESS').includes('FINANCE_MANAGER'), false);
  assert.deepEqual(rolesForOrganization('unknown'), []);
});
test('capacity schema rejects unknown health inputs and invalid date periods', () => {
  const capacity = {
    craftSkillId: 'embroidery',
    unitType: 'HOURS',
    quantity: 20,
    effectiveFrom: '2026-10-17T00:00:00Z',
    effectiveTo: '2026-10-24T00:00:00Z',
  };
  assert.equal(capacityDeclarationSchema.safeParse(capacity).success, true);
  for (const field of ['strainScore', 'wearable', 'sensorData', 'userId'])
    assert.equal(
      capacityDeclarationSchema.safeParse({ ...capacity, [field]: true }).success,
      false,
    );
  assert.equal(
    capacityDeclarationSchema.safeParse({ ...capacity, effectiveTo: capacity.effectiveFrom })
      .success,
    false,
  );
});
test('demo configuration cannot point at ordinary database and production requires privileged MFA', () => {
  const env = {
    NODE_ENV: 'test',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5542/nasj',
    BETTER_AUTH_SECRET: 'a'.repeat(64),
  };
  assert.throws(() => validateEnvironment({ ...env, DEMO_MODE: 'true' }));
  assert.equal(
    validateEnvironment({
      ...env,
      DEMO_MODE: 'true',
      DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5542/nasj_demo',
    }).DEMO_MODE,
    true,
  );
  assert.throws(
    () =>
      validateEnvironment({
        ...env,
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://synthetic.example',
        ARCJET_ENABLED: 'true',
        ARCJET_KEY: 'synthetic',
        SMTP_SECURE: 'true',
        SMTP_USER: 'synthetic',
        SMTP_PASSWORD: 'synthetic',
        REQUIRE_PRIVILEGED_MFA: 'false',
      }),
    /MFA/,
  );
});
