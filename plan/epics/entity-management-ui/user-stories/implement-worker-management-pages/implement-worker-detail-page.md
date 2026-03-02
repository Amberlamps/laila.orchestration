# Implement Worker Detail Page

## Task Details

- **Title:** Implement Worker Detail Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Worker Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Worker List Page

## Description

Build the worker detail page at `/workers/{workerId}` that displays the worker's identity, API key status, project access table, current work assignment, and work history.

### Page Structure

1. **Breadcrumb:** Workers > {Worker Name}

2. **Header:**
   - Worker name in H1 typography — inline editable (click to edit, Enter to save, Escape to cancel)
   - Worker ID in monospace (JetBrains Mono, 13px, zinc-400)

3. **API Key Section:**
   - Card with "API Key" heading
   - Status message: "API key was shown once at creation and cannot be retrieved. If lost, delete this worker and create a new one."
   - Status indicator: zinc-400 text with Lock icon
   - No "regenerate" option — the key is immutable after creation

4. **Current Work Card (conditional):**
   - Shown only when the worker is actively working
   - Blue-50 bg, blue-200 border card
   - Shows: "Currently working on" + story title (linked) + "in" + project name (linked)
   - Duration since assignment started

5. **Project Access Table:**
   - Card with "Project Access" heading + "+ Add Project" button
   - Table columns: Project Name (linked), Project Status (StatusBadge), Current Assignment (story title or "None"), Remove (X button)
   - Empty state: "No projects assigned" with "+ Add Project" CTA

6. **Work History Table:**
   - Card with "Work History" heading
   - Table showing completed story assignments:
     - Story Title (linked)
     - Project Name (linked)
     - Assigned At (timestamp)
     - Completed At (timestamp)
     - Duration (calculated, e.g., "4h 32m")
     - Cost: USD (JetBrains Mono, e.g., "$12.45") and tokens (JetBrains Mono, e.g., "145,230")
   - Aggregated totals row at bottom: total USD, total tokens
   - Empty state: "No work history yet"

```tsx
// apps/web/src/pages/workers/[workerId].tsx
// Worker detail page showing identity, API key status, project access, and work history.
import { useRouter } from "next/router";
import { Lock, Plus, X } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { EntityTable } from "@/components/ui/entity-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useWorker, useWorkerHistory } from "@/hooks/use-workers";

export default function WorkerDetailPage() {
  const router = useRouter();
  const workerId = router.query.workerId as string;
  const { data: worker, isLoading } = useWorker(workerId);
  const { data: history } = useWorkerHistory(workerId);

  // ...
}
```

## Acceptance Criteria

- [ ] Worker detail page renders at `/workers/{workerId}`
- [ ] Breadcrumb shows: Workers > {Worker Name}
- [ ] Worker name is displayed in H1 and is inline editable (click to edit, Enter to save, Escape to cancel)
- [ ] Worker ID displays in JetBrains Mono font (13px, zinc-400)
- [ ] API Key section shows informational message that key was shown once and cannot be retrieved
- [ ] API Key section shows Lock icon with zinc-400 text
- [ ] Current Work card appears only when worker is actively working on a story
- [ ] Current Work card has blue-50 bg and shows story title + project name as links
- [ ] Project Access table shows: Project Name (linked), Status (StatusBadge), Current Assignment, Remove button
- [ ] "+ Add Project" button opens a dropdown of unassigned projects
- [ ] Remove button (X) per project row triggers confirmation if worker has active work in that project
- [ ] Project Access empty state shows "No projects assigned" with CTA
- [ ] Work History table shows: Story, Project, Assigned At, Completed At, Duration, Cost (USD + tokens)
- [ ] Cost values display in JetBrains Mono font
- [ ] Work History has an aggregated totals row at the bottom (total USD, total tokens)
- [ ] Work History empty state shows "No work history yet"
- [ ] Loading state shows skeleton placeholders for all sections
- [ ] 404 page shown when workerId does not exist
- [ ] Page wrapped in ProtectedRoute and AppLayout with `variant="constrained"`

## Technical Notes

- The inline editable name uses a pattern where clicking the H1 text replaces it with an input field. Save on Enter or blur, cancel on Escape. Use `useUpdateWorker` mutation for saving.
- The API key section is intentionally limited — there is no way to view or regenerate the key after creation. This is a security design decision.
- The Current Work card is conditional: only render it when `worker.currentAssignment` is not null. The data should come from the worker detail API response.
- The Project Access table and "+ Add Project" functionality are extracted into a separate component (next task) for maintainability.
- For the Work History aggregated totals, calculate the sum of all `costUsd` and `costTokens` values and display at the bottom of the table.
- Use `Intl.NumberFormat` for cost formatting (USD with 2 decimal places, tokens with comma separators).

## References

- **Design Specification:** Section 9.2 (Worker Detail Page), Section 9.2.1 (API Key Section), Section 9.2.2 (Work History)
- **Functional Requirements:** FR-WORKER-003 (worker detail), FR-WORKER-004 (API key display), FR-WORKER-005 (work history)
- **UI Components:** Breadcrumb, Card, EntityTable, StatusBadge (from Epic 8)

## Estimated Complexity

High — Multiple sections (API key, current work, project access, work history), inline editable name, conditional rendering, aggregated cost calculations, and JetBrains Mono formatting create a complex page.
