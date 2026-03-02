# Implement Create Edit Persona Modal

## Task Details

- **Title:** Implement Create Edit Persona Modal
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Persona Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Persona List Page

## Description

Build a modal dialog for creating and editing personas. The modal contains a title text input and a Markdown description editor with preview toggle. Personas require both fields to be non-empty.

### Modal Specification

- **Width:** 640px (medium)
- **Title:** "Create Persona" or "Edit Persona" depending on mode
- **Form Fields:**
  1. **Title** (required) — Text input, placeholder: "e.g., Senior Frontend Developer"
  2. **Description** (required) — MarkdownEditor component with toolbar and preview toggle, placeholder: "Describe the role, expertise, and behavioral guidelines for this persona..."
- **Actions:** "Save" (primary) + "Cancel" (secondary)
- **Validation:** Both fields required. Title max 200 chars.

```tsx
// apps/web/src/components/personas/persona-form-modal.tsx
// Create/edit persona modal with title input and Markdown description editor.
// Uses React Hook Form + Zod for validation, shared schema from @laila/shared.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { personaSchema } from "@laila/shared/schemas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/domain/markdown-editor";
import { Button } from "@/components/ui/button";
import { useCreatePersona, useUpdatePersona } from "@/hooks/use-personas";
```

## Acceptance Criteria

- [ ] Modal renders with "Create Persona" title when creating and "Edit Persona" when editing
- [ ] Title field is a text input with placeholder "e.g., Senior Frontend Developer"
- [ ] Title field validates as required with max 200 characters
- [ ] Description field uses MarkdownEditor component with toolbar and preview toggle
- [ ] Description field has placeholder text about describing role and expertise
- [ ] Description field validates as required (non-empty)
- [ ] Form uses React Hook Form with Zod resolver using `personaSchema` from @laila/shared
- [ ] "Save" button is disabled until form is valid
- [ ] "Save" button shows loading state ("Saving...") during submission
- [ ] On successful create: modal closes, persona list refreshes, success toast shown
- [ ] On successful edit: modal closes, data refreshes, success toast shown
- [ ] On error: inline error message shown, form remains open
- [ ] "Cancel" button closes modal without saving
- [ ] Escape key closes modal (unless form is dirty — show unsaved changes warning)
- [ ] When editing, form pre-populates with existing persona data
- [ ] Modal integrates with `useCreatePersona` and `useUpdatePersona` mutations

## Technical Notes

- The modal should be controlled via a `open`/`onOpenChange` prop pattern from the parent (list page or detail page).
- Reuse the same component for both create and edit by accepting an optional `persona` prop. When present, the form pre-fills and uses the update mutation.
- The MarkdownEditor component from Epic 8 (User Story 3) provides the toolbar and preview toggle functionality.
- Use optimistic updates via TanStack Query for a snappy UX — update the cache immediately and roll back on error.

## References

- **Design Specification:** Section 4.13 (Create/Edit Persona Modal)
- **Functional Requirements:** Section 9 (Persona Management)

## Estimated Complexity

Small — Standard form modal with two fields and Markdown editor integration.
