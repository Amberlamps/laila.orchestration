// Playwright configuration for multi-browser E2E testing.
// Configures Chromium, Firefox, and WebKit projects with parallel
// execution, screenshot/video on failure, and HTML reporting.
import { defineConfig, devices } from '@playwright/test';

// Base URL for the local development server.
// Override with PLAYWRIGHT_BASE_URL env var for CI environments.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  // Root directory for all E2E test files.
  testDir: './e2e',

  // Run the global auth setup before any tests execute.
  // This creates an authenticated storage state that is reused
  // by all browser projects, avoiding per-test sign-in flows.
  globalSetup: './e2e/global-setup.ts',

  // Run tests in parallel across workers for faster execution.
  // Each worker runs in an isolated browser context.
  fullyParallel: true,

  // Fail the build on CI if test.only() is accidentally left in source code.
  forbidOnly: !!process.env.CI,

  // Retry failed tests once on CI to handle flaky network conditions.
  retries: process.env.CI ? 1 : 0,

  // Limit parallelism on CI to avoid resource contention.
  // Locally, use all available CPU cores.
  ...(process.env.CI ? { workers: 2 } : {}),

  // HTML reporter generates a browsable test results report.
  // On CI, also output a list format for log readability.
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['html', { open: 'on-failure' }]],

  // Shared settings applied to all browser projects.
  use: {
    // Base URL simplifies navigation: page.goto("/dashboard") instead of full URL.
    baseURL: BASE_URL,

    // Reuse the authenticated storage state created by globalSetup.
    // Every test starts with a signed-in session automatically.
    storageState: 'e2e/.auth/storage-state.json',

    // Capture a screenshot when a test fails for debugging.
    screenshot: 'only-on-failure',

    // Record a video when a test fails for step-by-step replay.
    video: 'retain-on-failure',

    // Capture the full page trace on first retry for deep debugging.
    trace: 'on-first-retry',

    // Default timeout for actions (clicks, fills, etc.).
    actionTimeout: 10_000,

    // Default timeout for navigation operations.
    navigationTimeout: 15_000,
  },

  // Browser projects: run every test in Chromium, Firefox, and WebKit.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start the Next.js dev server before running tests.
  // Playwright waits until the server responds with 200 on the base URL.
  // NEXT_PUBLIC_API_MOCKING enables the MSW service worker in the browser
  // so all API requests are intercepted by the mock handlers.
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 minutes for Next.js cold start
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_API_MOCKING: 'enabled',
    },
  },

  // Global timeout per test (30 seconds).
  timeout: 30_000,

  // Timeout for expect() assertions.
  expect: {
    timeout: 5_000,
  },
});
