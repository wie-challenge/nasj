import 'reflect-metadata';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase } from './support.js';
import { runSecurityScenarios } from './security.scenarios.js';
logger.level = 'silent';
const database = await disposableDatabase();
const mail = await captureMail();
let total = 0;
try {
  await runSecurityScenarios({
    databaseUrl: database.url,
    smtpPort: mail.port,
    check: async (name, fn) => {
      await fn();
      total++;
      console.log(`PASS ${name}`);
    },
  });
  console.log(`Security HTTP scenarios passed: ${total}`);
} finally {
  await mail.stop();
  await database.stop();
}
