import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const REPO = '/home/ashenix/Projects/wie-challenge/website';
const { PGlite } = await import(
  `${REPO}/node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js`
);
const MIG = `${REPO}/apps/api/prisma/migrations`;

export async function freshDb() {
  const db = new PGlite();
  await db.waitReady;
  return db;
}

export function migrationDirs() {
  return readdirSync(MIG)
    .filter((d) => /^\d+_/.test(d))
    .sort();
}

// Apply a single migration file the way prisma migrate deploy would: as one transaction.
export async function applyMigration(db, dir) {
  const sql = readFileSync(join(MIG, dir, 'migration.sql'), 'utf8');
  await db.exec(sql);
  return sql.length;
}

export async function tableCount(db) {
  const r = await db.query(
    "select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  return r.rows[0].c;
}

export async function tables(db) {
  const r = await db.query("select tablename from pg_tables where schemaname='public' order by 1");
  return r.rows.map((x) => x.tablename);
}
