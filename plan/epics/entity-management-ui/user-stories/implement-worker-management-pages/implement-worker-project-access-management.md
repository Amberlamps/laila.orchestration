# Implement Worker Project Access Management

## Task Details

- **Title:** Implement Worker Project Access Management
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Worker Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Worker Detail Page

## Description

Build the project access management UI within the worker detail page. This allows users to grant and revoke a worker's access to specific projects. Workers can only be assigned to work in projects they have been granted access to.

### UI Components

1. **"+ Add Project" Button:**
   - Positioned above the project access table
   - Opens a dropdown/popover showing projects the worker does NOT currently have access to
   - Each option shows: project name + status badge
   - Selecting a project immediately adds it to the worker's access list (optimistic update)

2. **Project Access Table Rows:**
   - Each row shows: Project Name (linked), Project Status (StatusBadge), Current Assignment, Remove button
   - Remove button (X or Trash2 icon, 16px, zinc-400 hover:red-500)

3. **Remove Project Access:**
   - Click Remove button on a row
   - If worker has active work in that project:
     - Show ConfirmDialog: "Remove access to '{project name}'? This worker is currently working on '{story title}' in this project. Removing access will stop the current assignment."
     - Confirm: "Remove Access" (destructive)
   - If no active work:
     - Remove immediately with success toast (no confirmation needed)

```tsx
// apps/web/src/components/workers/worker-project-access.tsx
// Project access management for a worker.
// Supports adding and removing project access with active work guards.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useWorkerProjects, useAddWorkerProject, useRemoveWorkerProject } from "@/hooks/use-workers";
import { useProjects } from "@/hooks/use-projects";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";

interface WorkerProjectAccessProps {
  workerId: string;
}

export function WorkerProjectAccess({ workerId }: WorkerProjectAccessProps) {
  const { data: workerProjects } = useWorkerProjects(workerId);
  const { data: allProjects } = useProjects();

  // Compute available projects (not yet assigned to this worker).
  // Filter out projects the worker already has access to.
  const availableProjects = useMemo(() => {
    if (!allProjects?.items || !workerProjects) return [];
    const assignedIds = new Set(workerProjects.map(wp => wp.projectId));
    return allProjects.items.filter(p => !assignedIds.has(p.id));
  }, [allProjects, workerProjects]);

  // ...
}
```

## Acceptance Criteria

- [ ] "+ Add Project" button appears above the project access table
- [ ] Clicking "+ Add Project" opens a Popover/dropdown listing unassigned projects
- [ ] Each project option shows project name and status badge
- [ ] Selecting a project adds it to the worker's access list via API call
- [ ] Add project uses optimistic update (project appears immediately in the table)
- [ ] If add fails, optimistic update is rolled back with error toast
- [ ] Popover closes after selection
- [ ] If all projects are already assigned, Popover shows "All projects assigned" message
- [ ] Remove button (X icon) appears on each project row
- [ ] If worker has active work in the project: ConfirmDialog with warning about stopping work
- [ ] ConfirmDialog shows the story title the worker is currently working on
- [ ] If no active work: project is removed immediately with success toast (no confirmation)
- [ ] After removal, project reappears in the "+ Add Project" dropdown
- [ ] Remove button hover state changes from zinc-400 to red-500
- [ ] Mutation hooks handle cache invalidation for worker detail and worker list queries
- [ ] Component handles loading states for add and remove operations
- [ ] Table row shows loading state (spinner) while add/remove is in progress

## Technical Notes

- The available projects list is computed by filtering all user projects to exclude those already assigned to the worker. This requires fetching both lists.
- Optimistic updates for add: immediately add the project to the workerProjects list in the query cache, then update on success or rollback on failure.
- The "+ Add Project" Popover should support filtering/search if the user has many projects. A simple text input at the top of the Popover suffices.
- The remove operation has two paths based on whether the worker has active work in that project. The `currentAssignment` field on each worker project entry indicates if work is active.
- Cache invalidation after add/remove should include: worker detail, worker projects list, and the global project list (if project stats change).
- Consider using the shadcn `Command` component for the project selector (provides built-in search/filter behavior).

## References

- **Design Specification:** Section 9.4 (Worker Project Access), Section 9.4.1 (Add Project Flow), Section 9.4.2 (Remove Project Flow)
- **Functional Requirements:** FR-WORKER-009 (project access grant), FR-WORKER-010 (project access revoke), FR-WORKER-011 (active work guard)
- **UI Components:** Popover, ConfirmDialog, StatusBadge, Button (from Epic 8)
- **TanStack Query Docs:** Optimistic updates, cache rollback

## Estimated Complexity

Medium — The two-path removal flow (with/without confirmation) and optimistic updates add moderate complexity. The available projects computation and Popover UI are straightforward.
