# Implement Session Handling

## Task Details

- **Title:** Implement Session Handling
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Authentication UI](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Implement Protected Route Wrapper

## Description

Set up TanStack Query-based session state management that handles token refresh, session expiry detection, and automatic redirect to re-authentication on 401 responses from the API. This builds on the `useAuth` hook to provide robust session lifecycle management.

### Session Hook

```tsx
// apps/web/src/hooks/use-session.ts
// TanStack Query hook for session state with automatic refresh and expiry handling.
// Wraps the Better Auth session API with TanStack Query for caching and refetching.
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { queryKeys } from '@/lib/query-keys';
import { authClient } from '@/lib/auth-client';

export function useSession() {
  const router = useRouter();

  return useQuery({
    queryKey: queryKeys.session(),
    queryFn: async () => {
      // Fetch the current session from Better Auth.
      // Better Auth handles token refresh automatically via the session cookie.
      const session = await authClient.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      return session;
    },
    // Refetch every 5 minutes to detect session expiry.
    // This is separate from the 15s default refetch interval
    // because session state changes less frequently than entity data.
    refetchInterval: 5 * 60 * 1000,
    retry: false,
    // On error (session expired), redirect to sign-in
    meta: {
      onError: () => {
        router.replace(
          `/sign-in?returnUrl=${encodeURIComponent(router.asPath)}&reason=session_expired`,
        );
      },
    },
  });
}
```

### 401 Response Handler

Configure a global response interceptor for the API client that detects 401 Unauthorized responses and redirects to re-authentication:

```tsx
// apps/web/src/lib/api-client.ts
// Global 401 response handler for the API client.
// When the API returns 401, the session has expired and the user
// must re-authenticate. Redirect to sign-in with a session_expired reason.
import { QueryClient } from '@tanstack/react-query';

export function setup401Handler(queryClient: QueryClient) {
  // Register a global callback that fires on any query/mutation error.
  // If the error is a 401, invalidate the session cache and redirect.
  queryClient.getDefaultOptions().queries = {
    ...queryClient.getDefaultOptions().queries,
    // Using the onError meta pattern since TanStack Query v5
    // removed the global onError callback.
  };
}

// Alternative: Add a response interceptor to the fetch wrapper.
// Every API call passes through this middleware.
export function createAuthenticatedFetch(baseUrl: string) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const response = await fetch(`${baseUrl}${url}`, {
      ...init,
      credentials: 'include', // Include session cookies
    });

    if (response.status === 401) {
      // Session expired — redirect to re-auth.
      // Use window.location to force a full page reload and clear state.
      window.location.href = `/sign-in?returnUrl=${encodeURIComponent(window.location.pathname)}&reason=session_expired`;
      // Return response to prevent downstream errors during redirect
      return response;
    }

    return response;
  };
}
```

## Acceptance Criteria

- [ ] `useSession` hook fetches and caches session state via TanStack Query
- [ ] Session is refetched every 5 minutes to detect expiry
- [ ] When the session expires (query error), user is redirected to `/sign-in` with `reason=session_expired`
- [ ] Return URL is preserved in the redirect query parameter
- [ ] 401 responses from any API call trigger automatic redirect to sign-in
- [ ] The 401 handler uses `window.location.href` (not `router.push`) to force a full page reload and clear state
- [ ] Session cookies are included in all API requests via `credentials: "include"`
- [ ] Duplicate 401 redirect handling is prevented (no redirect loop if multiple requests fail simultaneously)
- [ ] Session data is available throughout the application via the TanStack Query cache
- [ ] Token refresh is handled automatically by Better Auth's cookie-based session management
- [ ] Sign-in page shows a "Session expired" message when `reason=session_expired` is in the URL
- [ ] After successful re-authentication, user is redirected back to their original page
- [ ] Session invalidation (sign-out) clears the TanStack Query cache for session-related queries

## Technical Notes

- Better Auth handles token refresh server-side through the session cookie mechanism. The client does not need to manually refresh tokens — it just needs to detect when the session is no longer valid (401 responses).
- TanStack Query v5 removed the global `onError` callback. Use the `meta.onError` pattern or a custom `QueryCache` with an `onError` callback to handle global error behavior.
- To prevent duplicate 401 redirects when multiple API calls fail simultaneously, use a module-level flag (e.g., `let isRedirecting = false`) to ensure only one redirect occurs.
- Using `window.location.href` instead of `router.push` for 401 redirects ensures all client-side state (React Query cache, component state) is cleared, providing a clean re-authentication experience.
- The session refetch interval of 5 minutes is a balance between detecting expiry promptly and minimizing unnecessary network requests. Actual session validation happens on every API call via the 401 handler.

## References

- **Design Specification:** Section 4.3 (Session Management), Section 4.3.1 (Token Refresh), Section 4.3.2 (Session Expiry)
- **Functional Requirements:** FR-AUTH-008 (session lifecycle), FR-AUTH-009 (401 handling), FR-AUTH-010 (re-authentication redirect)
- **Better Auth Docs:** Client-side session management, cookie-based auth
- **TanStack Query v5 Docs:** QueryCache onError, meta pattern

## Estimated Complexity

Medium — Session handling with Better Auth is largely automatic (cookie-based), but the 401 interceptor pattern, duplicate redirect prevention, and TanStack Query integration require careful implementation.
