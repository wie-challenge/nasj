import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, lstat, rm, writeFile, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.local', 'clean-verification');
await mkdir(output, { recursive: true, mode: 0o700 });
const cache = join(homedir(), '.cache');
await mkdir(cache, { recursive: true });
const source = await mkdtemp(join(cache, 'nasj-clean-'));
const commands = [
  ['install', '--frozen-lockfile'],
  ['setup:local'],
  ['db:generate'],
  ['lint'],
  ['typecheck'],
  ['test'],
  ['test:integration'],
  ['test:e2e'],
  ['audit', '--audit-level=high'],
  ['build'],
];
const results: { command: string; exitCode: number; durationMs: number; log: string }[] = [];
await writeFile(
  join(output, 'summary.json'),
  `${JSON.stringify({ status: 'RUNNING', passed: false, results }, null, 2)}\n`,
  { mode: 0o600 },
);
let child: ReturnType<typeof spawn> | undefined;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    interrupted = true;
    // Let the real test harness clean up its own disposable services before removing source files.
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  });
try {
  const { stdout } = await promisify(execFile)(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, maxBuffer: 4 * 1024 * 1024 },
  );
  for (const name of stdout.split('\0').filter(Boolean)) {
    if (isAbsolute(name) || name.split('/').includes('..')) throw Error('Invalid source path.');
    const path = join(root, name);
    const info = await lstat(path);
    if (!info.isFile()) throw Error('Clean verification requires regular source files.');
    await mkdir(join(source, name, '..'), { recursive: true });
    await cp(path, join(source, name));
  }
  for (const [index, args] of commands.entries()) {
    if (interrupted) throw Error('Clean verification interrupted.');
    const log = `${String(index + 1).padStart(2, '0')}-${args[0]}.log`;
    const handle = await open(join(output, log), 'w', 0o600);
    const started = performance.now();
    // Do not inherit the earlier installed-workspace verification workaround or a database URL.
    const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
    for (const key of [
      'pnpm_config_verify_deps_before_run',
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'NEXT_DIST_DIR',
      'API_INTERNAL_URL',
      'NODE_ENV',
      'TSX_TSCONFIG_PATH',
      'INIT_CWD',
      'PNPM_SCRIPT_SRC_DIR',
    ])
      delete environment[key];
    let exitCode: number;
    try {
      child = spawn('pnpm', args, {
        cwd: source,
        env: environment,
        detached: true,
        stdio: ['ignore', handle.fd, handle.fd],
      });
      exitCode = await new Promise<number>((resolve, reject) => {
        child!.once('error', reject);
        child!.once('close', (code) => resolve(code ?? 1));
      });
    } finally {
      child = undefined;
      await handle.close();
    }
    const result = {
      command: `pnpm ${args.join(' ')}`,
      exitCode,
      durationMs: Math.round(performance.now() - started),
      log,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    if (exitCode !== 0)
      throw Error(`Clean verification failed at ${args[0]}. See .local/clean-verification/${log}.`);
  }
} catch (failure) {
  console.error(failure instanceof Error ? failure.message : 'Clean verification failed.');
  process.exitCode = 1;
} finally {
  await writeFile(
    join(output, 'summary.json'),
    `${JSON.stringify(
      {
        source: 'CURRENT_WORKTREE_WITHOUT_IGNORED_FILES',
        ordinaryFrozenInstall: true,
        disposableDatabase: true,
        results,
        passed: results.length === commands.length && results.every((r) => r.exitCode === 0),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await rm(source, { recursive: true, force: true });
}
