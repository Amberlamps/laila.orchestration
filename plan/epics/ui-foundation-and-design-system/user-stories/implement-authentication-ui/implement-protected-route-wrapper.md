# Implement Protected Route Wrapper

## Task Details

- **Title:** Implement Protected Route Wrapper
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Authentication UI](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Implement Sign-In Page

## Description

Create a `useAuth` hook for client-side authentication state management and a `ProtectedRoute` wrapper component (or higher-order component) that prevents unauthenticated users from accessing protected pages. Unauthenticated users are redirected to `/sign-in` with the current URL preserved as a return URL.

### useAuth Hook

The `useAuth` hook provides the current authentication state throughout the application:

```tsx
// apps/web/src/hooks/use-auth.ts
// Client-side auth state hook using Better Auth's React integration.
// Provides user info, loading state, and sign-out function.
import { authClient } from '@/lib/auth-client';

interface AuthState {
  /** Whether the auth state is still being determined */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** The authenticated user object (null if not authenticated) */
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  } | null;
  /** Sign out the current user */
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  // Use Better Auth's useSession hook to get session state.
  // This automatically handles session validation and refresh.
  const session = authClient.useSession();

  return {
    isLoading: session.isPending,
    isAuthenticated: !!session.data?.user,
    user: session.data?.user ?? null,
    signOut: async () => {
      await authClient.signOut();
      // Redirect to sign-in after sign-out
      window.location.href = '/sign-in';
    },
  };
}
```

### ProtectedRoute Wrapper

```tsx
// apps/web/src/components/auth/protected-route.tsx
// Wrapper component that redirects unauthenticated users to sign-in.
// Shows a full-page skeleton while auth state is being determined.
import { useRouter } from 'next/router';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth state is determined and user is not authenticated,
    // redirect to sign-in with the current URL as returnUrl.
    if (!isLoading && !isAuthenticated) {
      router.replace(`/sign-in?returnUrl=${encodeURIComponent(router.asPath)}`);
    }
  }, [isLoading, isAuthenticated, router]);

  // While loading, show a full-page skeleton to avoid flash of content
  if (isLoading) {
    return <FullPageSkeleton />;
  }

  // If not authenticated, render nothing (redirect is in progress)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render the protected content
  return <>{children}</>;
}
```

## Acceptance Criteria

- [ ] `useAuth` hook returns `isLoading`, `isAuthenticated`, `user`, and `signOut`
- [ ] `useAuth` uses Better Auth's client-side session hook for session state
- [ ] `isLoading` is `true` while the initial auth check is in progress
- [ ] `isAuthenticated` is `true` when a valid session exists, `false` otherwise
- [ ] `user` object contains `id`, `name`, `email`, and optional `image`
- [ ] `signOut` function signs out the user and redirects to `/sign-in`
- [ ] `ProtectedRoute` wrapper redirects to `/sign-in` when user is not authenticated
- [ ] Return URL is preserved as `?returnUrl=` query parameter during redirect
- [ ] Full-page skeleton is shown while auth state is loading (prevents flash of protected content)
- [ ] Protected content renders only after authentication is confirmed
- [ ] No content flash occurs during the auth check (skeleton -> content, never skeleton -> content -> redirect)
- [ ] `ProtectedRoute` works correctly with Next.js page transitions
- [ ] The hook can be used independently of `ProtectedRoute` for conditional UI rendering (e.g., showing user avatar)
- [ ] `signOut` clears all client-side auth state (session, cookies)

## Technical Notes

- Better Auth provides a client-side auth library (`@better-auth/react` or similar) that includes a `useSession` hook. The `useAuth` hook wraps this to provide a cleaner API for the application.
- The `ProtectedRoute` component should be used in the app layout (e.g., wrapping `AppLayout`) rather than on individual pages, to avoid repeating the check on every page.
- Use `router.replace` instead of `router.push` for the redirect so the protected URL does not appear in the browser history (user cannot navigate back to a page they do not have access to).
- The full-page skeleton should show the sidebar and main content area skeleton to match the authenticated layout structure, preventing layout shift when content loads.
- Consider using `getServerSideProps` for server-side auth checks as an enhancement, but the initial implementation uses client-side checking with the `useAuth` hook.

## References

- **Design Specification:** Section 4.2 (Protected Routes), Section 4.2.1 (Auth Loading State)
- **Functional Requirements:** FR-AUTH-006 (protected routes), FR-AUTH-007 (return URL preservation)
- **Better Auth Docs:** Client-side auth, useSession hook
- **Next.js Docs:** useRouter, router.replace

## Estimated Complexity

Medium — The useAuth hook wraps Better Auth's client API, and the ProtectedRoute pattern is well-established. The main complexity is in handling the loading state correctly to avoid content flashes and ensuring proper redirect behavior.
