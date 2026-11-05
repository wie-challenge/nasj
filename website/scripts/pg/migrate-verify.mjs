// Applies every migration to an in-process PostgreSQL (PGlite/WASM) because the delivery sandbox
// denies Docker sockets. See apps/api/test/pg-harness/README.md.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { PGlite } = await import(
  join(root, 'node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js')
);
const dir = join(root, 'apps/api/prisma/migrations');
const db = new PGlite();
await db.waitReady;
const migrations = readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort();
let applied = 0;
for (const m of migrations) {
  try {
    await db.exec(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
    applied++;
  } catch (error) {
    console.error(`FAILED ${m}: ${error.message.split('\n')[0]}`);
    break;
  }
}
const tables = await db.query(
  "select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
);
console.log(`migrations ${applied}/${migrations.length}; tables ${tables.rows[0].c}`);
await db.close();
process.exit(applied === migrations.length ? 0 : 1);
