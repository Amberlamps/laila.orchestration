# Implement Active Workers Card

## Task Details

- **Title:** Implement Active Workers Card
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a card on the project overview tab that displays all workers currently assigned to in-progress stories within this specific project. Each row shows the worker name and the story they are assigned to, with a link to the story detail page and elapsed time since assignment.

### Active Workers Card Component

```typescript
// apps/web/src/components/project/overview/active-workers-card.tsx
// Card displaying workers assigned to in-progress stories in a project.
// Scoped to a single project (receives projectId as prop).

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { formatElapsedTime } from '@/lib/format-elapsed-time';
import Link from 'next/link';
import { Bot, Clock } from 'lucide-react';
import type { ActiveWorkerAssignment } from '@laila/shared';

/**
 * ActiveWorkersCard renders:
 *
 * - Card header: "Active Workers" with Bot icon and count badge
 * - List of currently assigned workers, each row showing:
 *   - Worker name (linked to worker detail) with Bot icon
 *   - Assigned story title (linked to /projects/:projectId/stories/:storyId)
 *   - Time elapsed since assignment (Clock icon, formatted duration)
 *
 * - Empty state (centered within card):
 *   "No workers currently active."
 *   Subtle text-zinc-500 styling
 *
 * Each row uses a compact layout with space-between alignment.
 * Rows have hover:bg-zinc-50 for interactive feel.
 */
```

### Data Fetching

```typescript
// Fetch active worker assignments scoped to this project.

const useProjectActiveWorkers = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.activeWorkers(projectId),
    queryFn: () => apiClient.get(`/api/v1/projects/${projectId}/workers/active`),
    enabled: !!projectId,
  });
};
```

## Acceptance Criteria

- [ ] Overview tab displays an "Active Workers" card with Bot icon and count badge in the header
- [ ] Card renders one row per currently assigned worker within this project
- [ ] Each row displays the worker name as a link to the worker detail page with a Bot icon
- [ ] Each row displays the assigned story title as a link to the story detail page
- [ ] Each row displays elapsed time since assignment with a Clock icon
- [ ] Empty state displays "No workers currently active." in subtle zinc-500 text when no workers are assigned
- [ ] Rows have `hover:bg-zinc-50` transition for interactive feel
- [ ] Card uses shadcn/ui Card, CardHeader, CardTitle, CardContent components
- [ ] Loading state displays Skeleton rows within the card
- [ ] Data is scoped to the current project via `projectId` prop
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `formatElapsedTime` utility is shared with the global dashboard active workers table. It should be imported from `@/lib/format-elapsed-time.ts`.
- The API endpoint is project-scoped: `GET /api/v1/projects/:id/workers/active`. This returns only workers assigned to stories within the given project.
- The card should be placed in the right column of the overview tab layout (alongside the progress indicator), while charts occupy the wider left column.

## References

- **Design System:** Card, CardHeader, CardTitle, CardContent from shadcn/ui (Epic 8)
- **Icons:** Lucide React — Bot, Clock
- **Shared Utility:** `formatElapsedTime` from `@/lib/format-elapsed-time.ts`
- **API:** `GET /api/v1/projects/:id/workers/active` endpoint

## Estimated Complexity

Low — Standard card with a list of items, links, and an empty state. Reuses the elapsed time formatter.
