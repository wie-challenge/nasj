import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const local = new URL('../.local/', import.meta.url);
const environmentFile = new URL('demo.env', local);
try {
  await mkdir(local, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString('hex');
  const content = [
    'NODE_ENV=development',
    'DEMO_MODE=true',
    'PUBLIC_APP_URL=http://127.0.0.1:3200',
    'API_HOST=127.0.0.1',
    'API_PORT=3201',
    'API_INTERNAL_URL=http://127.0.0.1:3201',
    'NEXT_DIST_DIR=.next-demo',
    `POSTGRES_PASSWORD=${password}`,
    `DATABASE_URL=postgresql://nasj_demo:${password}@127.0.0.1:5542/nasj_demo`,
    `MIGRATION_DATABASE_URL=postgresql://nasj_demo:${password}@127.0.0.1:5542/nasj_demo`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}`,
    'REQUIRE_PRIVILEGED_MFA=false',
    'ARCJET_ENABLED=false',
    'ARCJET_MODE=DRY_RUN',
    'ARCJET_FAILURE_MODE=closed',
    'TRUST_PROXY=',
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=1126',
    'SMTP_SECURE=false',
    'SMTP_REQUIRE_TLS=false',
    'SMTP_USER=',
    'SMTP_PASSWORD=',
    'EMAIL_FROM=NASJ Demo <noreply@nasj-demo.invalid>',
    'LOG_LEVEL=silent',
    '',
  ].join('\n');
  try {
    await writeFile(environmentFile, content, { flag: 'wx', mode: 0o600 });
    console.log('Created dedicated .local/demo.env with separate random secrets.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    console.log('Preserved existing .local/demo.env and its secrets.');
  }
  await chmod(environmentFile, 0o600);
  const values = parseEnv(await readFile(environmentFile, 'utf8'));
  const database = new URL(values.DATABASE_URL ?? '');
  if (
    values.DEMO_MODE !== 'true' ||
    values.NODE_ENV === 'production' ||
    database.pathname !== '/nasj_demo' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '5542' ||
    database.username !== 'nasj_demo' ||
    values.PUBLIC_APP_URL !== 'http://127.0.0.1:3200' ||
    values.API_PORT !== '3201' ||
    values.SMTP_PORT !== '1126' ||
    values.NEXT_DIST_DIR !== '.next-demo'
  )
    throw new Error('Dedicated demo environment does not match isolation requirements.');
  // Prevent inherited migration credentials or deployment variables choosing another database.
  const env = { ...process.env, ...values, MIGRATION_DATABASE_URL: values.DATABASE_URL };
  await exec(
    'docker',
    [
      '--context',
      'default',
      'compose',
      '--env-file',
      fileURLToPath(environmentFile),
      '-f',
      'docker-compose.demo.yml',
      '-p',
      'nasj-demo',
      'up',
      '-d',
      '--wait',
    ],
    { cwd: root, env, maxBuffer: 1024 * 1024 },
  );
  console.log('Separate demo PostgreSQL and mail capture are ready.');
  await exec('pnpm', ['--filter', '@nasj/contracts', 'build'], { cwd: root, env });
  await exec('pnpm', ['--filter', '@nasj/api', 'db:generate'], { cwd: root, env });
  await exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
    env,
    maxBuffer: 1024 * 1024,
  });
  console.log('Applied additive migrations to the dedicated demo database.');
  await exec(
    'pnpm',
    ['exec', 'tsx', '--tsconfig', 'apps/api/tsconfig.json', 'scripts/seed-demo.ts'],
    {
      cwd: root,
      env,
      maxBuffer: 1024 * 1024,
    },
  );
  console.log(
    'Demo identities are ready. Credentials remain in .local/demo-credentials.json (mode 0600).',
  );
  console.log('Start the dedicated API and web commands documented in ../docs/demo-identity.md.');
} catch (error) {
  console.error(
    `Demo setup failed (${error instanceof Error ? error.name : 'UnknownError'}). Existing environment and database records were preserved; inspect dedicated service health and ../docs/demo-identity.md.`,
  );
  process.exitCode = 1;
}
