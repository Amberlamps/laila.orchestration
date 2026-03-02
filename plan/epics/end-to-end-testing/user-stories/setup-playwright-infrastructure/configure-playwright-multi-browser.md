# Configure Playwright Multi-Browser

## Task Details

- **Title:** Configure Playwright Multi-Browser
- **Status:** Not Started
- **Assigned Agent:** test-automator
- **Parent User Story:** [Set Up Playwright Infrastructure](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None

## Description

Install Playwright and configure `playwright.config.ts` for multi-browser E2E testing with Chromium, Firefox, and WebKit. Set up parallel execution, screenshot/video capture on failure, HTML reporter, and the canonical test directory structure under `apps/web/e2e/`.

### Install Playwright and Dependencies

Add Playwright as a dev dependency in the web workspace and install browser binaries.

```bash
# Install Playwright in the web workspace
pnpm --filter web add -D @playwright/test

# Install browser binaries (Chromium, Firefox, WebKit)
pnpm --filter web exec playwright install --with-deps chromium firefox webkit
```

### Playwright Configuration

Create `apps/web/playwright.config.ts` with multi-browser projects, parallel execution, and failure artifact capture.

```typescript
// apps/web/playwright.config.ts
// Playwright configuration for multi-browser E2E testing.
// Configures Chromium, Firefox, and WebKit projects with parallel
// execution, screenshot/video on failure, and HTML reporting.
import { defineConfig, devices } from "@playwright/test";

// Base URL for the local development server.
// Override with PLAYWRIGHT_BASE_URL env var for CI environments.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  // Root directory for all E2E test files.
  testDir: "./e2e",

  // Run tests in parallel across workers for faster execution.
  // Each worker runs in an isolated browser context.
  fullyParallel: true,

  // Fail the build on CI if test.only() is accidentally left in source code.
  forbidOnly: !!process.env.CI,

  // Retry failed tests once on CI to handle flaky network conditions.
  retries: process.env.CI ? 1 : 0,

  // Limit parallelism on CI to avoid resource contention.
  // Locally, use all available CPU cores.
  workers: process.env.CI ? 2 : undefined,

  // HTML reporter generates a browsable test results report.
  // On CI, also output a list format for log readability.
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["html", { open: "on-failure" }]],

  // Shared settings applied to all browser projects.
  use: {
    // Base URL simplifies navigation: page.goto("/dashboard") instead of full URL.
    baseURL: BASE_URL,

    // Capture a screenshot when a test fails for debugging.
    screenshot: "only-on-failure",

    // Record a video when a test fails for step-by-step replay.
    video: "retain-on-failure",

    // Capture the full page trace on first retry for deep debugging.
    trace: "on-first-retry",

    // Default timeout for actions (clicks, fills, etc.).
    actionTimeout: 10_000,

    // Default timeout for navigation operations.
    navigationTimeout: 15_000,
  },

  // Browser projects: run every test in Chromium, Firefox, and WebKit.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  // Start the Next.js dev server before running tests.
  // Playwright waits until the server responds with 200 on the base URL.
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 minutes for Next.js cold start
    stdout: "pipe",
    stderr: "pipe",
  },

  // Global timeout per test (30 seconds).
  timeout: 30_000,

  // Timeout for expect() assertions.
  expect: {
    timeout: 5_000,
  },
});
```

### Test Directory Structure

Create the following directory structure under `apps/web/e2e/`:

```
apps/web/e2e/
├── fixtures/                    # Test fixtures and factory functions
│   ├── index.ts                 # Re-exports all fixtures
│   ├── auth.fixture.ts          # Mocked auth session fixtures
│   ├── entity-factories.ts      # Factory functions for test entities
│   └── msw-handlers.ts          # MSW request handlers
├── page-objects/                # Page Object Model classes
│   ├── index.ts                 # Re-exports all POMs
│   ├── sign-in.page.ts
│   ├── dashboard.page.ts
│   ├── project-list.page.ts
│   ├── project-detail.page.ts
│   ├── epic-detail.page.ts
│   ├── story-detail.page.ts
│   ├── task-detail.page.ts
│   ├── worker-list.page.ts
│   ├── worker-detail.page.ts
│   ├── persona-list.page.ts
│   ├── audit-log.page.ts
│   └── graph.page.ts
├── utils/                       # Shared test utilities
│   ├── index.ts                 # Re-exports all utilities
│   ├── navigation.helpers.ts    # Navigation helper functions
│   ├── polling.helpers.ts       # TanStack Query polling wait helpers
│   └── assertion.helpers.ts     # Custom assertion helpers
├── auth/                        # Authentication E2E tests
│   ├── google-oauth.spec.ts
│   ├── session-persistence.spec.ts
│   └── onboarding.spec.ts
├── plan-creation/               # Plan creation E2E tests
│   ├── full-plan-creation.spec.ts
│   ├── publish-flow.spec.ts
│   ├── cycle-detection.spec.ts
│   └── destructive-actions.spec.ts
├── work-execution/              # Work execution E2E tests
│   ├── assignment-and-progression.spec.ts
│   ├── failure-recovery.spec.ts
│   ├── timeout-reclamation.spec.ts
│   ├── manual-unassignment.spec.ts
│   └── read-only-enforcement.spec.ts
├── entity-management/           # Entity management E2E tests
│   ├── worker-creation.spec.ts
│   ├── worker-access.spec.ts
│   ├── persona-crud.spec.ts
│   └── audit-log.spec.ts
├── graph-and-responsive/        # Graph and responsive E2E tests
│   ├── dag-graph.spec.ts
│   ├── responsive-desktop.spec.ts
│   ├── responsive-tablet.spec.ts
│   └── responsive-mobile.spec.ts
└── global-setup.ts              # Global setup for auth state
```

### Global Setup for Authenticated State

Create a global setup file that produces a reusable authenticated storage state, avoiding repeated sign-in per test.

```typescript
// apps/web/e2e/global-setup.ts
// Global setup that creates an authenticated browser storage state.
// This state is reused by tests that require a signed-in user,
// avoiding redundant sign-in flows for each test.
import { chromium, type FullConfig } from "@playwright/test";

const STORAGE_STATE_PATH = "e2e/.auth/storage-state.json";

async function globalSetup(config: FullConfig): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to the sign-in page and perform mocked OAuth flow.
  // The MSW handlers intercept the OAuth callback and create a
  // test session without hitting real Google servers.
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /sign in with google/i }).click();

  // Wait for redirect to dashboard after mocked OAuth completes.
  await page.waitForURL("/dashboard");

  // Save the authenticated storage state (cookies, localStorage)
  // for reuse across all tests that need a signed-in user.
  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export default globalSetup;
```

### Package.json Script

Add E2E test scripts to the web workspace `package.json`.

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:chromium": "playwright test --project=chromium",
    "test:e2e:firefox": "playwright test --project=firefox",
    "test:e2e:webkit": "playwright test --project=webkit",
    "test:e2e:report": "playwright show-report"
  }
}
```

### TypeScript Configuration

Ensure the `e2e/` directory has proper TypeScript support by extending the workspace `tsconfig.json` or creating a dedicated `e2e/tsconfig.json`.

```typescript
// apps/web/e2e/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@e2e/*": ["./*"]
    }
  },
  "include": ["./**/*.ts"]
}
```

## Acceptance Criteria

- [ ] `@playwright/test` is installed as a dev dependency in the web workspace
- [ ] Chromium, Firefox, and WebKit browser binaries are installed via `playwright install`
- [ ] `playwright.config.ts` configures all three browser projects with parallel execution
- [ ] Screenshots are captured automatically on test failure
- [ ] Videos are retained on test failure for debugging
- [ ] Traces are captured on first retry
- [ ] HTML reporter is configured (opens on failure locally, suppressed on CI)
- [ ] Test directory structure (`e2e/`) is created with subdirectories for fixtures, page-objects, utils, and test categories
- [ ] Global setup file creates reusable authenticated storage state
- [ ] `package.json` scripts added for running E2E tests (all, by project, with UI, report)
- [ ] TypeScript strict mode is enabled for E2E test files with no `any` types
- [ ] Web server configuration starts Next.js dev server before tests and waits for readiness
- [ ] CI-specific configuration (retries, worker count, reporter) is properly conditioned on `process.env.CI`

## Technical Notes

- Playwright's `fullyParallel: true` runs tests across files and within files in parallel. Each test gets an isolated browser context for deterministic results.
- The `webServer` configuration automatically starts the Next.js dev server and waits for it to respond. Set `reuseExistingServer: true` locally to speed up development by reusing an already-running server.
- The `retries: 1` setting on CI helps with intermittent network or timing issues without masking real failures. Locally, retries are disabled for fast feedback.
- The storage state approach (global setup) avoids repeating the sign-in flow for every test, significantly reducing test execution time.
- The `devices` presets from Playwright include realistic viewport sizes, user agents, and other device-specific settings.
- Ensure `.gitignore` excludes `e2e/.auth/`, `test-results/`, and `playwright-report/` directories.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Playwright config, multi-browser, parallel execution)
- **Project Setup Specification:** Section G.5 (Correctness-Focused Requirements)
- **Functional Requirements:** All critical user journeys specified in the E2E testing mandate
- **Design Specification:** Page structure and navigation layout

## Estimated Complexity

Medium — Playwright installation and configuration is well-documented, but setting up a proper multi-browser config with global auth setup, CI-specific settings, and the complete test directory scaffold requires careful attention to project structure and configuration details.
