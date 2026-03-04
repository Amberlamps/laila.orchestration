// Browser-side MSW worker setup.
// This module is dynamically imported by the app when
// NEXT_PUBLIC_API_MOCKING is set to "enabled".
import { setupWorker } from 'msw/browser';

import { apiHandlers, resetTestData, seedTestData } from './api-handlers';
import { authHandlers } from './auth-handlers';

import type { TestDataStore } from './api-handlers';

// Combine all handlers for the browser worker.
export const worker = setupWorker(...authHandlers, ...apiHandlers);

// Type declarations for the window-exposed MSW API.
declare global {
  interface Window {
    __mswReady: boolean;
    __mswResetData: () => void;
    __mswSeedData: (data: Partial<TestDataStore>) => void;
  }
}

/** Start the MSW worker and expose data management on `window`. */
export const startWorker = async (): Promise<void> => {
  await worker.start({
    // Bypass requests that don't match any handler (e.g. static assets,
    // Next.js internals, HMR websockets).
    onUnhandledRequest: 'bypass',
    // Suppress the default MSW console logging.
    quiet: true,
  });

  // Expose data management functions on `window` so Playwright
  // fixtures can call them via `page.evaluate()`.
  window.__mswReady = true;
  window.__mswResetData = resetTestData;
  window.__mswSeedData = seedTestData;
};
