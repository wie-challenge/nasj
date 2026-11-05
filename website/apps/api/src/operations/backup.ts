import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const ARCHIVE_NAME = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9-]{36}\.hcab$/;
const MAGIC = Buffer.from('HCAB1');
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
/** Versioned authenticated encryption; tampering/wrong key never yields a restore archive. */
export function encryptBackup(archive: Buffer, key: Buffer) {
  if (key.length !== 32 || !archive.length || archive.length > MAX_ARCHIVE_BYTES)
    throw Error('Invalid backup bounds.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}
export function decryptBackup(envelope: Buffer, key: Buffer) {
  if (
    key.length !== 32 ||
    envelope.length <= 33 ||
    envelope.length > MAX_ARCHIVE_BYTES + 33 ||
    !envelope.subarray(0, 5).equals(MAGIC)
  )
    throw Error('Invalid encrypted backup.');
  const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(5, 17), {
    authTagLength: 16,
  });
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(envelope.subarray(17, 33));
  return Buffer.concat([decipher.update(envelope.subarray(33)), decipher.final()]);
}
export async function readBackupKey(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size !== 32
    )
      throw Error('Backup key must be a private owned 32-byte regular file.');
    return await file.readFile();
  } finally {
    await file.close();
  }
}
export async function writePrivateBackup(path: string, encrypted: Buffer) {
  const parent = dirname(resolve(path));
  const stat = await lstat(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    (await realpath(parent)) !== parent
  )
    throw Error('Backup directory must be private, owned and contain no symlinks.');
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(encrypted);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Prune only this tool's private encrypted archives, after a new backup succeeds. */
export async function pruneExpiredBackups(directory: string, now = Date.now()) {
  const { readdir, unlink } = await import('node:fs/promises');
  const parent = resolve(directory);
  const stat = await lstat(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    (await realpath(parent)) !== parent
  )
    throw Error('Private backup directory required.');
  let removed = 0;
  for (const name of await readdir(parent)) {
    if (!ARCHIVE_NAME.test(name)) continue;
    const path = resolve(parent, name);
    const info = await lstat(path);
    if (
      info.isFile() &&
      info.uid === process.getuid?.() &&
      (info.mode & 0o077) === 0 &&
      info.mtimeMs < now - 7 * 86400000
    ) {
      await unlink(path);
      removed++;
    }
  }
  return removed;
}

export async function backupStatus(directory: string, now = Date.now()) {
  const { readdir } = await import('node:fs/promises');
  const parent = resolve(directory);
  const stat = await lstat(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    (await realpath(parent)) !== parent
  )
    throw Error('Private backup directory required.');
  let latest = 0;
  let count = 0;
  for (const name of await readdir(parent)) {
    if (!ARCHIVE_NAME.test(name)) continue;
    const info = await lstat(resolve(parent, name));
    if (
      info.isFile() &&
      info.uid === process.getuid?.() &&
      (info.mode & 0o077) === 0 &&
      info.size > 33
    ) {
      latest = Math.max(latest, info.mtimeMs);
      count++;
    }
  }
  return { count, ageMs: count ? Math.max(0, now - latest) : null };
}

const BUNDLE_MAGIC = Buffer.from('HCABCFG1');
const MAX_CONFIG_BYTES = 1024 * 1024;
export async function readBackupConfiguration(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o077) !== 0 ||
      info.size < 1 ||
      info.size > MAX_CONFIG_BYTES
    )
      throw Error('Private bounded configuration file required.');
    return await file.readFile();
  } finally {
    await file.close();
  }
}
/** Payload v2 preserves private runtime configuration; legacy pg_dump payloads remain readable. */
export function packDatabaseBackup(database: Buffer, configuration?: Buffer) {
  if (!database.subarray(0, 5).equals(Buffer.from('PGDMP')))
    throw Error('Custom PostgreSQL archive required.');
  if (!configuration) return database;
  if (!configuration.length || configuration.length > MAX_CONFIG_BYTES)
    throw Error('Invalid configuration bounds.');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(configuration.length);
  return Buffer.concat([BUNDLE_MAGIC, size, configuration, database]);
}
export function unpackDatabaseBackup(payload: Buffer) {
  if (payload.subarray(0, 5).equals(Buffer.from('PGDMP')))
    return { version: 1, database: payload, configuration: null };
  if (!payload.subarray(0, 8).equals(BUNDLE_MAGIC) || payload.length < 17)
    throw Error('Invalid backup payload.');
  const size = payload.readUInt32BE(8);
  if (!size || size > MAX_CONFIG_BYTES || payload.length < 12 + size + 5)
    throw Error('Invalid configuration bounds.');
  const database = payload.subarray(12 + size);
  if (!database.subarray(0, 5).equals(Buffer.from('PGDMP')))
    throw Error('Invalid database archive.');
  return { version: 2, database, configuration: payload.subarray(12, 12 + size) };
}
