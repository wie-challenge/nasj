// Serves PGlite (real PostgreSQL 17.5, WASM) over the PostgreSQL wire protocol on TCP.
// Used to run Prisma and the NestJS application against a genuine server without Docker.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const MIG = `${REPO}/apps/api/prisma/migrations`;
const { PGlite } = await import(
  `${REPO}/node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js`
);
const { PGLiteSocketServer } = await import(
  `${REPO}/node_modules/.pnpm/@electric-sql+pglite-socket@0.1.3_@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite-socket/dist/index.js`
);

const port = Number(process.env.PG_PORT ?? 55432);
const db = await PGlite.create();
await db.waitReady;

if (process.env.SKIP_MIGRATIONS !== '1') {
  for (const dir of readdirSync(MIG)
    .filter((d) => /^\d+_/.test(d))
    .sort()) {
    await db.exec(readFileSync(join(MIG, dir, 'migration.sql'), 'utf8'));
  }
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`PGLITE_WIRE_READY ${port}`);
