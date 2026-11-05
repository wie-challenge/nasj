import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  LOCAL_JOBS,
  type LocalJob,
  runLocalOperation,
  writeOperationStatus,
} from '../apps/api/src/operations/local-runner.js';
const job = process.argv[2];
if (!LOCAL_JOBS.includes(job as LocalJob) || process.argv.length !== 3)
  throw Error('Use backup or health.');
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const result = await runLocalOperation(root, job as LocalJob);
  await writeOperationStatus(join(root, '.local', 'operations'), result);
  console.log(JSON.stringify(result));
  process.exitCode = result.alerts.length ? 1 : 0;
} catch {
  console.error(JSON.stringify({ code: 'LOCAL_OPERATION_FAILED' }));
  process.exitCode = 1;
}
