import { mkdtemp, readdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { SMTPServer } from 'smtp-server';
import { validateEnvironment } from '../src/config/env.js';
const exec = promisify(execFile);
export async function disposableDatabase(
  options: { foundationOnly?: boolean; demo?: boolean; throughMigration?: string } = {},
) {
  const name = `nasj-test-${randomBytes(8).toString('hex')}`;
  const databaseName = options.demo ? 'nasj_demo' : 'foundation_test';
  const password = randomBytes(24).toString('hex');
  await exec('docker', [
    '--context',
    'default',
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-e',
    'POSTGRES_USER=foundation_test',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    `POSTGRES_DB=${databaseName}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:17.7-alpine',
  ]);
  const stop = async () => {
    await exec('docker', ['--context', 'default', 'rm', '-f', '--volumes', name]).catch(() => {});
  };
  try {
    const { stdout } = await exec('docker', ['--context', 'default', 'port', name, '5432']);
    const port = Number(stdout.trim().split(':').at(-1));
    const url = `postgresql://foundation_test:${password}@127.0.0.1:${port}/${databaseName}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000 });
      try {
        await client.connect();
        await client.query('SELECT 1');
        ready = true;
        break;
      } catch {
      } finally {
        await client.end().catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Disposable database did not become ready.');
    const migrationOptions = {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url },
      maxBuffer: 1024 * 1024,
    };
    if (options.foundationOnly) {
      // Only in this newly created disposable container: establish the original migration baseline.
      await exec(
        'pnpm',
        [
          'exec',
          'prisma',
          'db',
          'execute',
          '--file',
          'prisma/migrations/202610150001_foundation/migration.sql',
        ],
        migrationOptions,
      );
      await exec(
        'pnpm',
        ['exec', 'prisma', 'migrate', 'resolve', '--applied', '202610150001_foundation'],
        migrationOptions,
      );
    } else if (options.throughMigration) {
      const directory = await mkdtemp(join(tmpdir(), 'nasj-migration-baseline-'));
      const migrationRoot = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
      const configPath = fileURLToPath(new URL(`../.migration-${name}.config.ts`, import.meta.url));
      try {
        for (const entry of await readdir(migrationRoot)) {
          if (entry === 'migration_lock.toml' || entry <= options.throughMigration)
            await cp(join(migrationRoot, entry), join(directory, entry), { recursive: true });
        }
        await writeFile(
          configPath,
          `import { defineConfig } from 'prisma/config'; export default defineConfig({schema:'prisma/schema.prisma',migrations:{path:${JSON.stringify(directory)}},datasource:{url:process.env.DATABASE_URL!}});`,
        );
        await exec(
          'pnpm',
          ['exec', 'prisma', 'migrate', 'deploy', '--config', configPath],
          migrationOptions,
        );
      } finally {
        await rm(configPath, { force: true });
        await rm(directory, { recursive: true, force: true });
      }
    } else await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], migrationOptions);
    return { url, stop, containerName: name };
  } catch (error) {
    await stop();
    throw error;
  }
}
export async function captureMail() {
  const messages: { to: string; text: string }[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    logger: false,
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', (chunk) => {
        raw += chunk.toString();
      });
      stream.on('end', () => {
        const split = raw.indexOf('\r\n\r\n');
        const header = raw.slice(0, split);
        let text = raw.slice(split + 4);
        if (/Content-Transfer-Encoding: base64/i.test(header))
          text = Buffer.from(text, 'base64').toString();
        else
          text = text
            .replace(/=\r?\n/g, '')
            .replace(/=([A-F0-9]{2})/g, (_m, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            );
        messages.push({ to: session.envelope.rcptTo[0].address, text });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as { port: number }).port;
  return {
    port,
    messages,
    stop: () => new Promise<void>((resolve) => server.close(resolve)),
    async token(email: string, path: string) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const mail = messages.findLast((m) => m.to === email && m.text.includes(path));
        const match = mail?.text.match(/#token=([^\s]+)/);
        if (match) return decodeURIComponent(match[1]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Expected authentication email was not received.');
    },
  };
}
export function testConfig(url: string, smtpPort: number, overrides: Record<string, unknown> = {}) {
  return validateEnvironment({
    NODE_ENV: 'test',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: smtpPort,
    RATE_LOGIN_MAX: 1000,
    RATE_REGISTRATION_MAX: 1000,
    RATE_RESET_MAX: 1000,
    RATE_VERIFICATION_MAX: 1000,
    RATE_API_MAX: 1000,
    RATE_ADMIN_MAX: 1000,
    ...overrides,
  });
}

export async function promoteDisposableAdmin(url: string, email: string) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const result = await db.query(
      'UPDATE "User" SET role=\'ADMIN\' WHERE email=$1 AND "emailVerified"=true RETURNING id',
      [email],
    );
    if (result.rowCount !== 1) throw new Error('A verified disposable account is required.');
    await db.query('DELETE FROM "Session" WHERE "userId"=$1', [result.rows[0].id]);
  } finally {
    await db.end();
  }
}

// Test control only: expire the visitor for one disposable scenario without handling raw cookies.
export async function expireDisposableDemoVisitor(url: string, scenarioId: string) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const result = await db.query(
      `UPDATE "DemoVisitor" v SET "expiresAt"=to_timestamp(0)
       FROM "DemoScenario" s WHERE s.id=$1 AND s."visitorId"=v.id RETURNING v.id`,
      [scenarioId],
    );
    if (result.rowCount !== 1) throw new Error('A disposable visitor scenario is required.');
  } finally {
    await db.end();
  }
}
