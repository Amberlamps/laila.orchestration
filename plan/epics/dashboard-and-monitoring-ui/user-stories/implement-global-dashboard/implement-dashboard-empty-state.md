# Implement Dashboard Empty State

## Task Details

- **Title:** Implement Dashboard Empty State
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Global Dashboard](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the empty state for the global dashboard when the authenticated user has no projects. This is the first screen new users see after signing in. It should provide a welcoming experience with clear guidance on how to get started.

### Empty State Component

```typescript
// apps/web/src/components/dashboard/dashboard-empty-state.tsx
// Full-page empty state displayed when the user has zero projects.
// Uses the EmptyState component from the design system with custom content.

import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { FolderKanban, Plus, BookOpen, Sparkles } from 'lucide-react';
import Link from 'next/link';

/**
 * DashboardEmptyState renders a centered layout:
 *
 * 1. Illustration area:
 *    - Large FolderKanban icon (48px, text-indigo-400) or a custom SVG illustration
 *    - Subtle background pattern or gradient ring
 *
 * 2. Welcome text:
 *    - Heading: "Welcome to laila.works" (text-2xl, font-semibold)
 *    - Description: "laila.works orchestrates AI agents to break down and execute
 *      complex software projects. Create your first project to get started."
 *      (text-zinc-500, max-w-md, text-center)
 *
 * 3. Primary CTA:
 *    - "Create your first project" button (primary variant, large size)
 *    - Plus icon prefix
 *    - Links to /projects/new
 *
 * 4. Contextual guidance (optional, below CTA):
 *    - Three inline hints with icons:
 *      a. "Define epics, stories, and tasks" (BookOpen icon)
 *      b. "Assign AI workers with personas" (Sparkles icon)
 *      c. "Monitor progress in real-time" (Activity icon)
 *    - Styled as subtle text-sm, text-zinc-400 with icon accent
 *
 * Layout: centered vertically and horizontally within the main content area.
 * Minimum height: min-h-[60vh] to ensure it feels spacious.
 */
```

### Conditional Rendering

```typescript
// apps/web/src/pages/dashboard.tsx (or wherever the dashboard page is rooted)
// The dashboard page conditionally renders the empty state
// when the project count is zero.

/**
 * Rendering logic:
 * - If projects query is loading: show full-page skeleton
 * - If projects query returns 0 projects: show DashboardEmptyState
 * - If projects query returns >= 1 project: show full dashboard
 *   (KPI row, project grid, activity, workers table)
 */
```

## Acceptance Criteria

- [ ] Dashboard displays the empty state when the authenticated user has zero projects
- [ ] Empty state is centered vertically and horizontally with minimum height of 60vh
- [ ] A large FolderKanban icon (or illustration) is displayed at the top of the empty state
- [ ] Heading reads "Welcome to laila.works" in text-2xl font-semibold
- [ ] Description explains the platform purpose and prompts the user to create a project
- [ ] Primary CTA button reads "Create your first project" with a Plus icon
- [ ] CTA button links to `/projects/new` for project creation
- [ ] Three contextual guidance hints are displayed below the CTA with appropriate Lucide icons
- [ ] Empty state uses the EmptyState component from the design system (Epic 8) as its foundation
- [ ] The dashboard page conditionally renders the empty state vs. full dashboard based on project count
- [ ] Transition from empty state to full dashboard works correctly after creating the first project (cache invalidation triggers re-render)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The EmptyState component from Epic 8 should provide the centered layout container, and this task customizes its content slots for the dashboard context.
- After a project is created via `/projects/new`, the user navigates back to the dashboard. TanStack Query's cache invalidation (on the projects list key) should automatically trigger a re-fetch, causing the dashboard to transition from empty state to full dashboard.
- The illustration can be a simple Lucide icon composition rather than a custom SVG, to avoid blocking on design assets.
- Contextual guidance hints are optional in the initial implementation and can be added iteratively.

## References

- **Design System:** EmptyState, Button components from Epic 8
- **Icons:** Lucide React — FolderKanban, Plus, BookOpen, Sparkles, Activity
- **Navigation:** Next.js Link component for CTA routing
- **UX Pattern:** Empty state best practices — clear value proposition + single primary action

## Estimated Complexity

Low — Primarily a presentational component with conditional rendering logic. No complex data fetching or state management.
