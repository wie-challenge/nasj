import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const { Client } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg') as {
  Client: new (options: {
    connectionString: string;
    connectionTimeoutMillis: number;
  }) => {
    connect(): Promise<void>;
    query(
      sql: string,
    ): Promise<{ rows: { migration_name: string; finished: boolean; rolledBack: boolean }[] }>;
    end(): Promise<void>;
  };
};
// Read-only local status inspection. Never starts services or applies/resolves migrations.
const values = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const url = new URL(values.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || values.NODE_ENV === 'production')
  throw new Error('Only the existing local development target can be inspected by this helper.');
const db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const history = await db.query(
    'SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY started_at',
  );
  const files = (
    await readdir(new URL('../apps/api/prisma/migrations/', import.meta.url), {
      withFileTypes: true,
    })
  )
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  console.log(
    JSON.stringify({
      scope: 'EXISTING_LOCAL_DEVELOPMENT_STATUS_ONLY',
      readOnly: true,
      applied: history.rows.filter((r) => r.finished && !r.rolledBack).map((r) => r.migration_name),
      incomplete: history.rows
        .filter((r) => !r.finished && !r.rolledBack)
        .map((r) => r.migration_name),
      pending: files.filter(
        (f) => !history.rows.some((r) => r.migration_name === f && r.finished && !r.rolledBack),
      ),
      migrationsAppliedByThisCommand: false,
    }),
  );
  await db.query('ROLLBACK');
} catch (error) {
  const reason =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNAVAILABLE';
  console.log(
    JSON.stringify({
      scope: 'EXISTING_LOCAL_DEVELOPMENT_STATUS_ONLY',
      status: 'UNAVAILABLE',
      reason,
      readOnly: true,
      migrationsAppliedByThisCommand: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
