import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const values = parseEnv(await readFile(new URL('.local/demo.env', root), 'utf8'));
if (
  values.DEMO_MODE !== 'true' ||
  values.NODE_ENV !== 'development' ||
  values.PUBLIC_APP_URL !== 'http://127.0.0.1:3200' ||
  values.API_INTERNAL_URL !== 'http://127.0.0.1:3201' ||
  values.NEXT_DIST_DIR !== '.next-demo'
) {
  throw new Error('Run demo:setup to prepare the dedicated demo environment.');
}
// Load the environment before spawning Next. Passing --env-file to Next's Node
// process makes its worker forward that forbidden flag through NODE_OPTIONS.
const web = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('apps/web/node_modules/next/dist/bin/next', root)),
    'dev',
    fileURLToPath(new URL('apps/web', root)),
    '--hostname',
    '127.0.0.1',
    '--port',
    '3200',
  ],
  { cwd: fileURLToPath(root), env: { ...process.env, ...values }, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => web.kill(signal));
}
web.on('error', () => {
  console.error('Unable to start the demo web process.');
  process.exitCode = 1;
});
web.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
