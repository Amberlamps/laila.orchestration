/**
 * Client-side authentication state hook.
 *
 * Wraps Better Auth's `useSession` hook to provide a simpler, application-level
 * API for checking authentication status, accessing the current user, and
 * signing out.
 *
 * Can be used independently of `ProtectedRoute` for conditional UI rendering
 * (e.g., showing a user avatar, conditionally displaying sign-out buttons).
 *
 * @example
 * ```tsx
 * import { useAuth } from "@/hooks/use-auth";
 *
 * function UserGreeting() {
 *   const { isLoading, isAuthenticated, user, signOut } = useAuth();
 *
 *   if (isLoading) return <span>Loading...</span>;
 *   if (!isAuthenticated) return null;
 *
 *   return (
 *     <div>
 *       <span>Hello, {user?.name}</span>
 *       <button onClick={() => void signOut()}>Sign out</button>
 *     </div>
 *   );
 * }
 * ```
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authClient, signOut as authSignOut } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authenticated user object surfaced by the `useAuth` hook. */
interface AuthUser {
  /** Unique user identifier */
  id: string;
  /** Display name */
  name: string;
  /** Email address */
  email: string;
  /** Optional avatar URL */
  image?: string;
}

/** Return type of the `useAuth` hook. */
interface AuthState {
  /** Whether the auth state is still being determined */
  isLoading: boolean;
  /** Whether the user has a valid session */
  isAuthenticated: boolean;
  /** The authenticated user, or `null` if not authenticated / still loading */
  user: AuthUser | null;
  /** Sign out the current user and redirect to the sign-in page */
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides the current authentication state derived from Better Auth's
 * `useSession` hook.
 *
 * - `isLoading` is `true` while the initial auth check is in progress.
 * - `isAuthenticated` is `true` when a valid session exists.
 * - `user` contains `id`, `name`, `email`, and an optional `image`.
 * - `signOut` clears all client-side auth state and redirects to `/sign-in`.
 */
export const useAuth = (): AuthState => {
  const session = authClient.useSession();
  const queryClient = useQueryClient();

  const handleSignOut = useCallback(async () => {
    await authSignOut();
    // Clear session-related queries from the TanStack Query cache before
    // navigating away so stale session data is never served to a new user.
    queryClient.removeQueries({ queryKey: queryKeys.session() });
    // Hard redirect to clear all remaining client-side state (React tree, etc.)
    window.location.href = '/sign-in';
  }, [queryClient]);

  const userData = session.data?.user;

  return {
    isLoading: session.isPending,
    isAuthenticated: !!userData,
    user: userData
      ? {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          ...(userData.image != null ? { image: userData.image } : {}),
        }
      : null,
    signOut: handleSignOut,
  };
};
