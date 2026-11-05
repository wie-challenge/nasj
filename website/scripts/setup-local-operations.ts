import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseEnv } from 'node:util';
import { assertLocalDevelopment } from './local-development.js';
import { userUnits } from '../apps/api/src/operations/local-runner.js';
import { readBackupKey } from '../apps/api/src/operations/backup.js';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const mode = process.argv[2] ?? '--prepare';
if (!['--prepare', '--enable', '--disable'].includes(mode) || process.argv.length > 3)
  throw Error('Use --prepare, --enable or --disable.');
const exec = promisify(execFile);
const timers = ['nasj-local-backup.timer', 'nasj-local-health.timer'];
if (mode === '--disable') {
  await exec('systemctl', ['--user', 'disable', '--now', ...timers]);
  console.log('Local NASJ timers disabled; backups and keys preserved.');
} else {
  assertLocalDevelopment(parseEnv(await readFile(join(root, '.env'), 'utf8')));
  const operations = join(root, '.local', 'operations');
  const backups = join(root, '.local', 'backups');
  const keys = join(root, '.local', 'backup-keys');
  for (const path of [operations, backups, keys]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o077) !== 0
    )
      throw Error('Private owned operations/backup/key directories required.');
  }
  const key = join(keys, 'demo.key');
  try {
    await writeFile(key, randomBytes(32), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  (await readBackupKey(key)).fill(0);
  const env = join(operations, 'schedule.env');
  const config = `BACKUP_CONTAINER=nasj-postgres-1\nBACKUP_DIRECTORY=${backups}\nBACKUP_KEY_FILE=${key}\nBACKUP_DATABASE_USER=nasj\nBACKUP_DATABASE_NAME=nasj\nBACKUP_CONFIG_FILE=${root}/.env\n`;
  const units = userUnits(root, process.execPath, env);
  // Keep preparation in the private project directory for review before host installation.
  const prepared = join(operations, 'units');
  await mkdir(prepared, { recursive: true, mode: 0o700 });
  try {
    await writeFile(env, config, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(env);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o077) !== 0
    )
      throw Error('Private owned operations configuration required.');
    const existing = await readFile(env, 'utf8');
    if (existing !== config) {
      if (existing !== config.replace(`BACKUP_CONFIG_FILE=${root}/.env\n`, ''))
        throw Error(
          'Existing customized operations configuration requires review; it was preserved.',
        );
      await writeFile(env, config, { mode: 0o600 }); // Exact managed v1 configuration migration only.
    }
  }
  for (const [name, contents] of Object.entries(units))
    await writeFile(join(prepared, name), contents, { mode: 0o600 });
  await exec('systemd-analyze', [
    '--user',
    'verify',
    ...Object.keys(units).map((name) => join(prepared, name)),
  ]);
  if (mode === '--enable') {
    const destination = join(homedir(), '.config', 'systemd', 'user');
    await mkdir(destination, { recursive: true });
    for (const [name, contents] of Object.entries(units)) {
      const path = join(destination, name);
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.())
          throw Error('Owned regular user units required.');
        const existing = await readFile(path, 'utf8');
        if (!existing.startsWith('# NASJ managed local-demo unit v1\n'))
          throw Error('Refusing to replace an unmanaged user unit.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await writeFile(path, contents, { mode: 0o644 });
    }
    await exec('systemctl', ['--user', 'daemon-reload']);
    await exec('systemctl', ['--user', 'enable', '--now', ...timers]);
    console.log('Local backup and health timers enabled. Status and alerts: .local/operations/.');
  } else
    console.log(
      'Prepared validated local user units in .local/operations/units; use --enable to install.',
    );
}
