import { seedBrowserProductFixture } from '../../apps/api/test/product-authority.fixture';
import { seedBrowserCommercialFixture } from '../../apps/api/test/commercial.fixture';
import { seedBrowserProductionFixture } from '../../apps/api/test/production.fixture';
import { seedBrowserFeedbackFixture } from '../../apps/api/test/order-feedback.fixture';
import { seedBrowserBatch5Fixture } from '../../apps/api/test/batch5.fixture';
import { seedBrowserDirectoryFixture } from '../../apps/api/test/directory.fixture';
import {
  seedBrowserCapacityFixture,
  seedBrowserCommerceFixture,
} from '../../apps/api/test/commerce.fixture';
import { promisify } from 'node:util';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  captureMail,
  disposableDatabase,
  promoteDisposableAdmin,
  expireDisposableDemoVisitor,
  testConfig,
} from '../../apps/api/test/support';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function free(port: number) {
  const server = netServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}
export default async function setup() {
  return runBrowserSetup();
}
export async function runBrowserSetup(options: { demo?: boolean; feedbackRateMax?: number } = {}) {
  await free(3100);
  await free(3101);
  const database = await disposableDatabase({ demo: options.demo });
  const mail = await captureMail();
  const children: ChildProcess[] = [];
  let log = '';
  const nonce = randomBytes(24).toString('hex');
  const control = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (!url.pathname.startsWith(`/${nonce}/`)) {
        res.writeHead(404).end();
        return;
      }
      const email = url.searchParams.get('email') ?? '';
      if (url.pathname.endsWith('/token')) {
        const token = await mail.token(
          email,
          url.searchParams.get('kind') === 'reset'
            ? '/auth/reset-password'
            : url.searchParams.get('kind') === 'invitation'
              ? '/invitations/accept'
              : '/auth/verify-email',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ token }));
      } else if (
        options.demo &&
        url.pathname.endsWith('/expire-demo-visitor') &&
        req.method === 'POST'
      ) {
        await expireDisposableDemoVisitor(database.url, url.searchParams.get('scenarioId') ?? '');
        res.end('{}');
      } else if (url.pathname.endsWith('/promote') && req.method === 'POST') {
        await promoteDisposableAdmin(database.url, email);
        res.end('{}');
      } else if (url.pathname.endsWith('/product-authority-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserProductFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/commerce-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserCommerceFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/directory-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserDirectoryFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/batch5-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserBatch5Fixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/production-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserProductionFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/feedback-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserFeedbackFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
          url.searchParams.get('buyer') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/commercial-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserCommercialFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/capacity-fixture') && req.method === 'POST') {
        const fixture = await seedBrowserCapacityFixture(
          database.url,
          url.searchParams.get('suffix') ?? '',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixture));
      } else if (url.pathname.endsWith('/run-worker') && req.method === 'POST') {
        // Loopback nonce test control only; not registered in the production app.
        await promisify(execFile)(
          process.execPath,
          [
            `${root}node_modules/tsx/dist/cli.mjs`,
            '--tsconfig',
            `${root}apps/api/tsconfig.json`,
            'apps/api/src/jobs/main.ts',
            '--once',
          ],
          { cwd: root, env: { ...process.env, ...environment } },
        );
        res.setHeader('Content-Type', 'application/json');
        res.end('{}');
      } else res.writeHead(404).end();
    } catch (error) {
      process.stderr.write(`Browser fixture failure: ${String(error)}\n`);
      res.writeHead(500).end('Test fixture failed.');
    }
  });
  await new Promise<void>((resolve) => control.listen(0, '127.0.0.1', resolve));
  process.env.E2E_CONTROL_URL = `http://127.0.0.1:${(control.address() as { port: number }).port}/${nonce}`;
  const config = testConfig(database.url, mail.port, {
    PUBLIC_APP_URL: 'http://127.0.0.1:3100',
    DEMO_MODE: options.demo ? 'true' : 'false',
    API_PORT: 3101,
    LOG_LEVEL: 'silent',
    // The browser suite shares one loopback client address, so the dedicated showroom-feedback
    // bucket is raised for the harness only. Production defaults stay conservative (env.ts).
    RATE_FEEDBACK_MAX: options.feedbackRateMax ?? 500,
  });
  const environment = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(',') : String(value ?? ''),
    ]),
  );
  function start(command: string, args: string[], cwd: string, extra: Record<string, string> = {}) {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment, ...extra },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (chunk) => {
        log = (log + chunk.toString()).slice(-12000);
      });
    children.push(child);
    return child;
  }
  async function wait(url: string, child: ChildProcess) {
    for (let n = 0; n < 120; n++) {
      if (child.exitCode !== null) throw new Error(`Test service exited. ${log}`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Test service did not start. ${log}`);
  }
  async function cleanup() {
    for (const child of children.reverse()) {
      if (child.exitCode === null && child.pid) {
        try {
          if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch {}
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    await new Promise<void>((resolve) => control.close(() => resolve()));
    await mail.stop();
    await database.stop();
  }
  try {
    const api = start(
      process.execPath,
      [
        `${root}node_modules/tsx/dist/cli.mjs`,
        '--tsconfig',
        `${root}apps/api/tsconfig.json`,
        'apps/api/src/main.ts',
      ],
      root,
    );
    await wait('http://127.0.0.1:3101/api/health/ready', api);
    const webEnv = {
      NODE_ENV: 'production',
      API_INTERNAL_URL: 'http://127.0.0.1:3101',
      NEXT_DIST_DIR: options.demo ? '.next-showroom-e2e' : '.next-e2e',
    };
    const build = start(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'build'],
      `${root}apps/web`,
      webEnv,
    );
    await new Promise<void>((resolve, reject) => {
      build.once('error', reject);
      build.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Browser build failed. ${log}`)),
      );
    });
    const web = start(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--port', '3100'],
      `${root}apps/web`,
      webEnv,
    );
    await wait('http://127.0.0.1:3100', web);
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
