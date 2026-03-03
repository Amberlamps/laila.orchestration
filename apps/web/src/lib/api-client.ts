/**
 * Authenticated fetch wrapper with automatic 401 redirect handling.
 *
 * Creates a thin wrapper around the native `fetch` API that:
 * 1. Prepends a base URL to all request paths.
 * 2. Includes session cookies via `credentials: "include"`.
 * 3. Detects 401 Unauthorized responses and redirects to the sign-in page
 *    with the current path preserved as a return URL.
 *
 * A module-level `isRedirecting` flag prevents duplicate redirects when
 * multiple API calls fail with 401 simultaneously (e.g., parallel fetches
 * on initial page load after session expiry).
 *
 * The redirect uses `window.location.href` (not `router.push`) to force a
 * full page reload and clear all client-side state (React Query cache,
 * component state, etc.), ensuring a clean re-authentication experience.
 *
 * @example
 * ```ts
 * import { createAuthenticatedFetch } from "@/lib/api-client";
 *
 * const apiFetch = createAuthenticatedFetch("/api");
 *
 * // GET request — cookies are included automatically
 * const response = await apiFetch("/workers");
 *
 * // POST request — same 401 handling applies
 * const response = await apiFetch("/workers", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ name: "new-worker" }),
 * });
 * ```
 */

// ---------------------------------------------------------------------------
// Module-level redirect guard
// ---------------------------------------------------------------------------

/**
 * Prevents duplicate 401 redirects when multiple API calls fail at the
 * same time. Once the first 401 triggers a redirect, subsequent 401
 * responses are silently ignored.
 */
let isRedirecting = false;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an authenticated fetch function that prepends `baseUrl` to all
 * request paths, includes session cookies, and handles 401 responses by
 * redirecting to the sign-in page.
 *
 * @param baseUrl - The base URL prefix for all requests (e.g., "/api").
 * @returns A fetch-compatible function with automatic auth handling.
 */
export const createAuthenticatedFetch = (baseUrl: string) => {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const response = await fetch(`${baseUrl}${url}`, {
      ...init,
      credentials: 'include',
    });

    if (response.status === 401 && !isRedirecting) {
      isRedirecting = true;

      const currentPath =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const returnUrl = encodeURIComponent(currentPath);
      window.location.href = `/sign-in?returnUrl=${returnUrl}&reason=session_expired`;

      // Return the response so downstream callers do not throw during
      // the redirect. The page will unload before they can act on it.
      return response;
    }

    return response;
  };
};
