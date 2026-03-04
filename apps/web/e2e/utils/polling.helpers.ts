// Helpers for waiting on TanStack Query polling refresh cycles.
// TanStack Query is configured with a 15-second refetch interval.
// After mutating data via MSW, tests must wait for the next poll
// before asserting on UI updates.
import { type Page } from '@playwright/test';

/**
 * Wait for the next TanStack Query polling cycle to complete.
 * Monitors network requests matching the API pattern and waits
 * for a successful response. Timeout is set to 20s to accommodate
 * the 15s polling interval plus network latency.
 */
export const waitForPollingRefresh = async (
  page: Page,
  urlPattern: string | RegExp = /\/api\/v1\//,
): Promise<void> => {
  const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;

  await page.waitForResponse(
    (response) => pattern.test(response.url()) && response.status() === 200,
    { timeout: 20_000 },
  );
};

/**
 * Wait for a specific API endpoint to return data matching a predicate.
 * Useful when waiting for a specific status change after a mutation.
 *
 * The timeout is enforced independently of response events via
 * `setTimeout`, so the promise always settles even if no matching
 * responses arrive. The response listener is cleaned up on both
 * resolve and reject to prevent leaks and cross-test interference.
 */
export const waitForApiCondition = async <T>(
  page: Page,
  urlPattern: string | RegExp,
  predicate: (data: T) => boolean,
  options: { timeout?: number } = {},
): Promise<T> => {
  const { timeout = 30_000 } = options;
  const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      page.off('response', handler);
      clearTimeout(timeoutId);
    };

    // Independent timeout that fires regardless of response events.
    const timeoutId = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error(`waitForApiCondition timed out after ${String(timeout)}ms`));
      }
    }, timeout);

    const handler = async (response: {
      url: () => string;
      status: () => number;
      json: () => Promise<{ data: T }>;
    }) => {
      if (settled) return;
      if (!pattern.test(response.url()) || response.status() !== 200) return;

      try {
        const json = await response.json();
        const data = json.data;
        if (predicate(data)) {
          cleanup();
          resolve(data);
        }
      } catch {
        // Response parsing failed, continue waiting for next match.
      }
    };

    page.on('response', handler);
  });
};

/**
 * Force a TanStack Query refetch by triggering a window focus event.
 * TanStack Query is configured to refetch on window focus, which
 * provides an immediate refresh without waiting for the polling interval.
 */
export const triggerQueryRefetch = async (page: Page): Promise<void> => {
  // Dispatch a focus event to trigger TanStack Query's refetchOnWindowFocus.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  // Wait briefly for the refetch to complete.
  await page.waitForTimeout(500);
};
