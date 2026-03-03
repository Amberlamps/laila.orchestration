/**
 * Bottom tab bar for mobile viewports (< 768px).
 * Provides quick access to primary sections with a "More" overflow menu.
 *
 * - Fixed to the bottom of the viewport with safe area inset padding
 * - Hidden on tablet/desktop (>= 768px)
 * - Uses Next.js Link for client-side navigation
 * - Active tab detection via useRouter().pathname
 * - "More" tab opens a Popover with Audit, Settings, and Sign Out
 */
import {
  Bot,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  ScrollText,
  Settings,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabItem {
  /** Display label shown below the icon */
  label: string;
  /** Route path for navigation */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

interface MoreMenuItem {
  /** Display label */
  label: string;
  /** Route path for navigation (omit for action-only items) */
  href?: string | undefined;
  /** Lucide icon component */
  icon: LucideIcon;
  /** If true, renders as a destructive action (e.g. Sign Out) */
  destructive?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the tab bar in pixels (excluding safe area inset). */
const TAB_BAR_HEIGHT_PX = '56px';

/** Icon size in the tab bar (pixels). */
const ICON_SIZE = 20;

/** Primary navigation tabs displayed in the tab bar. */
const PRIMARY_TABS: TabItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Workers', href: '/workers', icon: Bot },
  { label: 'Personas', href: '/personas', icon: UserCog },
];

/** Items displayed inside the "More" popover menu. */
const MORE_MENU_ITEMS: MoreMenuItem[] = [
  { label: 'Audit', href: '/audit', icon: ScrollText },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Sign Out', icon: LogOut, destructive: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether a given pathname matches a tab's href.
 * Matches exact path or any sub-path (e.g. /projects/123 matches /projects).
 */
function isTabActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Returns whether the "More" menu should show an active state.
 * This happens when the current pathname matches any of the More menu items.
 */
function isMoreActive(pathname: string): boolean {
  return MORE_MENU_ITEMS.some((item) => item.href != null && isTabActive(pathname, item.href));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mobile bottom tab bar navigation.
 *
 * Renders a fixed navigation bar at the bottom of the screen on mobile
 * viewports (< 768px). Contains four primary navigation tabs and a "More"
 * button that opens a popover with additional options.
 *
 * @example
 * ```tsx
 * // In your layout component:
 * <MobileTabBar />
 * ```
 */
export function MobileTabBar() {
  const router = useRouter();
  const { pathname } = router;

  const handleSignOut = useCallback(() => {
    void signOut().then(() => router.push('/'));
  }, [router]);

  const moreActive = isMoreActive(pathname);

  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      className={cn(
        // Positioning and layout
        'fixed inset-x-0 bottom-0 z-50',
        // Visibility: show on mobile, hide on md+
        'flex md:hidden',
        // Background and border
        'border-t border-zinc-200 bg-white',
        // Performance optimization for mobile scroll
        'will-change-transform',
      )}
      style={{
        height: `calc(${TAB_BAR_HEIGHT_PX} + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        className="flex w-full items-center justify-around"
        style={{ height: TAB_BAR_HEIGHT_PX }}
      >
        {/* Primary navigation tabs */}
        {PRIMARY_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5',
                'transition-colors outline-none',
                'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-1',
                'rounded-sm',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn('shrink-0', active ? 'text-primary-500' : 'text-zinc-400')}
                style={{ width: ICON_SIZE, height: ICON_SIZE }}
              />
              <span
                className={cn('leading-none', active ? 'text-primary-500' : 'text-zinc-500')}
                style={{ fontSize: '10px' }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* "More" tab with popover */}
        <Popover>
          <PopoverTrigger
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5',
              'transition-colors outline-none',
              'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-1',
              'rounded-sm',
            )}
            aria-label="More navigation options"
          >
            <MoreHorizontal
              className={cn('shrink-0', moreActive ? 'text-primary-500' : 'text-zinc-400')}
              style={{ width: ICON_SIZE, height: ICON_SIZE }}
            />
            <span
              className={cn('leading-none', moreActive ? 'text-primary-500' : 'text-zinc-500')}
              style={{ fontSize: '10px' }}
            >
              More
            </span>
          </PopoverTrigger>

          <PopoverContent side="top" align="end" sideOffset={8} className="w-48 p-1">
            <div role="menu" aria-label="More options">
              {MORE_MENU_ITEMS.map((item) => {
                const Icon = item.icon;

                // Sign Out is an action, not a link
                if (item.destructive) {
                  return (
                    <button
                      key={item.label}
                      role="menuitem"
                      type="button"
                      onClick={handleSignOut}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-3 py-2',
                        'text-error-600 text-sm transition-colors',
                        'hover:bg-zinc-100',
                        'focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
                      )}
                    >
                      <Icon className="shrink-0" style={{ width: 16, height: 16 }} />
                      {item.label}
                    </button>
                  );
                }

                // Regular navigation items — href is guaranteed non-null here
                // since destructive items (which lack href) are handled above
                if (item.href == null) return null;

                const active = isTabActive(pathname, item.href);

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-3 py-2',
                      'text-sm transition-colors',
                      active ? 'text-primary-500 bg-primary-50' : 'text-zinc-700 hover:bg-zinc-100',
                      'focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="shrink-0" style={{ width: 16, height: 16 }} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}
