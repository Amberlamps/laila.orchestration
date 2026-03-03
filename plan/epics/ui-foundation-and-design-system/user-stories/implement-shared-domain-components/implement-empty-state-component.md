# Implement Empty State Component

## Task Details

- **Title:** Implement Empty State Component
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build an `EmptyState` component displayed when a list, table, or container has no content to show. The component provides visual guidance and a call-to-action to help users take the next step.

### Visual Specification

- **Layout:** Centered vertically and horizontally within the parent container
- **Icon:** 48px Lucide icon in zinc-300 (monochrome, subdued)
- **Title:** H3 typography (16px, semibold, zinc-900)
- **Description:** Body typography (14px, zinc-500), max-width 400px, text-center
- **CTA Button:** Primary button variant (indigo-500 bg)
- **Secondary Link (optional):** Text link below button, Body Small (13px), indigo-600 color

### Component API

```tsx
// apps/web/src/components/ui/empty-state.tsx
// Empty state display for lists and containers with no content.
// Shows icon, title, description, and action button to guide the user.
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  /** Lucide icon component to display (rendered at 48px, zinc-300) */
  icon: React.ComponentType<{ className?: string }>;
  /** Title text (e.g., "No Projects Yet") */
  title: string;
  /** Description text explaining what the user can do */
  description: string;
  /** Primary CTA button label (e.g., "+ Create Project") */
  actionLabel?: string;
  /** Called when the CTA button is clicked */
  onAction?: () => void;
  /** Optional secondary link text (e.g., "Learn about projects") */
  secondaryLabel?: string;
  /** Called when the secondary link is clicked */
  onSecondary?: () => void;
  className?: string;
}

// Usage examples:
// <EmptyState
//   icon={FolderKanban}
//   title="No Projects Yet"
//   description="Create your first project to start orchestrating AI workers on structured tasks."
//   actionLabel="+ Create Project"
//   onAction={() => setCreateModalOpen(true)}
// />
//
// <EmptyState
//   icon={Bot}
//   title="No Workers"
//   description="Workers are AI execution agents. Create one and assign it to a project to start processing tasks."
//   actionLabel="+ Create Worker"
//   onAction={() => setCreateModalOpen(true)}
//   secondaryLabel="Learn about workers"
//   onSecondary={() => router.push("/docs/workers")}
// />
```

## Acceptance Criteria

- [ ] EmptyState centers vertically and horizontally within its parent container
- [ ] Icon renders at 48px size in zinc-300 color
- [ ] Title uses H3 typography (16px, semibold, zinc-900)
- [ ] Description uses Body typography (14px, zinc-500), centered, max-width 400px
- [ ] CTA button uses primary variant (indigo-500 bg) when `actionLabel` and `onAction` are provided
- [ ] CTA button is not rendered when `actionLabel` is omitted
- [ ] Secondary link renders below the button when `secondaryLabel` is provided
- [ ] Secondary link uses 13px indigo-600 text with underline on hover
- [ ] Component has appropriate vertical spacing between icon, title, description, and action (16px gaps)
- [ ] Component accepts a `className` prop for additional styling
- [ ] Empty state is visually distinct from loading state (no shimmer animation)
- [ ] Component works correctly inside tables (spanning full table width), card grids, and general containers
- [ ] All text content is accessible (proper heading level, readable text)

## Technical Notes

- The component should use `flex` centering (`flex flex-col items-center justify-center`) and have a minimum height (e.g., `min-h-[300px]`) to ensure it looks correct even in short containers.
- For use inside tables, the empty state can be rendered inside a `<tr>` with a single `<td colSpan={columns}>` that spans the full table width. Alternatively, conditionally render the empty state instead of the table entirely.
- The icon is passed as a component type (not a rendered element), so it can be rendered with the correct size and color classes within the EmptyState component.
- Keep the description text concise (1-2 sentences) and actionable — it should explain what the user can do, not just state that nothing exists.

## References

- **Design Specification:** Section 3.12 (Empty States), Section 3.12.1 (Empty State Variants)
- **Functional Requirements:** FR-UI-013 (empty state display), FR-UI-014 (empty state CTA)
- **Lucide Icons Docs:** Icon component usage, sizing

## Estimated Complexity

Low — Simple layout component with straightforward props and styling. No complex state management or interactions.
