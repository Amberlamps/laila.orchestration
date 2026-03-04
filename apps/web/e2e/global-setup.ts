// Global setup that creates an authenticated browser storage state.
// This state is reused by tests that require a signed-in user,
// avoiding redundant sign-in flows for each test.
//
// Auth is bootstrapped deterministically by setting the Better Auth
// session cookie directly — no real or mocked OAuth flow is invoked.
import { chromium, type FullConfig } from '@playwright/test';

const STORAGE_STATE_PATH = 'e2e/.auth/storage-state.json';

/** Must match the token in auth.fixture.ts TEST_SESSION. */
const SESSION_TOKEN = 'mock-jwt-token-for-e2e-tests';

const globalSetup = async (config: FullConfig): Promise<void> => {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const url = new URL(baseURL);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Set the Better Auth session cookie directly.
  // This avoids any dependency on a running app or OAuth flow.
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: SESSION_TOKEN,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // Save the authenticated storage state for reuse across all tests.
  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
};

export default globalSetup;
