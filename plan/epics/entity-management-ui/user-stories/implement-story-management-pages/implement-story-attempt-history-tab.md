# Implement Story Attempt History Tab

## Task Details

- **Title:** Implement Story Attempt History Tab
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement User Story Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Story Detail Page

## Description

Build the Attempt History tab for the story detail page. This tab displays a timeline of worker assignment and unassignment events for the story, providing visibility into the story's execution lifecycle.

### Tab Content

A vertical timeline list where each entry represents a worker assignment attempt.

### Timeline Entry Structure

Each entry displays:

- **Worker Name:** Linked to `/workers/{workerId}`, in Body typography (14px, semibold)
- **Assigned Timestamp:** Caption (12px, zinc-500), formatted as "Jan 15, 2026 at 2:30 PM"
- **Unassigned Timestamp:** Caption, same format, or "Currently assigned" in blue-500 if still active
- **Duration:** Caption, calculated (e.g., "4h 32m")
- **Reason:** Why the worker was unassigned — displayed in a small badge:
  - Timeout: amber badge with Clock icon, "Timed out"
  - Manual: zinc badge with UserMinus icon, "Manually unassigned"
  - Failure: red badge with XCircle icon, "Failed"
  - Complete: green badge with CheckCircle2 icon, "Completed"
  - null (still active): blue badge with Loader2 icon, "In progress"

### Visual Layout

```
Timeline dot (10px circle) ── Worker Name
                               Assigned: Jan 15, 2026 at 2:30 PM
                               Unassigned: Jan 15, 2026 at 7:02 PM
                               Duration: 4h 32m
                               [Timed out] badge

Timeline dot ────────────── Worker Name
                               ...
```

```tsx
// apps/web/src/components/stories/story-attempt-history-tab.tsx
// Attempt History timeline showing worker assignment/unassignment events.
// Each entry shows worker, timestamps, duration, and reason for unassignment.
import { Clock, UserMinus, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useStoryAttemptHistory } from '@/hooks/use-stories';

interface AttemptEntry {
  id: string;
  workerId: string;
  workerName: string;
  assignedAt: string; // ISO timestamp
  unassignedAt: string | null; // null if currently assigned
  reason: 'timeout' | 'manual' | 'failure' | 'complete' | null;
  durationSeconds: number | null;
}

// Reason badge configuration — maps each reason to visual styling.
const REASON_CONFIG = {
  timeout: {
    icon: Clock,
    label: 'Timed out',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  manual: {
    icon: UserMinus,
    label: 'Manually unassigned',
    className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  },
  failure: {
    icon: XCircle,
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  complete: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
};
```

## Acceptance Criteria

- [ ] Attempt History tab renders as a sub-tab within the story detail page
- [ ] Timeline displays a vertical list of worker assignment attempts in reverse chronological order (newest first)
- [ ] Each entry shows worker name linked to the worker detail page
- [ ] Each entry shows assigned timestamp formatted as "Month Day, Year at HH:MM AM/PM"
- [ ] Each entry shows unassigned timestamp or "Currently assigned" in blue if still active
- [ ] Each entry shows calculated duration (e.g., "4h 32m", "2d 1h")
- [ ] Unassignment reason displays as a colored badge with appropriate icon
- [ ] Reason badges: Timeout (amber), Manual (zinc), Failure (red), Complete (green), In Progress (blue)
- [ ] Timeline has a vertical line connecting entries on the left side
- [ ] Timeline dots are 10px circles, colored to match the reason
- [ ] Currently active assignment has a pulsing blue dot indicator
- [ ] Empty state shows when no attempts exist: "No assignment history" with descriptive text
- [ ] Loading state shows skeleton placeholders
- [ ] Data is fetched via `useStoryAttemptHistory` TanStack Query hook
- [ ] Tab content is scrollable if many attempts exist

## Technical Notes

- The timeline visual can be implemented with CSS: a vertical `border-left` on the container, and positioned `::before` pseudo-elements for the dots on each entry.
- Duration formatting: use a helper function that converts seconds to human-readable format. Under 1 hour: "45m", 1-24 hours: "4h 32m", over 24 hours: "2d 1h".
- Timestamps should be formatted using the user's locale. Use `Intl.DateTimeFormat` or `date-fns` `format` function.
- The "Currently assigned" state for the active attempt should use a pulsing animation on the timeline dot (CSS `animate-pulse`) to indicate live activity.
- Reverse chronological order means the currently active assignment (if any) appears at the top of the list.
- If no attempts exist (story has never been assigned), show the EmptyState component with a relevant message.

## References

- **Design Specification:** Section 7.3 (Attempt History Tab), Section 7.3.1 (Timeline Layout)
- **Functional Requirements:** FR-STORY-007 (attempt history), FR-STORY-008 (unassignment reasons)
- **UI Components:** Badge, EmptyState (from Epic 8)

## Estimated Complexity

Medium — The timeline layout requires custom CSS for the vertical line and dots, and the conditional styling based on reason type adds moderate complexity. The data structure and rendering logic are straightforward.
