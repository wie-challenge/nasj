import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './common/logging.js';
try {
  const config = loadConfig();
  const app = await createApp({ config });
  await app.listen(config.API_PORT, config.API_HOST);
  logger.info({ port: config.API_PORT }, 'NASJ API ready');
} catch (error) {
  logger.error(
    { errorType: error instanceof Error ? error.name : 'Unknown' },
    'API startup failed; check environment and database readiness.',
  );
  process.exitCode = 1;
}
