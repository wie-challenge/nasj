import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { profileSchema, registerSchema, accountUpdateSchema, pageSchema } from '@nasj/contracts';
import { validateEnvironment, trustedNetwork } from '../../src/config/env.js';
import { csrfToken, verifyCsrf } from '../../src/common/csrf.js';
import { errorResponse } from '../../src/common/http-exception.filter.js';
import { routeLabel } from '../../src/common/routes.js';
import { publicUser } from '../../src/modules/users/user.projection.js';
import { policyName, botProtected, healthProbe } from '../../src/security/policies.js';
const secret = 'a'.repeat(64);
const values = {
  NODE_ENV: 'test',
  PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test:test@localhost:5442/test',
  BETTER_AUTH_SECRET: secret,
};
test('configuration rejects unsafe production defaults and unrestricted proxy trust', () => {
  assert.equal(validateEnvironment(values).ARCJET_ENABLED, false);
  assert.throws(() => validateEnvironment({ ...values, NODE_ENV: 'production' }));
  assert.throws(() => validateEnvironment({ ...values, ARCJET_ENABLED: 'true' }));
  for (const proxy of ['true', '*', '1', '0.0.0.0/0', 'caller-controlled'])
    assert.throws(() => validateEnvironment({ ...values, TRUST_PROXY: proxy }));
  assert.deepEqual(
    validateEnvironment({ ...values, TRUST_PROXY: '127.0.0.1,10.0.0.0/24' }).TRUST_PROXY,
    ['127.0.0.1', '10.0.0.0/24'],
  );
  assert.equal(trustedNetwork('::1'), true);
  assert.throws(() =>
    validateEnvironment({ ...values, PUBLIC_APP_URL: 'http://localhost:3000/path' }),
  );
  assert.throws(
    () => validateEnvironment({ ...values, DATABASE_URL: 'mysql://private:secret@host/database' }),
    (error) => !(error as Error).message.includes('private:secret'),
  );
});
test('strict contracts prevent public role/status mass assignment and bound pagination', () => {
  assert.equal(
    registerSchema.parse({
      name: 'Maker One',
      email: ' Maker+Demo@Example.com ',
      password: 'a'.repeat(12),
    }).email,
    'maker+demo@example.com',
  );
  assert.equal(
    registerSchema.safeParse({
      name: 'Maker',
      email: 'maker@example.com',
      password: 'a'.repeat(12),
      role: 'ADMIN',
    }).success,
    false,
  );
  assert.equal(profileSchema.safeParse({ name: 'Maker', emailVerified: true }).success, false);
  assert.equal(accountUpdateSchema.safeParse({ role: 'ADMIN', password: 'secret' }).success, false);
  assert.equal(pageSchema.safeParse({ page: -1 }).success, false);
  assert.equal(pageSchema.safeParse({ pageSize: 1000 }).success, false);
});
test('CSRF proofs are session-bound and cannot be replayed for another session', async () => {
  const token = await csrfToken(secret, 'session-one');
  assert.equal(await verifyCsrf(secret, token, 'session-one'), true);
  assert.equal(await verifyCsrf(secret, token, 'session-two'), false);
  assert.equal(await verifyCsrf('b'.repeat(64), token, 'session-one'), false);
  assert.equal(await verifyCsrf(secret, `${token}tampered`, 'session-one'), false);
});
test('public user projections exclude future fields and credentials', () => {
  const now = new Date();
  const result = publicUser({
    id: 'one',
    name: 'Maker',
    email: 'maker@example.com',
    emailVerified: true,
    role: 'USER',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    password: 'must-never-leak',
    sessions: ['secret'],
  } as Parameters<typeof publicUser>[0]);
  assert.equal('password' in result, false);
  assert.equal('sessions' in result, false);
  assert.equal(result.createdAt, now.toISOString());
});
test('errors never echo malformed input, database messages or internal exception details', () => {
  const parser = Object.assign(new Error('password=super-private'), {
    type: 'entity.parse.failed',
  });
  assert.equal(errorResponse(parser, 'request-one').status, 400);
  assert.equal(
    JSON.stringify(errorResponse(parser, 'request-one')).includes('super-private'),
    false,
  );
  assert.equal(
    JSON.stringify(errorResponse(new HttpException('raw-token', 400), 'request-one')).includes(
      'raw-token',
    ),
    false,
  );
  assert.equal(errorResponse(new Error('database credentials'), 'request-one').status, 500);
});
test('rate policies distinguish abuse flows and narrowly exempt health probes', () => {
  assert.equal(policyName('/api/auth/sign-in/email'), 'login');
  assert.equal(policyName('/api/auth/sign-up/email'), 'registration');
  assert.equal(policyName('/api/auth/request-password-reset'), 'reset');
  assert.equal(policyName('/api/auth/send-verification-email'), 'verification');
  assert.equal(policyName('/api/v1/admin/users/one'), 'admin');
  assert.equal(botProtected('/api/v1/me'), false);
  assert.equal(botProtected('/api/auth/sign-in/email'), true);
  assert.equal(healthProbe('/api/health/live', 'GET'), true);
  assert.equal(healthProbe('/api/health/live/anything', 'GET'), false);
  assert.equal(healthProbe('/api/health/live', 'POST'), false);
  assert.equal(routeLabel('/api/auth/reset-password/private-token'), '/api/[unknown]');
});
