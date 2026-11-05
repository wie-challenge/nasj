// Boots the real NestJS application against the wire-protocol PostgreSQL server and drives a route
// over HTTP. This is application integration against a running server, not an in-process unit test.
import 'reflect-metadata';
import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
process.env.DATABASE_URL = env.connectionString;

const { createApp } = await import('../../src/app.js');
const app = await createApp();
await app.listen(0, '127.0.0.1');
const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

const health = await fetch(`${url}/api/health/ready`);
const body = await health.json();

console.log(
  JSON.stringify(
    { nestBooted: true, baseUrl: url, readiness: health.status, payload: body },
    null,
    1,
  ),
);
await app.close();
await env.close();
