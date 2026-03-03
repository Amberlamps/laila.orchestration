/**
 * Primary layout wrapper for all authenticated pages.
 *
 * Composes the sidebar navigation (desktop/tablet), main content area,
 * and mobile bottom tab bar into a cohesive responsive shell.
 *
 * The `variant` prop controls content max-width behavior:
 * - "constrained" (default): max-width 1200px, centered — for forms/detail pages
 * - "full": no max-width — for tables/dashboards
 *
 * Responsive breakpoints:
 * - Desktop (>= 1024px): sidebar expanded (240px), content offset
 * - Tablet (768px–1023px): sidebar collapsed (64px) by default, content offset
 * - Mobile (< 768px): no sidebar, full-width content, bottom tab bar
 */
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import { MobileTabBar } from './mobile-tab-bar';
import { SidebarProvider, useSidebar } from './sidebar-context';
import { SidebarNavigation } from './sidebar-navigation';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sidebar width when expanded (must match SidebarNavigation). */
const SIDEBAR_EXPANDED_WIDTH = 240;

/** Sidebar width when collapsed (must match SidebarNavigation). */
const SIDEBAR_COLLAPSED_WIDTH = 64;

/** Media query for tablet viewport (768px to 1023px). */
const TABLET_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1023px)';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppLayoutProps {
  children: ReactNode;
  /**
   * Controls the max-width behavior of the content area.
   *
   * - `"constrained"` applies `max-width: 1200px` with centered content,
   *    ideal for forms and detail pages.
   * - `"full"` allows content to fill all available width,
   *    ideal for tables and dashboards.
   *
   * @default "constrained"
   */
  variant?: 'constrained' | 'full' | undefined;
}

// ---------------------------------------------------------------------------
// Inner layout (must be rendered inside SidebarProvider)
// ---------------------------------------------------------------------------

const AppLayoutInner = ({ children, variant = 'constrained' }: AppLayoutProps) => {
  const { collapsed, setCollapsed } = useSidebar();

  // Track whether the initial tablet-collapse has already run so we only
  // apply the default once (on mount) and don't override the user's
  // explicit toggle actions.
  const hasSetTabletDefault = useRef(false);

  useEffect(() => {
    if (hasSetTabletDefault.current) return;
    hasSetTabletDefault.current = true;

    // On tablet viewports, default to collapsed sidebar so the content
    // area gets more room. Desktop keeps the persisted/default state.
    if (typeof window !== 'undefined' && window.matchMedia(TABLET_MEDIA_QUERY).matches) {
      setCollapsed(true);
    }
  }, [setCollapsed]);

  // Compute the margin-left offset for the content area.
  // On mobile the sidebar is hidden so margin-left is 0 — we handle that
  // with a responsive class that resets margin-left below md breakpoint.
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50">
      {/* Sidebar — hidden on mobile (< 768px), visible on tablet+ */}
      <SidebarNavigation />

      {/* Main content area — offset by sidebar width on tablet/desktop */}
      <main
        style={
          {
            '--sidebar-width': `${String(sidebarWidth)}px`,
          } as React.CSSProperties
        }
        className={cn(
          // Margin-left: 0 on mobile, sidebar width on md+
          'ml-0 md:ml-[var(--sidebar-width)]',
          // Smooth transition matching sidebar width transition
          'transition-[margin-left] duration-200 ease-in-out',
          // Horizontal padding: 16px mobile, 24px tablet, 32px desktop
          'px-4 md:px-6 lg:px-8',
          // Top padding: 16px mobile, 32px tablet/desktop
          'pt-4 md:pt-8',
          // Bottom padding: enough to clear mobile tab bar on mobile,
          // standard padding on tablet/desktop
          'pb-[calc(56px+env(safe-area-inset-bottom,0px)+16px)] md:pb-8',
        )}
      >
        {variant === 'constrained' ? (
          <div className="mx-auto max-w-[1200px]">{children}</div>
        ) : (
          children
        )}
      </main>

      {/* Mobile tab bar — visible on mobile (< 768px), hidden on tablet+ */}
      <MobileTabBar />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Exported component (wraps with SidebarProvider)
// ---------------------------------------------------------------------------

/**
 * Application layout shell for authenticated pages.
 *
 * Wraps the page content with:
 * - `SidebarProvider` for shared sidebar state
 * - `SidebarNavigation` (desktop/tablet)
 * - `MobileTabBar` (mobile)
 * - Responsive content area with proper padding and max-width
 *
 * @example
 * ```tsx
 * // In a page component:
 * export default function DashboardPage() {
 *   return (
 *     <AppLayout variant="full">
 *       <DashboardContent />
 *     </AppLayout>
 *   );
 * }
 *
 * // For forms/detail pages:
 * export default function ProjectDetailPage() {
 *   return (
 *     <AppLayout variant="constrained">
 *       <ProjectDetail />
 *     </AppLayout>
 *   );
 * }
 * ```
 */
export const AppLayout = ({ children, variant }: AppLayoutProps) => (
  <SidebarProvider>
    <AppLayoutInner variant={variant}>{children}</AppLayoutInner>
  </SidebarProvider>
);

export default AppLayout;
