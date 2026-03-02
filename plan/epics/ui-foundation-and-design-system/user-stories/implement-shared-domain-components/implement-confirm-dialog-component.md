# Implement Confirm Dialog Component

## Task Details

- **Title:** Implement Confirm Dialog Component
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a `ConfirmDialog` component for confirming destructive actions such as deleting entities or stopping in-progress work. The dialog clearly communicates the consequences of the action and requires explicit user confirmation before proceeding.

### Visual Specification

- **Overlay:** Backdrop blur-sm, semi-transparent zinc-950/50 overlay
- **Dialog:** White bg, 8px radius, shadow-xl, max-width 400px, centered
- **Icon:** 48px red-100 bg circle with red-500 icon (Lucide `AlertTriangle` or `Trash2`)
- **Title:** H3 typography (16px, semibold), zinc-900 text
- **Consequence Statement:** Body typography (14px), zinc-600 text, includes affected entity count
- **Buttons:** Right-aligned, Cancel (outline variant) + Action (destructive variant with specific verb)

### Two Variants

1. **Standard Delete:** Single confirmation step. Shows consequence statement with entity count.
   - Example: "Delete Project 'My Project'?" / "This will permanently delete 3 epics, 12 stories, and 47 tasks."
   - Buttons: Cancel | Delete Project

2. **Force-Stop-Then-Delete:** Two-step flow for entities with in-progress work.
   - Step 1: "Stop all in-progress work?" / "2 stories are currently being worked on. They must be stopped before deletion."
   - Buttons: Cancel | Stop Work
   - Step 2 (after stop succeeds): Standard delete confirmation

```tsx
// apps/web/src/components/ui/confirm-dialog.tsx
// Confirmation dialog for destructive actions with consequence statement.
// Supports standard and two-step (force-stop-then-delete) variants.
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close (Cancel or backdrop click) */
  onClose: () => void;
  /** Dialog title (e.g., "Delete Project 'My Project'?") */
  title: string;
  /** Consequence description (e.g., "This will permanently delete...") */
  description: string;
  /** Text for the confirm action button (e.g., "Delete Project") */
  confirmLabel: string;
  /** Called when the confirm button is clicked */
  onConfirm: () => void;
  /** Whether the confirm action is in progress (shows loading state) */
  loading?: boolean;
  /** Dialog variant — "destructive" shows red styling, "warning" shows amber */
  variant?: "destructive" | "warning";
}
```

## Acceptance Criteria

- [ ] Dialog renders as a centered modal with backdrop blur and semi-transparent overlay
- [ ] Dialog has white bg, 8px radius, shadow-xl, max-width 400px
- [ ] Icon circle (48px) with red-100 bg and red-500 icon is displayed above the title
- [ ] Title uses H3 typography (16px, semibold, zinc-900)
- [ ] Consequence statement uses Body typography (14px, zinc-600)
- [ ] Cancel button uses outline variant
- [ ] Confirm button uses destructive variant with specific verb (not generic "Confirm")
- [ ] Confirm button shows loading spinner when `loading` is true
- [ ] Dialog closes on Cancel button click, backdrop click, or Escape key
- [ ] Dialog traps focus within itself when open (handled by Radix Dialog)
- [ ] Confirm button receives focus when dialog opens (draws attention to destructive action)
- [ ] Destructive variant uses AlertTriangle/Trash2 icons with red styling
- [ ] Warning variant uses AlertTriangle icon with amber styling
- [ ] Component integrates with the two-step force-stop-then-delete flow via state management in the parent
- [ ] Dialog is accessible: `role="alertdialog"`, `aria-describedby` on the consequence statement
- [ ] Escape key dismisses the dialog (does not confirm)

## Technical Notes

- Build on top of the shadcn `Dialog` component which wraps Radix UI `AlertDialog`. Use `AlertDialog` instead of `Dialog` for destructive confirmations because it prevents dismissal via backdrop click by default (a safer UX pattern).
- The two-step force-stop-then-delete flow is managed by the parent component's state machine, not by the dialog itself. The parent first shows the "Stop Work" dialog, handles the stop action, then swaps to the "Delete" dialog.
- Focus should be placed on the Cancel button (safest default) or the confirm button depending on the UX decision. Radix handles focus trapping automatically.
- Use `aria-describedby` to associate the consequence statement with the dialog for screen reader users.

## References

- **Design Specification:** Section 3.9 (Confirmation Dialogs), Section 3.9.1 (Destructive Actions)
- **Functional Requirements:** FR-UI-009 (delete confirmation), FR-UI-010 (force-stop flow)
- **WAI-ARIA Authoring Practices:** AlertDialog pattern
- **shadcn/ui Docs:** Dialog/AlertDialog component

## Estimated Complexity

Medium — The dialog itself is straightforward using shadcn/Radix primitives, but the two-variant design and integration with the force-stop-then-delete flow require careful API design.
