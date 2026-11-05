/** The one-command launcher is deliberately limited to this project's local services. */
export function assertLocalDevelopment(values: Record<string, string | undefined>) {
  let database: URL;
  try {
    database = new URL(values.DATABASE_URL ?? '');
  } catch {
    throw new Error('The local DATABASE_URL is invalid. Run pnpm setup:local.');
  }
  if (
    values.NODE_ENV !== 'development' ||
    values.DEMO_MODE === 'true' ||
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '5442' ||
    database.pathname !== '/nasj' ||
    database.username !== 'nasj' ||
    database.search ||
    database.hash ||
    values.PUBLIC_APP_URL !== 'http://localhost:3000' ||
    (values.API_HOST ?? '127.0.0.1') !== '127.0.0.1' ||
    (values.API_PORT ?? '3001') !== '3001' ||
    (values.API_INTERNAL_URL ?? 'http://127.0.0.1:3001') !== 'http://127.0.0.1:3001' ||
    (values.SMTP_HOST ?? '127.0.0.1') !== '127.0.0.1' ||
    values.SMTP_PORT !== '1026'
  ) {
    throw new Error(
      'pnpm dev requires the local development configuration: localhost:3000, API 3001, PostgreSQL nasj at 127.0.0.1:5442 and local SMTP 1026. Production and remote databases cannot be seeded by this launcher.',
    );
  }
}
