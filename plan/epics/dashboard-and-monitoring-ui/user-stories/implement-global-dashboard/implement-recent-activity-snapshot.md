# Implement Recent Activity Snapshot

## Task Details

- **Title:** Implement Recent Activity Snapshot
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Global Dashboard](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a recent activity section on the global dashboard that displays the last 20 audit events across all projects. Each entry shows the timestamp, actor, project name, action performed, and target entity with links to the relevant detail pages. Includes a "View all in Audit" link to the full audit log page.

### Activity Snapshot Component

```typescript
// apps/web/src/components/dashboard/recent-activity-snapshot.tsx
// Displays the last 20 audit events across all projects.
// Uses the cross-project audit events API endpoint.

import { useQuery } from '@tanstack/react-query';
import { dashboardKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { AuditEntryRow } from '@/components/audit/audit-entry-row';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import type { AuditEvent } from '@laila/shared';

/**
 * RecentActivitySnapshot renders:
 *
 * - Section heading: "Recent Activity" with Activity icon
 * - Chronological list (newest first) of the last 20 audit events
 * - Each entry displays:
 *   - Timestamp: relative time (e.g., "2 minutes ago") with absolute
 *     datetime shown on hover via tooltip
 *   - Actor: worker name (with Bot icon), user name (with User icon),
 *     or "System" (italic, text-zinc-500)
 *   - Project name: linked to /projects/:id
 *   - Action: human-readable action description (e.g., "created", "updated status to in_progress")
 *   - Target entity: entity type + name, linked to detail page
 * - "View all in Audit" link at the bottom, navigating to /audit
 */
```

### Data Fetching

```typescript
// Fetch the most recent audit events across all projects.
// Endpoint returns events sorted by timestamp descending.

const useRecentActivity = () => {
  return useQuery({
    queryKey: dashboardKeys.recentActivity(),
    queryFn: () =>
      apiClient.get('/api/v1/audit-events', {
        params: { limit: 20, sort_order: 'desc' },
      }),
  });
};
```

### Timestamp Formatting

```typescript
// apps/web/src/lib/format-relative-time.ts
// Utility for formatting timestamps as relative time strings.
// Falls back to absolute date for events older than 7 days.

/**
 * formatRelativeTime(timestamp: string): string
 * - < 60 seconds: "just now"
 * - < 60 minutes: "X minutes ago"
 * - < 24 hours: "X hours ago"
 * - < 7 days: "X days ago"
 * - >= 7 days: formatted absolute date (e.g., "Feb 28, 2026")
 *
 * Uses Intl.RelativeTimeFormat for locale-aware formatting.
 */
```

## Acceptance Criteria

- [ ] Dashboard page displays a "Recent Activity" section with an Activity icon from Lucide
- [ ] Section renders the last 20 audit events across all projects, newest first
- [ ] Each entry displays a relative timestamp (e.g., "2 minutes ago") with absolute datetime on hover
- [ ] Each entry displays the actor with appropriate icon: Bot for workers, User for humans, italic gray text for "System"
- [ ] Each entry displays the project name as a link to `/projects/:id`
- [ ] Each entry displays a human-readable action description
- [ ] Each entry displays the target entity type and name as a link to the entity detail page
- [ ] A "View all in Audit" link is displayed at the bottom, navigating to `/audit`
- [ ] Loading state displays Skeleton row placeholders
- [ ] Empty state displays "No recent activity" message when no events exist
- [ ] Relative time formatting uses `Intl.RelativeTimeFormat` for locale-aware output
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `AuditEntryRow` component will be shared with the full Audit Log page (Epic 12). If Epic 12 is not yet started, implement a local version here and extract it when Epic 12 work begins.
- Entity links should be constructed from the entity type and ID: `/projects/:projectId/epics/:epicId`, `/projects/:projectId/stories/:storyId`, etc.
- Use the `title` attribute or a shadcn/ui Tooltip component for the absolute timestamp on hover.
- The relative time display should update dynamically if the component is mounted for an extended period (polling will handle data refresh, but displayed relative times should not become stale).

## References

- **Audit Events API:** `GET /api/v1/audit-events` endpoint from Epic 12
- **Design System:** Skeleton, Tooltip components from Epic 8
- **Icons:** Lucide React — Activity, Bot, User
- **Formatting:** `Intl.RelativeTimeFormat` browser API

## Estimated Complexity

Medium — Requires multiple entity link construction patterns, relative time formatting utility, and conditional actor rendering with icons.
