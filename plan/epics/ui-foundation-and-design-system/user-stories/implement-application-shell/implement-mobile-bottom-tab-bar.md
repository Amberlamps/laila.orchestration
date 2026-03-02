# Implement Mobile Bottom Tab Bar

## Task Details

- **Title:** Implement Mobile Bottom Tab Bar
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Application Shell & Navigation](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a mobile bottom tab bar navigation component that replaces the sidebar on small viewports (< 768px). The tab bar provides quick access to the five most important sections of the application, with a "More" menu for additional items.

### Layout and Dimensions

- **Position:** Fixed bottom of viewport
- **Height:** 56px + safe area inset (for devices with home indicators)
- **Width:** Full viewport width
- **Background:** White with zinc-200 top border
- **Visibility:** Shown on mobile (< 768px), hidden on tablet/desktop (>= 768px)

### Tab Items

1. **Dashboard** — Lucide `LayoutDashboard` icon, links to `/dashboard`
2. **Projects** — Lucide `FolderKanban` icon, links to `/projects`
3. **Workers** — Lucide `Bot` icon, links to `/workers`
4. **Personas** — Lucide `UserCog` icon, links to `/personas`
5. **More** — Lucide `MoreHorizontal` icon, opens a bottom sheet or popover with:
   - Audit (links to `/audit`)
   - Settings (links to `/settings`)
   - Sign Out (triggers sign-out action)

### Active State

- Active tab: indigo-500 icon + indigo-500 label text
- Inactive tab: zinc-400 icon + zinc-500 label text
- 10px label font below icon

```tsx
// apps/web/src/components/layout/mobile-tab-bar.tsx
// Bottom tab bar for mobile viewports (< 768px).
// Provides quick access to primary sections with a "More" overflow menu.
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard, FolderKanban, Bot, UserCog, MoreHorizontal,
} from "lucide-react";

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_TABS: TabItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Workers", href: "/workers", icon: Bot },
  { label: "Personas", href: "/personas", icon: UserCog },
];
```

## Acceptance Criteria

- [ ] Bottom tab bar renders fixed at the bottom of the viewport on mobile (< 768px)
- [ ] Tab bar is 56px tall plus safe area inset padding (`pb-safe` or `env(safe-area-inset-bottom)`)
- [ ] Tab bar is hidden on viewports >= 768px
- [ ] Five tabs are shown: Dashboard, Projects, Workers, Personas, More
- [ ] Active tab shows indigo-500 icon and label color
- [ ] Inactive tabs show zinc-400 icon and zinc-500 label color
- [ ] Each tab has an icon (20px) above a label (10px font)
- [ ] "More" tab opens an overlay/popover with Audit, Settings, and Sign Out options
- [ ] Navigation links use Next.js `Link` component for client-side routing
- [ ] Active tab detection uses `useRouter().pathname`
- [ ] Tab bar does not obscure page content (main content has bottom padding matching tab bar height)
- [ ] All tabs are keyboard accessible
- [ ] Tab bar has `role="navigation"` and `aria-label="Mobile navigation"`

## Technical Notes

- Use `env(safe-area-inset-bottom)` CSS environment variable to add padding for devices with home indicators (iPhone X+, etc.). Tailwind v4 supports this via the `pb-safe` utility or a custom utility.
- The "More" menu can use the shadcn `Popover` component positioned above the tab, or a custom bottom sheet pattern for a more native mobile feel.
- Ensure main content area has `padding-bottom` equal to the tab bar height to prevent content from being hidden behind it.
- Use `z-50` to ensure the tab bar stays above scrolling content.
- Consider using `will-change: transform` for smooth scroll performance on mobile browsers.

## References

- **Design Specification:** Section 3.1.3 (Mobile Navigation), Section 3.1.4 (Tab Bar)
- **Functional Requirements:** FR-NAV-003 (mobile navigation), FR-NAV-004 (responsive breakpoints)
- **Next.js Docs:** Link component, useRouter hook
- **Lucide Icons Docs:** Icon sizing and styling

## Estimated Complexity

Medium — The tab bar itself is straightforward, but handling safe area insets, the "More" overflow menu, and ensuring content does not get obscured requires attention to mobile-specific concerns.
