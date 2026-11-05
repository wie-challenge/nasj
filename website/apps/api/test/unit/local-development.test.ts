import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalDevelopment } from '../../../../scripts/local-development.js';
const local = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://nasj:synthetic@127.0.0.1:5442/nasj',
  PUBLIC_APP_URL: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://127.0.0.1:3001',
  SMTP_PORT: '1026',
};
test('local startup accepts only the canonical local development services', () => {
  assert.doesNotThrow(() => assertLocalDevelopment(local));
  for (const change of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { DEMO_MODE: 'true' },
    { PUBLIC_APP_URL: 'http://127.0.0.1:3200' },
    { API_INTERNAL_URL: 'https://remote.invalid' },
    { SMTP_PORT: '587' },
    { DATABASE_URL: 'postgresql://nasj:synthetic@remote.invalid:5442/nasj' },
    { DATABASE_URL: 'postgresql://nasj:synthetic@127.0.0.1:5442/production' },
    { DATABASE_URL: 'postgresql://nasj:synthetic@127.0.0.1:5442/nasj?schema=other' },
  ])
    assert.throws(() => assertLocalDevelopment({ ...local, ...change }));
});
test('startup refusal never echoes a database credential', () => {
  assert.throws(
    () =>
      assertLocalDevelopment({
        ...local,
        DATABASE_URL: 'postgresql://private:do-not-echo@remote.invalid/production',
      }),
    (error) => error instanceof Error && !error.message.includes('do-not-echo'),
  );
});
