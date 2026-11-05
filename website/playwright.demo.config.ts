import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/demo-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 240000,
  globalSetup: './tests/demo-e2e/setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
  },
  reporter: [['list'], ['json', { outputFile: '.local/showroom-e2e-report.json' }]],
});
