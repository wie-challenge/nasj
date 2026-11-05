import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { disposableDatabase } from './support.js';
export async function runUpgradeScenario(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  await check(
    'additive migrations preserve preexisting identity, credential and session records',
    async () => {
      const database = await disposableDatabase({ foundationOnly: true });
      const db = new Client({ connectionString: database.url });
      try {
        await db.connect();
        const passwordHash = await hashPassword('Upgrade-synthetic-password-2026!');
        const expiry = new Date(Date.now() + 86400000);
        await db.query(
          'INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,now())',
          ['upgrade-user', 'Upgrade Fixture', 'upgrade@example.com'],
        );
        await db.query(
          'INSERT INTO "Account" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
          ['upgrade-account', 'upgrade-user', 'credential', 'upgrade-user', passwordHash],
        );
        await db.query(
          'INSERT INTO "Session" (id,token,"userId","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,now())',
          ['upgrade-session', 'synthetic-session-token', 'upgrade-user', expiry],
        );
        await promisify(execFile)('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, DATABASE_URL: database.url, MIGRATION_DATABASE_URL: database.url },
        });
        const users = await db.query(
          'SELECT id,email,role,status,"preferredLanguage","twoFactorEnabled" FROM "User" WHERE id=$1',
          ['upgrade-user'],
        );
        assert.equal(users.rowCount, 1);
        assert.equal(users.rows[0].email, 'upgrade@example.com');
        assert.equal(users.rows[0].preferredLanguage, 'en');
        assert.equal(users.rows[0].twoFactorEnabled, false);
        assert.equal(
          (await db.query('SELECT password FROM "Account" WHERE id=$1', ['upgrade-account']))
            .rows[0].password,
          passwordHash,
        );
        const session = (
          await db.query('SELECT token,"expiresAt","mfaVerifiedAt" FROM "Session" WHERE id=$1', [
            'upgrade-session',
          ])
        ).rows[0];
        assert.equal(session.token, 'synthetic-session-token');
        assert.equal(session.expiresAt.toISOString(), expiry.toISOString());
        assert.equal(session.mfaVerifiedAt, null);
        assert.equal(
          await verifyPassword({
            hash: passwordHash,
            password: 'Upgrade-synthetic-password-2026!',
          }),
          true,
        );
        assert.equal(
          (await db.query('SELECT count(*)::int AS count FROM "CraftSkill"')).rows[0].count,
          5,
        );
      } finally {
        await db.end();
        await database.stop();
      }
    },
  );
}
