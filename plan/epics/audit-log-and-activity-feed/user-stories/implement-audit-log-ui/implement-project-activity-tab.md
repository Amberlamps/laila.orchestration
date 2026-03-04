# Implement Project Activity Tab

## Task Details

- **Title:** Implement Project Activity Tab
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Audit Log UI](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** Implement Audit Entry Component

## Description

Implement the Activity tab within the project detail page that displays audit events scoped to a single project. The tab shows the last 50 events with "Load More" pagination. System-initiated events are styled distinctly. This tab provides project-specific activity history.

### Project Activity Tab Component

```typescript
// apps/web/src/components/project/tabs/project-activity-tab.tsx
// Activity tab content for the project detail page.
// Displays project-scoped audit events, newest first.

import { useInfiniteQuery } from '@tanstack/react-query';
import { AuditEntry } from '@/components/audit/audit-entry';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { Activity } from 'lucide-react';
import type { AuditEvent } from '@laila/shared';

/**
 * ProjectActivityTab renders:
 *
 * 1. Tab content area:
 *    - Heading: "Activity" with Activity icon (within the tab,
 *      not a separate page header)
 *    - Subtitle: "Recent changes and events in this project"
 *      (text-sm, text-zinc-500)
 *
 * 2. Event list:
 *    - Chronological list of audit events for this project, newest first
 *    - Each event rendered using AuditEntry with showProject=false
 *      (project is implicit from the tab context)
 *    - System events (actor.type === "system") are styled with
 *      a subtle left border in zinc-200 and bg-zinc-50 background
 *      to distinguish them from user/worker actions
 *
 * 3. "Load More" button:
 *    - Centered below the event list
 *    - Uses TanStack Query's infinite query for cursor-based pagination
 *    - Disabled while loading more
 *    - Hidden when all events have been loaded
 *
 * 4. Empty state:
 *    - "No activity recorded for this project"
 *    - Activity icon (48px, text-zinc-300)
 *    - Subtle description text
 *
 * 5. Loading state:
 *    - Skeleton rows matching the AuditEntry layout
 *    - 10 skeleton rows for initial load
 *
 * Props:
 * - projectId: string
 */
```

### Project-Scoped Infinite Query

```typescript
// TanStack Query infinite query for project-scoped audit events.

const useProjectAuditEvents = (projectId: string) => {
  return useInfiniteQuery({
    queryKey: projectKeys.auditEvents(projectId),
    queryFn: ({ pageParam }) =>
      apiClient.get(`/api/v1/projects/${projectId}/audit-events`, {
        params: {
          limit: 50,
          cursor: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.lastEvaluatedKey ?? undefined,
    enabled: !!projectId,
  });
};
```

### API Endpoint

```typescript
// apps/web/src/pages/api/v1/projects/[id]/audit-events.ts
// API route for querying audit events scoped to a specific project.

/**
 * GET /api/v1/projects/:id/audit-events
 * Query: { limit: number, cursor?: string }
 * Returns: { events: AuditEvent[], lastEvaluatedKey?: string }
 *
 * - Queries the DynamoDB table with PK = projectId
 * - Returns events sorted by timestamp descending (newest first)
 * - cursor is the encoded lastEvaluatedKey from the previous page
 * - Requires human auth (Google OAuth session)
 * - Returns 404 if the project does not exist
 */
```

### System Event Styling

```typescript
// System events are visually distinguished from user/worker events
// in the project activity tab.

/**
 * System event row styling:
 * - Background: bg-zinc-50/50 (very subtle gray tint)
 * - Left border: border-l-2 border-zinc-200
 * - Actor: italic "System" text in zinc-500
 * - Icon: Settings (14px, text-zinc-400) instead of Bot/User
 *
 * This makes system events visually recede, letting intentional
 * user/worker actions stand out. System events (auto-complete,
 * dependency resolution, timeout reclamation) are important for
 * traceability but are secondary to direct actions.
 *
 * Implementation:
 * <div className={cn(
 *   "border-b border-zinc-100",
 *   event.actor.type === "system" && "bg-zinc-50/50 border-l-2 border-l-zinc-200"
 * )}>
 *   <AuditEntry event={event} showProject={false} />
 * </div>
 */
```

## Acceptance Criteria

- [ ] Activity tab is displayed within the project detail page tab navigation
- [ ] Tab heading shows "Activity" with Activity icon
- [ ] Events are displayed in chronological order, newest first
- [ ] Each event uses the AuditEntry component with `showProject={false}`
- [ ] System events (actor.type === "system") have distinct styling: subtle gray background and left border
- [ ] "Load More" button appears below the event list for cursor-based pagination
- [ ] "Load More" uses TanStack Query's `fetchNextPage()` with cursor from DynamoDB
- [ ] "Load More" button shows loading state and is hidden when all events are loaded
- [ ] Each page fetches 50 events from the project-scoped API
- [ ] Empty state displays "No activity recorded for this project" with Activity icon
- [ ] Loading state shows 10 skeleton rows
- [ ] API endpoint `GET /api/v1/projects/:id/audit-events` queries DynamoDB with project-scoped partition key
- [ ] API endpoint supports `limit` and `cursor` query parameters
- [ ] API endpoint returns 404 if the project does not exist
- [ ] Tab is accessible via URL parameter or tab navigation from Epic 9
- [ ] No `any` types are used in the implementation

## Technical Notes

- The Activity tab is integrated into the project detail page's tab navigation from Epic 9. The tab component receives the `projectId` as a prop and manages its own data fetching.
- The project-scoped query is more efficient than the cross-project query because it uses the table's primary key (projectId) rather than a GSI.
- System event styling wraps the AuditEntry component rather than modifying it, maintaining the shared component's simplicity. The wrapper div adds the conditional background and border classes.
- The tab should preserve its scroll position and loaded pages when the user switches away and comes back. TanStack Query's cache handles this automatically.

## References

- **TanStack Query v5:** `useInfiniteQuery`, cursor-based pagination
- **Shared Component:** AuditEntry component from the previous task
- **API:** `GET /api/v1/projects/:id/audit-events` endpoint
- **DynamoDB:** Primary key query (PK = projectId), `lastEvaluatedKey` pagination
- **Project Detail:** Tab navigation from Epic 9 (Entity Management UI)
- **Icons:** Lucide React — Activity, Settings

## Estimated Complexity

Medium — Similar to the cross-project audit log page but project-scoped with additional system event styling. Integrates into the existing project detail tab navigation.
