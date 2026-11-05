import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  encryptBackup,
  packDatabaseBackup,
  readBackupConfiguration,
  pruneExpiredBackups,
  readBackupKey,
  writePrivateBackup,
} from '../apps/api/src/operations/backup.js';
// Container uses its existing PostgreSQL authentication. No password or connection URL in argv/logs.
const {
  BACKUP_CONTAINER: container,
  BACKUP_DIRECTORY: directory,
  BACKUP_KEY_FILE: keyFile,
  BACKUP_CONFIG_FILE: configFile,
  BACKUP_DATABASE_USER: user = 'foundation_test',
  BACKUP_DATABASE_NAME: database = 'foundation_test',
} = process.env;
try {
  if (
    !container ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container) ||
    !directory ||
    !keyFile ||
    !/^[a-zA-Z0-9_]{1,63}$/.test(user) ||
    !/^[a-zA-Z0-9_]{1,63}$/.test(database)
  )
    throw Error('Invalid backup configuration.');
  const key = await readBackupKey(keyFile);
  const started = performance.now();
  const { stdout } = await promisify(execFile)(
    'docker',
    ['--context', 'default', 'exec', container, 'pg_dump', '-U', user, '-Fc', database],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
  );
  const configuration = configFile ? await readBackupConfiguration(configFile) : undefined;
  const payload = packDatabaseBackup(stdout, configuration);
  const encrypted = encryptBackup(payload, key);
  payload.fill(0);
  configuration?.fill(0);
  key.fill(0);
  stdout.fill(0);
  const filename = `backup-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.hcab`;
  await writePrivateBackup(join(directory, filename), encrypted);
  const expiredRemoved = await pruneExpiredBackups(directory);
  console.log(
    JSON.stringify({
      code: 'BACKUP_CREATED',
      configurationIncluded: Boolean(configFile),
      expiredRemoved,
      filename,
      encryptedBytes: encrypted.length,
      durationMs: Math.round(performance.now() - started),
    }),
  );
} catch {
  console.error(JSON.stringify({ code: 'BACKUP_FAILED' }));
  process.exitCode = 1;
}
