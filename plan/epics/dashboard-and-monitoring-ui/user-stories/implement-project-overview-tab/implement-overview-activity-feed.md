# Implement Overview Activity Feed

## Task Details

- **Title:** Implement Overview Activity Feed
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement an activity feed section on the project overview tab that displays the last 50 audit log entries scoped to this project. Each entry shows the timestamp, actor, action, and target entity with links to the relevant detail pages. A "View all activity" link navigates to the project's Activity tab for the complete history.

### Activity Feed Component

```typescript
// apps/web/src/components/project/overview/overview-activity-feed.tsx
// Displays the last 50 audit events scoped to a specific project.
// Uses the project-scoped audit events API endpoint.

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AuditEntryRow } from '@/components/audit/audit-entry-row';
import { Skeleton } from '@/components/ui/skeleton';
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import type { AuditEvent } from '@laila/shared';

/**
 * OverviewActivityFeed renders:
 *
 * - Card with header: "Recent Activity" with Activity icon
 * - Chronological list (newest first) of the last 50 audit events
 *   scoped to this project
 * - Each entry displays:
 *   - Timestamp: relative time with absolute on hover
 *   - Actor: worker name (Bot icon), user name (User icon),
 *     or "System" (italic, text-zinc-500)
 *   - Action: human-readable description (e.g., "updated status to in_progress")
 *   - Target entity: entity type + name, linked to detail page
 * - "View all activity" link at the bottom, navigating to
 *   /projects/:id?tab=activity (the Activity tab of the project detail page)
 *
 * Max height with scroll: max-h-[480px] overflow-y-auto
 * to prevent the feed from pushing other content down.
 */
```

### Data Fetching

```typescript
// Fetch the most recent audit events for a specific project.

const useProjectActivity = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.activity(projectId),
    queryFn: () =>
      apiClient.get(`/api/v1/projects/${projectId}/audit-events`, {
        params: { limit: 50, sort_order: 'desc' },
      }),
    enabled: !!projectId,
  });
};
```

## Acceptance Criteria

- [ ] Overview tab displays a "Recent Activity" card with Activity icon
- [ ] Card renders the last 50 audit events scoped to this project, newest first
- [ ] Each entry displays a relative timestamp with absolute datetime on hover
- [ ] Each entry displays the actor with appropriate styling: Bot icon for workers, User icon for humans, italic gray for "System"
- [ ] Each entry displays a human-readable action description
- [ ] Each entry displays the target entity type and name as a link to the detail page
- [ ] A "View all activity" link is displayed at the bottom, navigating to the project Activity tab
- [ ] Card content has a maximum height of 480px with vertical scrolling for overflow
- [ ] Loading state displays Skeleton row placeholders within the card
- [ ] Empty state displays "No activity recorded yet" when no events exist
- [ ] Uses the shared AuditEntryRow component (or a local implementation if Epic 12 is not yet built)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `AuditEntryRow` component will be shared with Epic 12 (Audit Log & Activity Feed). If the shared component is not yet available, implement a local version that matches the expected API and extract it during Epic 12 work.
- The "View all activity" link navigates to the project detail page with the Activity tab selected. This can be implemented as `/projects/:id?tab=activity` or `/projects/:id/activity` depending on the routing structure from Epic 9.
- Entity links within the feed should be relative to the current project: `/projects/:projectId/epics/:epicId`, `/projects/:projectId/stories/:storyId`, etc.
- The max-height scroll container should use `scrollbar-thin` and `scrollbar-thumb-zinc-300` classes if custom scrollbar styling is available in the Tailwind configuration.

## References

- **Shared Component:** AuditEntryRow from Epic 12 (or local implementation)
- **Design System:** Card, Skeleton components from shadcn/ui
- **Icons:** Lucide React — Activity, Bot, User
- **API:** `GET /api/v1/projects/:id/audit-events` endpoint
- **Navigation:** Project detail tabs from Epic 9

## Estimated Complexity

Medium — Similar to the dashboard recent activity snapshot but scoped to a single project, with scrollable container and tab navigation link.
