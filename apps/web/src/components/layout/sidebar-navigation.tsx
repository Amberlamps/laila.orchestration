import {
  Bot,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { signOut, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import { useSidebar } from './sidebar-context';

import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Navigation data model
// ---------------------------------------------------------------------------

interface NavItem {
  /** Visible label for the navigation item */
  label: string;
  /** Route path the item links to */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

interface NavSection {
  /** Overline-styled section header text */
  title: string;
  /** Navigation items within this section */
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Projects', href: '/projects', icon: FolderKanban },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Workers', href: '/workers', icon: Bot },
      { label: 'Personas', href: '/personas', icon: UserCog },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Audit', href: '/audit', icon: ScrollText },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sidebar widths (px)
// ---------------------------------------------------------------------------

const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Logo area at the top of the sidebar */
const SidebarLogo = ({ collapsed }: { collapsed: boolean }) => (
  <div className="flex items-center px-4 pt-6 pb-5">
    {collapsed ? (
      <span className="text-h3 text-primary-500 mx-auto select-none">l.</span>
    ) : (
      <span className="text-display text-primary-500 select-none">laila.works</span>
    )}
  </div>
);

/**
 * Determines whether `pathname` matches a nav item's `href`.
 * Uses `startsWith` so nested routes (e.g. /projects/123) remain highlighted.
 */
const isActive = (pathname: string, href: string): boolean => {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
};

/** A single navigation link inside a section. */
const SidebarNavItem = ({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) => {
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group text-body flex items-center gap-3 px-4 py-2.5 transition-colors',
        'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-600 border-l-[3px] pl-[13px]'
          : 'border-l-[3px] border-transparent text-zinc-600 hover:bg-zinc-100',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary-600' : 'text-zinc-500')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
};

/** A group of navigation items under a section header. */
const SidebarSection = ({
  section,
  pathname,
  collapsed,
}: {
  section: NavSection;
  pathname: string;
  collapsed: boolean;
}) => (
  <div className="mb-2">
    {!collapsed && (
      <div className="text-overline px-4 pt-4 pb-1 text-zinc-400">{section.title}</div>
    )}
    {collapsed && <div className="pt-2" />}
    <ul>
      {section.items.map((item) => (
        <li key={item.href}>
          <SidebarNavItem
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
          />
        </li>
      ))}
    </ul>
  </div>
);

/** Collapse/expand toggle button. */
const CollapseToggle = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
  const Icon = collapsed ? ChevronsRight : ChevronsLeft;
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  const button = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-zinc-500 transition-colors',
        'hover:bg-zinc-100 hover:text-zinc-700',
        'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="text-body">Collapse</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Expand sidebar
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

/** Extracts initials from a display name (first letter of first and last word). */
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return '?';
  if (parts.length === 1) return first[0]?.toUpperCase() ?? '?';
  return `${first[0]?.toUpperCase() ?? ''}${last?.[0]?.toUpperCase() ?? ''}`;
};

/** User avatar with image fallback to initials. */
const UserAvatar = ({ imageUrl, name }: { imageUrl?: string | null | undefined; name: string }) => {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${name}'s avatar`}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="bg-primary-500 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white select-none">
      {getInitials(name)}
    </div>
  );
};

/** User section at the bottom of the sidebar. */
const SidebarUser = ({ collapsed }: { collapsed: boolean }) => {
  const { data: session } = useSession();

  const user = session?.user;
  const displayName = user?.name ?? 'User';
  const imageUrl = user?.image;

  const handleSignOut = () => {
    void signOut();
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-zinc-200 px-2 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default">
              <UserAvatar imageUrl={imageUrl} name={displayName} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {displayName}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className={cn(
                'flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors',
                'hover:bg-zinc-100 hover:text-zinc-700',
                'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:outline-none',
              )}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Sign out
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 px-4 py-3">
      <UserAvatar imageUrl={imageUrl} name={displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-body truncate font-medium text-zinc-900">{displayName}</p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors',
              'hover:bg-zinc-100 hover:text-zinc-700',
              'focus-visible:ring-primary-500 focus-visible:ring-2 focus-visible:outline-none',
            )}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Sign out
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main sidebar component
// ---------------------------------------------------------------------------

/**
 * Primary sidebar navigation for the laila.works dashboard.
 *
 * Features:
 * - 240px expanded / 64px collapsed width
 * - Grouped navigation sections (WORKSPACE, MANAGEMENT, SYSTEM)
 * - Active item detection via pathname matching (startsWith)
 * - Smooth 200ms width transition on collapse/expand
 * - Collapsed state persisted in localStorage
 * - User avatar + display name + sign-out button
 * - Hidden on mobile (< 768px), visible on tablet/desktop
 * - Full keyboard and screen-reader accessibility
 */
export const SidebarNavigation = () => {
  const { collapsed, toggle } = useSidebar();
  const router = useRouter();
  const { pathname } = router;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        role="navigation"
        aria-label="Main navigation"
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        }}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-zinc-200 bg-white',
          'transition-[width] duration-200 ease-in-out',
          'hidden md:flex',
        )}
      >
        {/* Logo */}
        <SidebarLogo collapsed={collapsed} />

        {/* Navigation sections */}
        <nav className="flex-1 overflow-x-hidden overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <SidebarSection
              key={section.title}
              section={section}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-zinc-200">
          <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        </div>

        {/* User section */}
        <SidebarUser collapsed={collapsed} />
      </aside>
    </TooltipProvider>
  );
};
