/**
 * Protected route wrapper that prevents unauthenticated users from viewing
 * protected page content.
 *
 * Behaviour:
 * 1. While auth state is loading: renders a full-page skeleton that matches
 *    the AppLayout structure (sidebar + content area) to prevent layout shift.
 * 2. When not authenticated: redirects to `/sign-in?returnUrl=<current-path>`
 *    using `router.replace` to avoid polluting browser history.
 * 3. When authenticated: renders `children`.
 *
 * The skeleton/redirect approach ensures there is never a flash of protected
 * content during the auth check.
 *
 * @example
 * ```tsx
 * // Wrap a page's content (integration into _app.tsx is a separate task):
 * <ProtectedRoute>
 *   <DashboardContent />
 * </ProtectedRoute>
 * ```
 */
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Constants — mirror sidebar dimensions from SidebarNavigation / AppLayout
// ---------------------------------------------------------------------------

/** Sidebar width (px) when expanded — matches the desktop default. */
const SIDEBAR_WIDTH = 240;

/** Number of navigation item skeleton rows in the sidebar skeleton. */
const NAV_ITEM_COUNT = 6;

/** Number of skeleton text lines in the main content area. */
const CONTENT_LINE_COUNT = 4;

// ---------------------------------------------------------------------------
// FullPageSkeleton
// ---------------------------------------------------------------------------

/**
 * A full-page loading skeleton that mirrors the AppLayout shell.
 *
 * Desktop/tablet: shows a sidebar skeleton (logo + nav items + user area) on
 * the left and a content area skeleton on the right, matching the widths and
 * padding of the real layout.
 *
 * Mobile: hides the sidebar and shows only the content area skeleton with a
 * bottom tab bar placeholder.
 */
const FullPageSkeleton = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading application"
    className="min-h-screen bg-zinc-50"
  >
    {/* ----- Sidebar skeleton (hidden on mobile, visible md+) ----- */}
    <aside
      style={{ width: SIDEBAR_WIDTH }}
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-zinc-200 bg-white md:flex"
    >
      {/* Logo area */}
      <div className="px-4 pt-6 pb-5">
        <Skeleton width="120px" height="24px" rounded="rounded" />
      </div>

      {/* Navigation items */}
      <div className="flex-1 space-y-2 px-4 pt-4">
        {/* Section header */}
        <Skeleton width="80px" height="10px" rounded="rounded-sm" className="mb-3" />

        {Array.from({ length: NAV_ITEM_COUNT }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton width="20px" height="20px" rounded="rounded" />
            <Skeleton width="100px" height="14px" rounded="rounded-sm" />
          </div>
        ))}
      </div>

      {/* User area */}
      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton width="32px" height="32px" rounded="rounded-full" />
          <Skeleton width="96px" height="14px" rounded="rounded-sm" />
        </div>
      </div>
    </aside>

    {/* ----- Main content skeleton ----- */}
    <main
      style={
        {
          '--sidebar-width': `${String(SIDEBAR_WIDTH)}px`,
        } as React.CSSProperties
      }
      className="ml-0 px-4 pt-4 md:ml-[var(--sidebar-width)] md:px-6 md:pt-8 lg:px-8"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Page title skeleton */}
        <Skeleton width="200px" height="28px" rounded="rounded" />

        {/* Content lines */}
        <div className="mt-6 space-y-4">
          {Array.from({ length: CONTENT_LINE_COUNT }).map((_, i) => (
            <Skeleton
              key={i}
              width={i === CONTENT_LINE_COUNT - 1 ? '60%' : '100%'}
              height="14px"
              rounded="rounded-sm"
            />
          ))}
        </div>

        {/* Card-like placeholder */}
        <div className="mt-8 rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
          <Skeleton width="40%" height="20px" rounded="rounded-sm" />
          <div className="mt-4 space-y-3">
            <Skeleton width="100%" height="14px" rounded="rounded-sm" />
            <Skeleton width="85%" height="14px" rounded="rounded-sm" />
            <Skeleton width="70%" height="14px" rounded="rounded-sm" />
          </div>
        </div>
      </div>
    </main>

    {/* ----- Mobile bottom tab bar skeleton (visible < md) ----- */}
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-zinc-200 bg-white px-2 py-2 md:hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <Skeleton width="24px" height="24px" rounded="rounded" />
          <Skeleton width="32px" height="8px" rounded="rounded-sm" />
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ProtectedRoute
// ---------------------------------------------------------------------------

interface ProtectedRouteProps {
  /** The protected page content, rendered only when authenticated. */
  children: ReactNode;
}

/**
 * Wraps page content to enforce authentication.
 *
 * - Shows a full-page skeleton while auth state is loading.
 * - Redirects unauthenticated users to `/sign-in` with the current path as
 *   `returnUrl` so they land back on the same page after signing in.
 * - Only renders `children` once authentication is confirmed.
 */
export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect unauthenticated users to sign-in. Uses `router.replace` to
  // prevent the protected URL from appearing in browser history.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void router.replace(`/sign-in?returnUrl=${encodeURIComponent(router.asPath)}`);
    }
  }, [isLoading, isAuthenticated, router]);

  // While loading, show a full-page skeleton to avoid flash of content.
  if (isLoading) {
    return <FullPageSkeleton />;
  }

  // If not authenticated, render nothing — redirect is in progress.
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — render the protected content.
  return <>{children}</>;
};
