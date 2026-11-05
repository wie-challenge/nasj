import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const target = new URL('../.env', import.meta.url);
const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const password = randomBytes(24).toString('hex');
try {
  await writeFile(
    target,
    template
      .replaceAll('replace_with_random_hex', password)
      .replace('generate_48_or_more_random_characters', randomBytes(48).toString('hex')),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Created .env with random local secrets. Existing databases were not accessed.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  console.log('Existing .env preserved.');
}
