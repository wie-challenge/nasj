import 'reflect-metadata';
import { logger } from '../src/common/logging.js';
import { runDemoScenarios } from './demo.scenarios.js';
logger.level = 'error';
await runDemoScenarios(async (name, fn) => {
  await fn();
  console.log(`PASS ${name}`);
});
