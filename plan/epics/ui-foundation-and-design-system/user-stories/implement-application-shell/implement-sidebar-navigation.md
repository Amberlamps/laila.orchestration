# Implement Sidebar Navigation

## Task Details

- **Title:** Implement Sidebar Navigation
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Application Shell & Navigation](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build the primary sidebar navigation component for the laila.works orchestration dashboard. The sidebar serves as the main navigation mechanism on desktop and tablet viewports, providing access to all major sections of the application.

### Layout and Dimensions

- **Expanded width:** 240px
- **Collapsed width:** 64px (shows only icons)
- **Position:** Fixed left side of viewport
- **Height:** Full viewport height (100vh)
- **Background:** White with zinc-200 right border

### Structure (Top to Bottom)

1. **Logo Section (top):**
   - Expanded: laila.works wordmark (Display typography, indigo-500 color)
   - Collapsed: laila.works logomark/icon only
   - 24px top padding, 20px bottom padding

2. **Navigation Sections:** Grouped by category with overline-styled section headers

   - **WORKSPACE Section:**
     - Dashboard (Lucide `LayoutDashboard` icon) — links to `/dashboard`
     - Projects (Lucide `FolderKanban` icon) — links to `/projects`

   - **MANAGEMENT Section:**
     - Workers (Lucide `Bot` icon) — links to `/workers`
     - Personas (Lucide `UserCog` icon) — links to `/personas`

   - **SYSTEM Section:**
     - Audit (Lucide `ScrollText` icon) — links to `/audit`
     - Settings (Lucide `Settings` icon) — links to `/settings`

3. **Active Item Styling:**
   - Left 3px indigo-500 border
   - Indigo-600 text color
   - Indigo-50 background
   - Non-active items: zinc-600 text, transparent bg, hover zinc-100 bg

4. **Collapse/Expand Toggle:**
   - Bottom of nav section, above user area
   - Lucide `ChevronsLeft` icon (expanded) / `ChevronsRight` icon (collapsed)
   - Smooth width transition (200ms ease-in-out)
   - Persist collapsed state in localStorage

5. **User Section (bottom):**
   - User avatar (32px, rounded-full, from Google OAuth profile image)
   - User display name (truncated with ellipsis if needed)
   - Sign Out button (Lucide `LogOut` icon)
   - Collapsed: avatar only, sign-out on hover/click

6. **Responsive Behavior:**
   - Hidden on mobile (< 768px) — mobile bottom tab bar takes over
   - Visible on tablet and desktop (>= 768px)

```tsx
// apps/web/src/components/layout/sidebar-navigation.tsx
// Primary sidebar navigation with collapsible behavior,
// grouped nav sections, active item styling, and user info.
import { useRouter } from "next/router";
import {
  LayoutDashboard, FolderKanban, Bot, UserCog,
  ScrollText, Settings, ChevronsLeft, ChevronsRight, LogOut,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;    // Overline-styled section label
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "WORKSPACE",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Projects", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { label: "Workers", href: "/workers", icon: Bot },
      { label: "Personas", href: "/personas", icon: UserCog },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Audit", href: "/audit", icon: ScrollText },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
```

## Acceptance Criteria

- [ ] Sidebar renders at 240px expanded width and 64px collapsed width
- [ ] laila.works wordmark displays at top when expanded, logomark when collapsed
- [ ] Navigation sections are grouped under WORKSPACE, MANAGEMENT, and SYSTEM headers
- [ ] Section headers use Overline typography style (11px, semibold, uppercase, 0.5px letter-spacing)
- [ ] Active navigation item shows 3px indigo-500 left border, indigo-600 text, and indigo-50 background
- [ ] Non-active items show zinc-600 text and hover state with zinc-100 background
- [ ] Each navigation item has a Lucide icon and text label
- [ ] Collapse/expand toggle button works with smooth 200ms width transition
- [ ] Collapsed state is persisted in localStorage and restored on page load
- [ ] User avatar (32px, rounded) and display name appear at bottom when expanded
- [ ] Sign Out button is accessible in both expanded and collapsed states
- [ ] Sidebar is hidden on mobile viewports (< 768px)
- [ ] Sidebar is visible on tablet and desktop viewports (>= 768px)
- [ ] Navigation links use Next.js `Link` component for client-side routing
- [ ] Active item detection works correctly with `useRouter().pathname`
- [ ] All interactive elements are keyboard accessible (Tab, Enter, Space)
- [ ] ARIA attributes are correct: `role="navigation"`, `aria-label="Main navigation"`, `aria-current="page"` on active item

## Technical Notes

- Use `next/link` for navigation items to enable client-side routing without full page reloads.
- Use `useRouter().pathname` to determine the active navigation item. Consider using `startsWith` for nested routes (e.g., `/projects/123` should still highlight "Projects").
- Persist the collapsed state in `localStorage` with a key like `laila-sidebar-collapsed`. Use a `useEffect` to read the initial state on mount to avoid hydration mismatches.
- The collapse/expand transition should animate `width` with `transition-all duration-200 ease-in-out`. Ensure text labels fade out before the width fully collapses to prevent text wrapping.
- For the user avatar, fall back to initials (first letter of name in indigo-500 bg, white text) if no profile image is available.
- Use CSS `overflow: hidden` on nav item text during collapse to prevent text overflow.

## References

- **Design Specification:** Section 3.1 (Navigation), Section 3.1.1 (Sidebar), Section 3.1.2 (Active States)
- **Functional Requirements:** FR-NAV-001 (sidebar navigation), FR-NAV-002 (collapse/expand)
- **Lucide Icons Docs:** Icon component usage with className prop
- **Next.js Docs:** Link component, useRouter hook

## Estimated Complexity

High — The sidebar involves multiple interactive states (expanded/collapsed, active items, hover), smooth animations, localStorage persistence, responsive hiding, and proper accessibility attributes. The user section adds authentication state awareness.
