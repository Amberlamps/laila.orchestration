// Custom Playwright test fixture that integrates with MSW running
// inside the browser via setupWorker. The Next.js app starts MSW
// automatically when NEXT_PUBLIC_API_MOCKING=enabled, exposing
// window.__mswReady / __mswResetData / __mswSeedData for test control.
import { test as base, type Page } from '@playwright/test';

import { TEST_SESSION } from './auth.fixture';

import type { TestDataStore } from './msw-handlers';

declare global {
  interface Window {
    __mswReady: boolean;
    __mswResetData: () => void;
    __mswSeedData: (data: Partial<TestDataStore>) => void;
  }
}

/**
 * Serializable seed data format for page.evaluate() boundary.
 * Maps cannot cross the serialization boundary, so entity stores
 * are passed as arrays of [id, record] tuples.
 */
interface SerializableSeedData {
  projects?: Array<[string, Record<string, unknown>]>;
  epics?: Array<[string, Record<string, unknown>]>;
  stories?: Array<[string, Record<string, unknown>]>;
  tasks?: Array<[string, Record<string, unknown>]>;
  workers?: Array<[string, Record<string, unknown>]>;
  personas?: Array<[string, Record<string, unknown>]>;
  attempts?: Array<Record<string, unknown>>;
  auditLog?: Array<Record<string, unknown>>;
}

interface TestFixtures {
  /** Page with MSW active in-browser and auth session cookie set. */
  authenticatedPage: Page;
  /** Seed test data into the browser-side MSW in-memory store. */
  seedData: (data: SerializableSeedData) => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Set the authenticated session cookie before navigating.
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: TEST_SESSION.session.token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Navigate to the app — MSW starts automatically via _app.tsx
    // when NEXT_PUBLIC_API_MOCKING=enabled.
    await page.goto('/');

    // Wait for MSW to finish initializing in the browser.
    await page.waitForFunction(() => window.__mswReady, null, {
      timeout: 15_000,
    });

    // Reset data store to ensure clean state for each test.
    await page.evaluate(() => {
      window.__mswResetData();
    });

    await use(page);
  },

  seedData: async ({ page }, use) => {
    const seed = async (data: SerializableSeedData): Promise<void> => {
      await page.evaluate((seedData) => {
        const store: Record<string, unknown> = {};
        if (seedData.projects) store.projects = new Map(seedData.projects);
        if (seedData.epics) store.epics = new Map(seedData.epics);
        if (seedData.stories) store.stories = new Map(seedData.stories);
        if (seedData.tasks) store.tasks = new Map(seedData.tasks);
        if (seedData.workers) store.workers = new Map(seedData.workers);
        if (seedData.personas) store.personas = new Map(seedData.personas);
        if (seedData.attempts) store.attempts = seedData.attempts;
        if (seedData.auditLog) store.auditLog = seedData.auditLog;
        window.__mswSeedData(store as Partial<TestDataStore>);
      }, data);
    };
    await use(seed);
  },
});

export { expect } from '@playwright/test';
export { TEST_USER, TEST_SESSION } from './auth.fixture';

// Re-export handler arrays for tests that need custom handler configurations.
export { authHandlers } from './auth.fixture';
export { apiHandlers } from './msw-handlers';
