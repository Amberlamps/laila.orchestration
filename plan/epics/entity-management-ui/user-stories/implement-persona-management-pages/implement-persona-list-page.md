# Implement Persona List Page

## Task Details

- **Title:** Implement Persona List Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Persona Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the persona list page at `/personas` that displays all personas owned by the user. Personas define roles/expertise profiles that execution agents adopt when working on tasks. The page shows personas in a card grid or table layout with title, description preview, and usage count (active tasks referencing each persona).

### Page Layout

- **Header:** H1 "Personas" (left) + "+ Create Persona" primary button (right)
- **Content:** Card grid layout showing persona cards
- **Empty State:** When no personas exist

### Persona Card Structure

Each persona card includes:
1. **Title** — Persona title (H3, e.g., "Senior Frontend Developer"), clickable to detail page
2. **Description Preview** — First 2 lines of the Markdown description, truncated with ellipsis
3. **Usage Count** — Badge showing "X active tasks" referencing this persona
4. **Actions** — Three-dot menu with: Edit, Delete (blocked if active tasks)

```tsx
// apps/web/src/pages/personas/index.tsx
// Persona list page with card grid layout.
// Shows each persona's title, description preview, and active task usage count.
import { UserCircle, Plus } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePersonas } from "@/hooks/use-personas";
```

## Acceptance Criteria

- [ ] Persona list page renders at `/personas` route
- [ ] Page header shows "Personas" H1 and "+ Create Persona" primary button
- [ ] Personas display in a card grid layout (3-col desktop, 2-col tablet, 1-col mobile)
- [ ] Each card shows persona title (H3, linked to detail page)
- [ ] Each card shows description preview (first 2 lines, truncated)
- [ ] Each card shows usage count badge ("X active tasks")
- [ ] Card click navigates to persona detail page
- [ ] Three-dot menu includes "Edit" and "Delete" options
- [ ] Delete action is disabled with tooltip "Cannot delete — X active tasks use this persona" when tasks reference it
- [ ] Empty state shows UserCircle icon (48px, zinc-300) with "No personas defined" title
- [ ] Empty state description: "Personas define the role a worker should adopt for each task. Create a persona before adding tasks."
- [ ] Empty state CTA: "+ Create Persona" primary button
- [ ] Loading state shows skeleton cards
- [ ] "+ Create Persona" button opens the Create Persona modal
- [ ] Data fetched via `usePersonas` TanStack Query hook with 15s polling
- [ ] Page wrapped in ProtectedRoute and AppLayout

## Technical Notes

- Personas are user-scoped global entities (not project-scoped). The API returns all personas belonging to the authenticated user.
- The usage count (active tasks) should come from the API response to avoid client-side counting. The backend should include `activeTaskCount` in the persona list response.
- Description preview should strip Markdown formatting before truncating (use a simple regex or a library like `remove-markdown`).
- The delete guard is a backend concern — the API returns 409 if the persona has active task references. The frontend should check `activeTaskCount > 0` to disable the delete option proactively.

## References

- **Design Specification:** Section 4.12 (Persona List), Section 2.4 (Cards)
- **Functional Requirements:** Section 9 (Persona Management)

## Estimated Complexity

Small — Standard card grid page with simple data display and deletion guards.
