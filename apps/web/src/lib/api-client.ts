/**
 * Type-safe API client using openapi-fetch with generated types from @laila/api-spec.
 *
 * Provides a singleton client that:
 * 1. Uses generated OpenAPI types for compile-time type safety on all API calls.
 * 2. Includes session cookies with every request (`credentials: "include"`).
 * 3. Handles 401 responses by redirecting to the sign-in page with a return URL.
 * 4. Logs 500+ server errors to console for debugging.
 * 5. Passes 403 responses through for calling code to handle.
 *
 * @example
 * ```ts
 * import { apiClient } from "@/lib/api-client";
 *
 * // GET request -- fully typed paths, params, and response
 * const { data, error } = await apiClient.GET("/projects", {
 *   params: { query: { status: "in_progress", page: 1, pageSize: 20 } },
 * });
 *
 * // POST request -- typed request body
 * const { data, error } = await apiClient.POST("/projects", {
 *   body: { name: "My Project", description: "A new project" },
 * });
 * ```
 */
import createClient from 'openapi-fetch';

import type { paths } from '@laila/api-spec';

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

/**
 * Singleton openapi-fetch client typed against the generated OpenAPI paths.
 *
 * Base URL defaults to "/api" (same-origin Next.js API routes in dev).
 * In production, set NEXT_PUBLIC_API_BASE_URL to the deployed API origin.
 */
export const apiClient = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api',
  credentials: 'include',
});

// ---------------------------------------------------------------------------
// Global response middleware
// ---------------------------------------------------------------------------

/**
 * Module-level flag to prevent multiple simultaneous 401 redirects.
 * Once the first 401 triggers a redirect, subsequent 401 responses are
 * silently ignored until the page unloads.
 */
let isRedirecting = false;

/**
 * Redirect the user to the sign-in page, preserving the current path as a
 * return URL. Uses `window.location.href` (not router.push) to force a full
 * page reload and clear all client-side state.
 */
const handleUnauthorized = () => {
  if (typeof window === 'undefined' || isRedirecting) return;
  isRedirecting = true;

  const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/sign-in?returnUrl=${returnUrl}&reason=session_expired`;
};

apiClient.use({
  onResponse({ response }) {
    if (response.status === 401) {
      handleUnauthorized();
      return undefined;
    }

    // 403 -- let calling code handle (usually shows a 403 error page).
    if (response.status === 403) {
      return undefined;
    }

    if (response.status >= 500) {
      console.error(`API Error ${String(response.status)}: ${response.url}`);
      return undefined;
    }

    return undefined;
  },
});
