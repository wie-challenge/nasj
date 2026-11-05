import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { assertLocalDevelopment } from './local-development.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = new URL('../.local/', import.meta.url);
const lockPath = new URL('dev.lock', local);
const children = new Set<ChildProcess>();
const processGroups = new Set<number>();
let stopping = false;
let lockOwned = false;
let finish: (() => void) | undefined;
let environment = process.env;

async function lock() {
  await mkdir(local, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(lockPath, 'wx', 0o600);
      await file.writeFile(String(process.pid));
      await file.close();
      lockOwned = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(await readFile(lockPath, 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          throw new Error('NASJ is already starting or running. Use http://localhost:3000.');
        } catch (probe) {
          if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe;
        }
      }
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error('Another startup is initializing its lock. Retry shortly.');
      await unlink(lockPath);
    }
  }
  throw new Error('Unable to acquire the local startup lock.');
}
function signalChildren(signal: NodeJS.Signals) {
  if (process.platform === 'win32') {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    return;
  }
  for (const pid of processGroups) {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  signalChildren('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  signalChildren('SIGKILL');
  finish?.();
}
function start(command: string, args: string[], cwd = root) {
  if (stopping) throw new Error('Startup cancelled.');
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    // Windows exposes pnpm as a .cmd shim, which Node only launches through a shell.
    // Arguments are fixed literals in this file, never user input.
    shell: process.platform === 'win32' && command === 'pnpm',
  });
  children.add(child);
  if (child.pid) processGroups.add(child.pid);
  child.once('exit', () => children.delete(child));
  return child;
}
async function run(command: string, args: string[], cwd = root) {
  const child = start(command, args, cwd);
  await new Promise<void>((resolve, reject) => {
    child.once('error', () => reject(new Error(`Unable to start ${command}.`)));
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} preparation step failed. Review the output above.`)),
    );
  });
  if (child.pid) processGroups.delete(child.pid);
}
async function localServices() {
  type Probe = {
    connect(): Promise<void>;
    query(sql: string): Promise<unknown>;
    end(): Promise<void>;
  };
  const { Client } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg') as {
    Client: new (options: {
      connectionString: string | undefined;
      connectionTimeoutMillis: number;
    }) => Probe;
  };
  const database = new Client({
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  let postgres = false;
  try {
    await database.connect();
    await database.query('SELECT 1');
    postgres = true;
  } catch {
  } finally {
    await database.end().catch(() => {});
  }
  let mailpit = false;
  try {
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- local Mailpit check on loopback
    const response = await fetch('http://127.0.0.1:8026/api/v1/info', {
      signal: AbortSignal.timeout(1500),
    });
    const info = (await response.json()) as { Version?: unknown };
    mailpit = response.ok && typeof info.Version === 'string';
  } catch {}
  return { postgres, mailpit };
}
async function checkPort(port: number) {
  const probe = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, () => probe.close(() => resolve()));
    });
  } catch {
    throw new Error(
      `Port ${port} is already occupied. Stop the previous project server, then run pnpm dev again; the launcher will not terminate an unrelated process.`,
    );
  }
}
async function ready(url: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (stopping || child.exitCode !== null || child.signalCode !== null)
      throw new Error('Application exited during startup.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'manual' });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Application readiness timed out. Review the service output above.');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}
try {
  if (process.env.NODE_ENV === 'production')
    throw new Error(
      'pnpm dev is a local development entrypoint. Use the production deployment procedure.',
    );
  await lock();
  await checkPort(3000);
  await checkPort(3001);
  await run('pnpm', ['setup:local']);
  const values = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
  assertLocalDevelopment(values);
  // Preparation, API, browser rewrite and server rendering use the same explicit environment.
  environment = {
    ...process.env,
    ...values,
    MIGRATION_DATABASE_URL: values.DATABASE_URL,
    NEXT_DIST_DIR: '.next',
    NODE_ENV: 'development',
    DEMO_MODE: 'false',
    API_HOST: '127.0.0.1',
    API_PORT: '3001',
    API_INTERNAL_URL: 'http://127.0.0.1:3001',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1026',
  };
  console.log('Preparing NASJ local services and accounts…');
  const services = await localServices();
  const missing = [!services.postgres ? 'postgres' : '', !services.mailpit ? 'mailpit' : ''].filter(
    Boolean,
  );
  if (missing.length)
    await run('docker', [
      '--context',
      'default',
      'compose',
      '-p',
      'nasj',
      'up',
      '-d',
      '--wait',
      ...missing,
    ]);
  else console.log('Reusing the healthy PostgreSQL and Mailpit services configured in .env.');
  await run('pnpm', ['--filter', '@nasj/contracts', 'build']);
  await run('pnpm', ['db:generate']);
  await run('pnpm', ['db:migrate']);
  await run('pnpm', [
    'exec',
    'tsx',
    '--tsconfig',
    'apps/api/tsconfig.json',
    'scripts/seed-local.ts',
  ]);
  const api = start(process.execPath, [
    fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
    'watch',
    '--tsconfig',
    'apps/api/tsconfig.json',
    'apps/api/src/main.ts',
  ]);
  const watchFailure = (child: ChildProcess) => {
    child.once('error', () => {
      if (!stopping) {
        process.exitCode = 1;
        void shutdown();
      }
    });
    child.once('exit', () => {
      if (!stopping) {
        process.exitCode = 1;
        void shutdown();
      }
    });
  };
  watchFailure(api);
  await ready('http://127.0.0.1:3001/api/health/ready', api);
  const web = start(process.execPath, [
    fileURLToPath(new URL('../apps/web/node_modules/next/dist/bin/next', import.meta.url)),
    'dev',
    'apps/web',
    '--hostname',
    'localhost',
    '--port',
    '3000',
  ]);
  watchFailure(web);
  await ready('http://localhost:3000', web);
  console.log(
    '\nNASJ ready: http://localhost:3000\nAccounts: .local/dev-credentials.json\nMail inbox: http://localhost:8026\nPress Ctrl+C to stop the API and web. Database records are preserved.\n',
  );
  await new Promise<void>((resolve) => {
    finish = resolve;
    if (stopping) resolve();
  });
} catch (error) {
  if (!stopping) {
    console.error(error instanceof Error ? error.message : 'Unable to start local development.');
    process.exitCode = 1;
  }
  await shutdown();
} finally {
  if (lockOwned) await unlink(lockPath).catch(() => {});
}
