// Runs a real PostgreSQL wire-protocol server (PGlite over TCP) and a client session in ONE process.
//
// Why co-located: the delivery sandbox gives each spawned command its own network namespace, so a
// listener started by one command is unreachable from another. The client still connects over TCP
// using the standard PostgreSQL protocol - it is not PGlite's in-process API - so authentication,
// the protocol framing, transactions and SQL execution are all exercised for real.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const MIG = `${REPO}/apps/api/prisma/migrations`;
const { PGlite } = await import(
  `${REPO}/node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js`
);
const { PGLiteSocketServer } = await import(
  `${REPO}/node_modules/.pnpm/@electric-sql+pglite-socket@0.1.3_@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite-socket/dist/index.js`
);
const pg = (await import(`${REPO}/node_modules/.pnpm/pg@8.23.1/node_modules/pg/lib/index.js`))
  .default;

let nextPort = 55440;
async function freePort() {
  for (let i = 0; i < 50; i += 1) {
    const port = nextPort++;
    const ok = await new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  throw new Error('NoPort');
}

/** Boots an isolated database with all 39 migrations applied and returns a connected pg client. */
export async function bootPostgres({ migrate = true } = {}) {
  const db = await PGlite.create();
  await db.waitReady;
  if (migrate) {
    for (const dir of readdirSync(MIG)
      .filter((d) => /^\d+_/.test(d))
      .sort()) {
      await db.exec(readFileSync(join(MIG, dir, 'migration.sql'), 'utf8'));
    }
  }
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
  await server.start();

  const connectionString = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();

  return {
    connectionString,
    port,
    client,
    async close() {
      await client.end().catch(() => {});
      await server.stop();
      await db.close();
    },
  };
}

export async function assertWire(env) {
  const v = await env.client.query('select version() as v');
  const t = await env.client.query(
    "select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  return { version: v.rows[0].v, tables: t.rows[0].c };
}
