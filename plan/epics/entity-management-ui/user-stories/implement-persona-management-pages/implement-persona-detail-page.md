# Implement Persona Detail Page

## Task Details

- **Title:** Implement Persona Detail Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Persona Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Persona List Page

## Description

Build the persona detail page at `/personas/{personaId}` that displays the persona's full information, rendered Markdown description, and a list of active task assignments referencing this persona.

### Page Structure

1. **Breadcrumb:** Personas > {Persona Title}
2. **Header:**
   - Persona title (H1)
   - Persona ID in monospace (JetBrains Mono, 13px, zinc-400)
   - Action buttons: "Edit" (ghost) + "Delete" (destructive ghost, blocked if active tasks)
3. **Description Section:**
   - Rendered Markdown using MarkdownRenderer component
   - Full prose width (max 720px)
4. **Active Task Assignments:**
   - Card with "Active Task Assignments" heading
   - Table/list showing tasks that reference this persona:
     - Task title (linked to task detail)
     - Parent user story title (linked)
     - Parent project name (linked)
   - Empty state: "No tasks currently use this persona."

```tsx
// apps/web/src/pages/personas/[personaId].tsx
// Persona detail page with rendered description and active task assignments list.
import { useRouter } from "next/router";
import { UserCircle, Pencil, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { MarkdownRenderer } from "@/components/domain/markdown-renderer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePersona, useDeletePersona } from "@/hooks/use-personas";
```

## Acceptance Criteria

- [ ] Persona detail page renders at `/personas/{personaId}` route
- [ ] Breadcrumb shows: Personas > {Persona Title}
- [ ] Persona title displays in H1 typography
- [ ] Persona ID displays in JetBrains Mono (13px, zinc-400)
- [ ] "Edit" ghost button opens the Edit Persona modal
- [ ] "Delete" destructive ghost button triggers confirmation dialog
- [ ] Delete is disabled with tooltip when active tasks reference the persona
- [ ] Tooltip text: "Cannot delete — X active tasks use this persona."
- [ ] Confirmation dialog shows: "Delete Persona?" title, consequence statement, Cancel + "Delete Persona" buttons
- [ ] Description section renders full Markdown using MarkdownRenderer with prose styling
- [ ] Active Task Assignments section lists tasks referencing this persona
- [ ] Each task shows: task title (linked), parent story (linked), parent project (linked)
- [ ] Active tasks empty state: "No tasks currently use this persona."
- [ ] Loading state shows skeleton placeholders
- [ ] 404 page shown when personaId does not exist
- [ ] On successful delete: redirect to /personas with success toast
- [ ] Page wrapped in ProtectedRoute and AppLayout with `variant="constrained"`

## Technical Notes

- The persona detail API response should include `activeTaskAssignments` with task, story, and project context to avoid multiple API calls.
- The delete guard is enforced both client-side (disabled button when `activeTaskCount > 0`) and server-side (API returns 409). Show the error from the API if the client-side check somehow passes.
- Use `usePersona(personaId)` TanStack Query hook with 15s polling for live updates.
- When the persona is deleted, invalidate the personas list query cache so the list page reflects the change immediately.

## References

- **Design Specification:** Section 4.14 (Persona Detail)
- **Functional Requirements:** Section 9 (Persona Management)

## Estimated Complexity

Small — Standard detail page with Markdown rendering and a linked list of task assignments.
