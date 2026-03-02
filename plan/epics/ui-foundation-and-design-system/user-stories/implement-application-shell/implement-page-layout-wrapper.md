# Implement Page Layout Wrapper

## Task Details

- **Title:** Implement Page Layout Wrapper
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Application Shell & Navigation](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Implement Sidebar Navigation, Implement Mobile Bottom Tab Bar

## Description

Create the `AppLayout` component that serves as the primary layout wrapper for all authenticated pages. This component composes the sidebar navigation, mobile bottom tab bar, and main content area into a cohesive responsive shell.

### Layout Structure

```
+--sidebar--+--main-content-area---------------------------+
|            |  [breadcrumb]                                |
| [logo]     |  [page content]                              |
| [nav]      |                                              |
|            |                                              |
| [toggle]   |                                              |
| [user]     |                                              |
+------------+----------------------------------------------+
               [mobile tab bar - mobile only]
```

### Responsive Breakpoints

- **Desktop (>= 1024px):** 12-column grid, sidebar expanded (240px), content fills remaining width
- **Tablet (768px - 1023px):** 8-column grid, sidebar collapsed (64px) by default, content fills remaining width
- **Mobile (< 768px):** 4-column grid, no sidebar, bottom tab bar, full-width content, 16px horizontal padding

### Content Area Constraints

- **Forms/detail pages:** `max-width: 1200px` with `margin: 0 auto` for centered readability
- **Tables/dashboards:** Full available width (no max-width constraint)
- **Horizontal padding:** 32px on desktop, 24px on tablet, 16px on mobile
- **Top padding:** 32px on desktop/tablet, 16px on mobile
- **Bottom padding on mobile:** Height of mobile tab bar (56px + safe area) to prevent content occlusion

```tsx
// apps/web/src/components/layout/app-layout.tsx
// Primary layout wrapper for all authenticated pages.
// Composes sidebar (desktop/tablet) and mobile tab bar into a responsive shell.
// The `variant` prop controls content max-width behavior.
import { type ReactNode } from "react";
import { SidebarNavigation } from "./sidebar-navigation";
import { MobileTabBar } from "./mobile-tab-bar";

interface AppLayoutProps {
  children: ReactNode;
  /** "constrained" applies max-width: 1200px for forms/detail pages.
   *  "full" uses all available width for tables/dashboards. */
  variant?: "constrained" | "full";
}

export function AppLayout({ children, variant = "constrained" }: AppLayoutProps) {
  // The sidebar width is dynamic based on collapsed state.
  // Use CSS margin-left to offset content area from sidebar.
  // On mobile, sidebar is hidden and content is full-width.
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar — hidden on mobile, visible on tablet+ */}
      <SidebarNavigation />

      {/* Main content area — offset by sidebar width on desktop/tablet */}
      <main
        className={cn(
          "transition-[margin-left] duration-200 ease-in-out",
          "px-4 pt-4 md:px-6 md:pt-8 lg:px-8",
          "pb-20 md:pb-8", // extra bottom padding on mobile for tab bar
          variant === "constrained" && "max-w-[1200px] mx-auto",
        )}
      >
        {children}
      </main>

      {/* Mobile tab bar — visible on mobile, hidden on tablet+ */}
      <MobileTabBar />
    </div>
  );
}
```

## Acceptance Criteria

- [ ] `AppLayout` component wraps sidebar, main content, and mobile tab bar
- [ ] Desktop (>= 1024px): 12-column grid, sidebar expanded, content fills remaining width
- [ ] Tablet (768px - 1023px): 8-column grid, sidebar collapsed by default, content fills remaining width
- [ ] Mobile (< 768px): no sidebar, bottom tab bar, full-width content
- [ ] Content area has correct horizontal padding (32px desktop, 24px tablet, 16px mobile)
- [ ] `variant="constrained"` applies `max-width: 1200px` with centered content
- [ ] `variant="full"` allows content to fill all available width
- [ ] Mobile content has bottom padding to clear the mobile tab bar
- [ ] Content area smoothly transitions `margin-left` when sidebar collapses/expands (200ms)
- [ ] Background color is zinc-50 for the full page
- [ ] Layout renders correctly during page transitions (no flash of unstyled content)
- [ ] Component accepts `children` as ReactNode and renders them in the main content area
- [ ] Layout does not cause horizontal overflow or unnecessary horizontal scrollbars
- [ ] Component is used as the default wrapper in all authenticated pages

## Technical Notes

- The sidebar collapsed state affects the `margin-left` of the content area. Use a shared state (React context or zustand store) to coordinate between the sidebar component and the layout wrapper.
- Use CSS `transition-[margin-left]` for smooth content area shift during sidebar collapse/expand. Tailwind v4 supports arbitrary transition properties.
- Consider creating an `AppLayoutContext` that provides the current sidebar state (collapsed/expanded) and screen size category to child components that need responsive behavior.
- For the grid system, Tailwind's built-in grid utilities (`grid-cols-12`, etc.) can be used, but the actual layout is primarily a sidebar + content flexbox/grid arrangement rather than a traditional 12-column content grid.
- Ensure the layout works correctly with Next.js page transitions. The layout component should be persistent across page navigations (wrap in `_app.tsx` or use a layout pattern).

## References

- **Design Specification:** Section 3.3 (Page Layout), Section 3.3.1 (Responsive Grid), Section 3.3.2 (Content Width)
- **Functional Requirements:** FR-NAV-007 (application shell), FR-NAV-008 (responsive layout)
- **Next.js Docs:** Layout patterns in Pages Router, persistent layouts
- **Tailwind CSS Docs:** Grid, flexbox, responsive utilities

## Estimated Complexity

High — Coordinating three responsive layout regions (sidebar, content, tab bar) with smooth transitions, proper padding at all breakpoints, and two content width variants requires careful CSS architecture and state management.
