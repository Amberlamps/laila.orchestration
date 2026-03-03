# Implement Epic Publish Delete Flows

## Task Details

- **Title:** Implement Epic Publish Delete Flows
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Epic Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Epic Detail Page, Implement Create Edit Epic Modal

## Description

Implement the publish and delete lifecycle flows for epics. These flows mirror the project-level flows but are scoped to epic-specific validation and cascade rules.

### Publish Flow (Draft to Ready)

1. **Trigger:** User clicks "Publish" button on epic detail page
2. **Validation:** Epic must have at least one user story. All child stories should have tasks. API validates and returns issues.
3. **If Valid:** Transition epic from Draft to Ready. Show success toast.
4. **If Invalid:** Show validation error dialog listing issues (e.g., "Story 'Login Flow' has no tasks defined").

### Delete Flow

1. **Trigger:** User clicks "Delete" button on epic detail page
2. **In-Progress Guard:** If epic has stories with `in_progress` status, block deletion. Show tooltip: "Cannot delete epic with in-progress stories."
3. **If Deletable:** Show ConfirmDialog:
   - Title: "Delete Epic '{title}'?"
   - Description: "This will permanently delete {storyCount} stories and {taskCount} tasks within this epic."
   - Confirm button: "Delete Epic"
4. **On Confirm:** Soft-delete cascade (epic + all child stories and tasks), show success toast, redirect to parent project detail page.

```tsx
// apps/web/src/components/epics/epic-lifecycle-flows.tsx
// Publish validation and delete confirmation flows for epics.
// Publish validates child stories/tasks before transitioning.
// Delete shows cascading entity counts and blocks if in-progress work exists.
import { useState } from 'react';
import { useRouter } from 'next/router';
import { usePublishEpic, useDeleteEpic } from '@/hooks/use-epics';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

interface EpicLifecycleProps {
  epic: {
    id: string;
    title: string;
    projectId: string;
    lifecycleStatus: string;
    childCounts: {
      stories: number;
      tasks: number;
    };
    hasInProgressWork: boolean;
  };
}
```

## Acceptance Criteria

### Publish Flow

- [ ] Publish button triggers validation API call
- [ ] Loading state shows "Validating..." spinner
- [ ] If valid: epic transitions to Ready, success toast appears, status badge updates
- [ ] If invalid: validation dialog lists all issues (stories without tasks, etc.)
- [ ] Validation dialog is scrollable for epics with many issues
- [ ] Publish button is only visible when epic is in Draft status

### Delete Flow

- [ ] Delete button is disabled with tooltip when epic has in-progress stories
- [ ] When allowed, delete opens ConfirmDialog with epic title and cascade entity counts
- [ ] ConfirmDialog description shows accurate story and task counts
- [ ] Confirm button text is "Delete Epic" (not generic)
- [ ] Confirm button shows loading state during deletion
- [ ] On success: toast appears, user redirected to parent project detail page (`/projects/{projectId}?tab=epics`)
- [ ] On error: error toast, dialog remains open for retry
- [ ] Delete is a soft-delete (sets deleted_at, does not permanently remove)
- [ ] Cascade delete affects all child stories and tasks

### General

- [ ] Both flows prevent double-submission
- [ ] Both flows are keyboard accessible
- [ ] API errors show user-friendly error messages

## Technical Notes

- The publish validation endpoint is `POST /api/epics/{epicId}/validate`. The actual publish is `POST /api/epics/{epicId}/publish`.
- The delete endpoint is `DELETE /api/epics/{epicId}`. The API performs the cascade soft-delete server-side.
- After successful deletion, redirect using `router.replace` to the parent project detail page with the Epics tab active (`?tab=epics`). Use `replace` instead of `push` so the deleted epic page is not in browser history.
- The `hasInProgressWork` flag should come from the epic detail API response. This avoids an additional API call to check before showing the delete dialog.
- Cache invalidation after delete should clear the epic detail, the project's epics list, and the project detail (since aggregate counts change).

## References

- **Design Specification:** Section 6.3 (Epic Lifecycle Flows)
- **Functional Requirements:** FR-EPIC-006 (publish validation), FR-EPIC-007 (delete cascade), FR-EPIC-008 (in-progress guard)
- **UI Components:** ConfirmDialog, Dialog, Button, Toast (from Epic 8)

## Estimated Complexity

Medium — The flows mirror the project-level patterns (already established), but with epic-specific validation rules and cascade logic.
