/**
 * TanStack Query-based session lifecycle hook.
 *
 * Provides cached session state with automatic background refetching to
 * detect session expiry. When the session is no longer valid, the user is
 * redirected to the sign-in page with the current path preserved as a
 * return URL.
 *
 * This hook complements (does NOT replace) the {@link useAuth} hook:
 * - `useAuth` wraps Better Auth's built-in `useSession` for real-time
 *   reactive auth state (nanostore-backed).
 * - `useSession` provides the TanStack Query caching layer for session
 *   lifecycle management (refetch interval, error-driven redirect, and
 *   cache invalidation on sign-out).
 *
 * @example
 * ```tsx
 * import { useSession } from "@/hooks/use-session";
 *
 * function Dashboard() {
 *   const { data, isLoading, error } = useSession();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!data) return null; // redirect in progress
 *
 *   return <span>Hello, {data.user.name}</span>;
 * }
 * ```
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { authClient } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Refetch session every 5 minutes to detect expiry without excessive polling. */
const SESSION_REFETCH_INTERVAL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useSession = () => {
  const query = useQuery({
    queryKey: queryKeys.session(),
    queryFn: async () => {
      // Better Auth handles token refresh automatically via the session cookie.
      // We only need to detect when the session is no longer valid.
      const result = await authClient.getSession();

      if (result.error ?? !result.data) {
        throw new Error('No active session');
      }

      return result.data;
    },
    refetchInterval: SESSION_REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // TanStack Query v5 removed the global onError callback.
  // Watch for error state and redirect to sign-in when the session expires.
  useEffect(() => {
    if (query.error) {
      const currentPath =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const returnUrl = encodeURIComponent(currentPath);
      window.location.href = `/sign-in?returnUrl=${returnUrl}&reason=session_expired`;
    }
  }, [query.error]);

  return query;
};
