import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: process.env['CI'] === 'true' ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3111',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/server.mjs',
    url: 'http://127.0.0.1:3111/healthz',
    reuseExistingServer: process.env['CI'] !== 'true',
    timeout: 90_000,
  },
})
