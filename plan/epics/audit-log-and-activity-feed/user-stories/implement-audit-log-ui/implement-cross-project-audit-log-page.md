# Implement Cross-Project Audit Log Page

## Task Details

- **Title:** Implement Cross-Project Audit Log Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Audit Log UI](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** Implement Audit Entry Component

## Description

Implement the Audit Log page that displays all audit events across all projects in strict chronological order (newest first). The page shows a continuous list of events with "Load More" pagination and an export button. This is a top-level page accessible from the main navigation sidebar.

### Audit Log Page

```typescript
// apps/web/src/pages/audit.tsx
// Cross-project audit log page.
// Displays all audit events across all projects, newest first.

import { useInfiniteQuery } from "@tanstack/react-query";
import { AuditEntry } from "@/components/audit/audit-entry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { auditKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import { ScrollText, Download } from "lucide-react";
import type { AuditEvent } from "@laila/shared";

/**
 * AuditLogPage renders:
 *
 * 1. Page header:
 *    - H1: "Audit Log" with ScrollText icon
 *    - Export button (ghost variant, Download icon) — right-aligned
 *    - Breadcrumb: Home > Audit Log
 *
 * 2. Event list:
 *    - Chronological list of audit events, newest first
 *    - Each event rendered using AuditEntry with showProject=true
 *    - No filter controls in v1 (strict chronological view)
 *    - Dividers between events (handled by AuditEntry's border-b)
 *
 * 3. "Load More" button:
 *    - Centered below the event list
 *    - Disabled while loading more (shows spinner)
 *    - Hidden when all events have been loaded (hasNextPage === false)
 *    - Uses TanStack Query's infinite query for cursor-based pagination
 *
 * 4. Empty state:
 *    - "No audit events recorded"
 *    - Subtle description: "Events will appear here as changes are made
 *      across your projects."
 *    - ScrollText icon (48px, text-zinc-300)
 *
 * 5. Loading state:
 *    - Skeleton rows matching the AuditEntry layout
 *    - 10 skeleton rows for initial load
 */
```

### Infinite Query

```typescript
// TanStack Query infinite query for paginated audit events.
// Uses cursor-based pagination with DynamoDB's lastEvaluatedKey.

const useAuditEvents = () => {
  return useInfiniteQuery({
    queryKey: auditKeys.all(),
    queryFn: ({ pageParam }) =>
      apiClient.get("/api/v1/audit-events", {
        params: {
          limit: 50,
          cursor: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.lastEvaluatedKey ?? undefined,
  });
};

/**
 * Renders flattened events from all pages:
 *
 * const allEvents = data?.pages.flatMap((page) => page.events) ?? [];
 *
 * {allEvents.map((event) => (
 *   <AuditEntry
 *     key={event.eventId}
 *     event={event}
 *     showProject={true}
 *   />
 * ))}
 *
 * <Button
 *   onClick={() => fetchNextPage()}
 *   disabled={!hasNextPage || isFetchingNextPage}
 * >
 *   {isFetchingNextPage ? "Loading..." : "Load More"}
 * </Button>
 */
```

### API Endpoint

```typescript
// apps/web/src/pages/api/v1/audit-events/index.ts
// API route for querying audit events across all projects.

/**
 * GET /api/v1/audit-events
 * Query: { limit: number, cursor?: string }
 * Returns: { events: AuditEvent[], lastEvaluatedKey?: string }
 *
 * - Queries the CrossProjectIndex GSI on the DynamoDB table
 * - Returns events sorted by timestamp descending (newest first)
 * - cursor is the encoded lastEvaluatedKey from the previous page
 * - Requires human auth (Google OAuth session)
 */
```

## Acceptance Criteria

- [ ] Audit Log page is accessible at `/audit` from the main navigation sidebar
- [ ] Page header displays "Audit Log" with ScrollText icon
- [ ] Page header includes an export button with Download icon (ghost variant)
- [ ] Breadcrumb shows "Home > Audit Log"
- [ ] Events are displayed in strict chronological order, newest first
- [ ] Each event uses the AuditEntry component with `showProject={true}` to display the project name
- [ ] "Load More" button appears below the event list for pagination
- [ ] "Load More" button uses TanStack Query's `fetchNextPage()` for cursor-based pagination
- [ ] "Load More" button shows "Loading..." with spinner while fetching the next page
- [ ] "Load More" button is hidden when all events have been loaded
- [ ] Each page fetches 50 events from the API
- [ ] Empty state displays "No audit events recorded" with ScrollText icon and description
- [ ] Loading state shows 10 skeleton rows matching the AuditEntry layout
- [ ] API endpoint `GET /api/v1/audit-events` queries the DynamoDB CrossProjectIndex GSI
- [ ] API endpoint supports `limit` and `cursor` query parameters
- [ ] API endpoint requires human authentication
- [ ] No `any` types are used in the implementation

## Technical Notes

- TanStack Query v5's `useInfiniteQuery` is the ideal tool for cursor-based pagination. The `getNextPageParam` function extracts the cursor from the API response for the next page request.
- DynamoDB's `lastEvaluatedKey` is used as the pagination cursor. It should be base64-encoded when passed as a query parameter and decoded on the server side before passing to the DynamoDB query.
- The `flatMap` pattern (`data.pages.flatMap(p => p.events)`) flattens all loaded pages into a single array for rendering.
- No filter controls are included in v1 to keep the initial implementation simple. Filtering by entity type, actor type, date range, etc. can be added in a future iteration.
- The page should work correctly even when audit events are being written concurrently (new events may appear at the top of the list on the next poll/refresh).

## References

- **TanStack Query v5:** `useInfiniteQuery`, cursor-based pagination
- **Shared Component:** AuditEntry component from the previous task
- **API:** `GET /api/v1/audit-events` endpoint
- **DynamoDB:** CrossProjectIndex GSI, `lastEvaluatedKey` pagination
- **Design System:** PageHeader, Button, Skeleton from shadcn/ui
- **Icons:** Lucide React — ScrollText, Download

## Estimated Complexity

Medium — Standard infinite query page with cursor-based pagination. The API endpoint requires DynamoDB GSI querying with cursor handling. The UI is straightforward using the shared AuditEntry component.
