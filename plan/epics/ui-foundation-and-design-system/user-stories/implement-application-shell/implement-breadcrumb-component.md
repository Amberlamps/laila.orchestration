# Implement Breadcrumb Component

## Task Details

- **Title:** Implement Breadcrumb Component
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Application Shell & Navigation](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a breadcrumb navigation component that provides hierarchical page context throughout the application. Breadcrumbs are critical for the deeply nested entity hierarchy (Project > Epic > Story > Task) to help users understand their current location and navigate back up the hierarchy.

### Visual Specification

- **Font:** 13px Body Small style
- **Ancestor links:** zinc-500 text, clickable with underline on hover
- **Current page:** zinc-950 text, not clickable (rendered as `<span>` not `<a>`)
- **Separator:** "/" character in zinc-400
- **Spacing:** 6px gap between segments
- **Truncation:** If depth exceeds 5 levels, collapse middle items into "..." with a Tooltip or Popover showing hidden items

### Component API

```tsx
// apps/web/src/components/ui/breadcrumb.tsx
// Hierarchical breadcrumb navigation for nested entity pages.
// Supports automatic truncation when depth exceeds 5 levels.

interface BreadcrumbItem {
  label: string; // Display text for the breadcrumb segment
  href?: string; // Link target — omit for current page (last item)
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Maximum visible segments before truncation (default: 5) */
  maxVisible?: number;
  className?: string;
}

// Usage example for a task detail page:
// <Breadcrumb items={[
//   { label: "Projects", href: "/projects" },
//   { label: "My Project", href: "/projects/abc123" },
//   { label: "Epic: User Auth", href: "/projects/abc123/epics/def456" },
//   { label: "Story: Login Flow", href: "/projects/abc123/stories/ghi789" },
//   { label: "Task: Build Form" },  // current page, no href
// ]} />
```

### Truncation Behavior

When `items.length > maxVisible`:

1. Always show the first item (root)
2. Show "..." as a clickable element that opens a Popover listing hidden items
3. Show the last `maxVisible - 2` items
4. Hidden items in the Popover are clickable links

## Acceptance Criteria

- [ ] Breadcrumb renders a horizontal list of ancestor links separated by "/" characters
- [ ] Ancestor links use zinc-500 color and show underline on hover
- [ ] Current page (last item) uses zinc-950 color and is not a link
- [ ] "/" separators use zinc-400 color
- [ ] Font size is 13px (Body Small typography)
- [ ] When depth exceeds `maxVisible` (default 5), middle items collapse into "..."
- [ ] Clicking "..." opens a Popover or Tooltip showing the hidden items as clickable links
- [ ] First and last items are always visible (never truncated)
- [ ] Navigation links use Next.js `Link` for client-side routing
- [ ] Component has `<nav aria-label="Breadcrumb">` wrapper
- [ ] Uses `<ol>` list with `role="list"` for semantic structure
- [ ] Current page item has `aria-current="page"` attribute
- [ ] Component accepts a `className` prop for layout customization

## Technical Notes

- Use semantic HTML: `<nav aria-label="Breadcrumb">` wrapping an `<ol>` element. Each breadcrumb item is an `<li>`. The separator can be added via CSS `::before` pseudo-elements or inline spans with `aria-hidden="true"`.
- For truncation, use the shadcn `Popover` component to display hidden items. The "..." trigger should be keyboard accessible (focusable, opens on Enter/Space).
- Consider creating a `useBreadcrumbs()` hook or a context-based approach that allows pages to declaratively set their breadcrumb trail without prop drilling.
- The breadcrumb component should be used inside the page content area, not inside the sidebar.

## References

- **Design Specification:** Section 3.2 (Breadcrumb Navigation), Section 3.2.1 (Truncation)
- **Functional Requirements:** FR-NAV-005 (breadcrumb navigation), FR-NAV-006 (entity hierarchy context)
- **WAI-ARIA Authoring Practices:** Breadcrumb pattern
- **shadcn/ui Docs:** Popover component for truncation overflow

## Estimated Complexity

Medium — The basic breadcrumb is simple, but the truncation logic with a Popover for hidden items and proper ARIA semantics adds complexity.
