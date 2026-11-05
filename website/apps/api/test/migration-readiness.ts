import 'reflect-metadata';
import { runMigrationReadinessScenario } from './migration-readiness.scenarios.js';
await runMigrationReadinessScenario(async (name, fn) => {
  await fn();
  console.log(`PASS ${name}`);
});
