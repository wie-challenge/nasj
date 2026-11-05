import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
export const LOCAL_JOBS = ['backup', 'health'] as const;
export type LocalJob = (typeof LOCAL_JOBS)[number];
const ALERT_CODES = new Set([
  'API_NOT_READY',
  'OUTBOX_FAILED',
  'OUTBOX_LAG',
  'DATABASE_UNAVAILABLE',
  'BACKUP_FAILED',
  'BACKUP_MISSING',
  'BACKUP_STALE',
  'BACKUP_UNAVAILABLE',
  'OPERATION_FAILED',
]);
export function operationResult(job: LocalJob, exitCode: number, stdout: string) {
  let value: { code?: string; alerts?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed;
  } catch {
    /* Never publish arbitrary process output. */
  }
  const alerts = Array.isArray(value.alerts)
    ? value.alerts.filter(
        (code): code is string => typeof code === 'string' && ALERT_CODES.has(code),
      )
    : [];
  const success =
    exitCode === 0 &&
    (job === 'backup'
      ? value.code === 'BACKUP_CREATED'
      : Array.isArray(value.alerts) && value.alerts.length === 0);
  if (!success && !alerts.length)
    alerts.push(job === 'backup' ? 'BACKUP_FAILED' : 'OPERATION_FAILED');
  return {
    job,
    code: success ? 'OPERATION_OK' : 'OPERATION_FAILED',
    alerts,
    timestamp: new Date().toISOString(),
  };
}
export async function runLocalOperation(root: string, job: LocalJob) {
  const script = job === 'backup' ? 'backup-database.ts' : 'check-operations.ts';
  let stdout = '',
    exitCode = 0;
  try {
    ({ stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts', script)],
      {
        cwd: root,
        env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'apps/api/tsconfig.json') },
        timeout: job === 'backup' ? 130000 : 30000,
        maxBuffer: 65536,
      },
    ));
  } catch (failure) {
    const error = failure as { stdout?: string; code?: number };
    stdout = error.stdout ?? '';
    exitCode = typeof error.code === 'number' ? error.code : 1;
  }
  return operationResult(job, exitCode, stdout);
}
/** Latest status plus a bounded, private local alert stream; no external messages. */
export async function writeOperationStatus(
  directory: string,
  result: ReturnType<typeof operationResult>,
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    throw Error('Private owned operations directory required.');
  const latest = join(directory, `${result.job}.json`);
  const temporary = `${latest}.${process.pid}.tmp`;
  const file = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(result)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, latest);
  if (result.alerts.length) {
    const alerts = await open(
      join(directory, 'alerts.ndjson'),
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const stat = await alerts.stat();
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
        throw Error('Private owned alert file required.');
      if (stat.size > 1024 * 1024) await alerts.truncate(0);
      await alerts.writeFile(`${JSON.stringify(result)}\n`);
    } finally {
      await alerts.close();
    }
  }
}
export function userUnits(root: string, node: string, envFile: string) {
  // Reject control/specifier/substitution characters instead of interpreting them in systemd commands.
  for (const path of [root, node, envFile])
    if (!/^\/[a-zA-Z0-9_./:@-]+$/.test(path))
      throw Error('Use absolute plain paths for local user units.');
  const service = (job: LocalJob) => `# NASJ managed local-demo unit v1
[Unit]
Description=NASJ local ${job}
${job === 'health' ? `ConditionPathExists=${root}/.local/dev.lock\n` : ''}[Service]
Type=oneshot
WorkingDirectory=${root}
UMask=0077
Environment=TSX_TSCONFIG_PATH=${root}/apps/api/tsconfig.json
ExecStart=${node} --env-file=${root}/.env --env-file=${envFile} --import tsx ${root}/scripts/run-local-operation.ts ${job}
TimeoutStartSec=${job === 'backup' ? '150' : '45'}
`;
  return {
    'nasj-local-backup.service': service('backup'),
    'nasj-local-health.service': service('health'),
    'nasj-local-backup.timer': `# NASJ managed local-demo unit v1
[Unit]
Description=Daily local NASJ encrypted backup
[Timer]
OnCalendar=daily
Persistent=true
Unit=nasj-local-backup.service
[Install]
WantedBy=timers.target
`,
    'nasj-local-health.timer': `# NASJ managed local-demo unit v1
[Unit]
Description=Local NASJ health and backup freshness
[Timer]
OnCalendar=*:0/5
Unit=nasj-local-health.service
[Install]
WantedBy=timers.target
`,
  };
}
