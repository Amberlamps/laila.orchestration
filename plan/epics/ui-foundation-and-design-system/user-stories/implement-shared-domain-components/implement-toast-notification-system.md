# Implement Toast Notification System

## Task Details

- **Title:** Implement Toast Notification System
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a toast notification system for providing non-blocking feedback on user actions (entity created, update saved, error occurred, etc.). Toasts appear in the bottom-right corner of the viewport and stack vertically, with configurable auto-dismiss behavior.

### Visual Specification

- **Position:** Fixed bottom-right corner, 24px from viewport edges
- **Width:** 360px
- **Stacking:** Up to 3 toasts visible simultaneously, newest at bottom, older ones shift up
- **Auto-dismiss:** Success and info toasts dismiss after 5 seconds. Error toasts persist until manually dismissed.
- **Dismiss:** Close button (Lucide `X` icon) on each toast
- **Animation:** Slide in from right (200ms), fade out on dismiss (150ms)

### Variants

| Variant | Left Border | Icon | Icon Color | Background | Usage |
|---|---|---|---|---|---|
| Success | green-500 (3px) | CheckCircle2 | green-600 | white | Entity created, update saved |
| Error | red-500 (3px) | XCircle | red-600 | white | API errors, validation failures |
| Warning | amber-500 (3px) | AlertTriangle | amber-600 | white | Timeout warnings, validation warnings |
| Info | blue-500 (3px) | Info | blue-600 | white | General information, hints |

### Toast API

```tsx
// apps/web/src/components/ui/toast.tsx
// Toast notification system using a React context provider + imperative API.
// Toasts stack in the bottom-right corner with auto-dismiss behavior.
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

interface Toast {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  /** Duration in ms before auto-dismiss. null = persistent. */
  duration?: number | null;
}

// Imperative toast function for use outside React components:
// toast.success("Project Created", "Your project is ready.");
// toast.error("Failed to Save", "The server returned an error.");
// toast.warning("Worker Timeout", "Worker 'alpha' has been idle for 25 minutes.");
// toast.info("Tip", "You can use keyboard shortcuts to navigate.");

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}
```

## Acceptance Criteria

- [ ] Toasts render fixed in the bottom-right corner, 24px from viewport edges
- [ ] Toasts are 360px wide with white bg, zinc-200 border, 8px radius, shadow-lg
- [ ] Each variant has a 3px left border in its semantic color (green, red, amber, blue)
- [ ] Each variant shows the correct Lucide icon in the corresponding color
- [ ] Toast displays a title (14px, semibold) and optional description (13px, zinc-500)
- [ ] Close button (X icon) is present on each toast, positioned top-right
- [ ] Success and info toasts auto-dismiss after 5 seconds
- [ ] Error toasts persist until manually dismissed (no auto-dismiss)
- [ ] Warning toasts auto-dismiss after 8 seconds
- [ ] Up to 3 toasts are visible simultaneously; older toasts beyond 3 are removed
- [ ] Toasts animate in from the right (slide-in, 200ms) and fade out on dismiss (150ms)
- [ ] Toast system is provided via React context (ToastProvider) for global access
- [ ] Imperative `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()` functions are available
- [ ] Toasts have `role="alert"` and `aria-live="polite"` for screen reader announcements
- [ ] Error toasts use `aria-live="assertive"` for immediate announcement
- [ ] Toast system works correctly when multiple toasts are triggered rapidly

## Technical Notes

- Consider using the shadcn `Toast` component (which wraps Radix Toast) as a base, or build a custom implementation with React context + `useReducer` for toast state management.
- The imperative API (e.g., `toast.success("Title")`) can be implemented using a module-level state and event emitter pattern, or by exporting a function that adds to the context state.
- For animations, use CSS transitions with `transform: translateX(100%)` for entry and `opacity: 0` for exit. Tailwind's `animate-*` utilities or custom keyframe animations work well.
- Use `setTimeout` for auto-dismiss timers. Clear timers on manual dismiss or component unmount to prevent memory leaks.
- Z-index should be `z-[100]` or higher to ensure toasts appear above all other UI elements including modals.
- Consider pausing auto-dismiss timers when the user hovers over a toast (common UX pattern).

## References

- **Design Specification:** Section 3.10 (Toast Notifications), Section 3.10.1 (Variants)
- **Functional Requirements:** FR-UI-011 (action feedback), FR-UI-012 (error notifications)
- **WAI-ARIA Authoring Practices:** Alert pattern, live regions
- **shadcn/ui Docs:** Toast component (Radix Toast primitive)

## Estimated Complexity

Medium — Toast rendering and variant styling is straightforward, but the stacking behavior, auto-dismiss timers, animation coordination, and imperative API design add moderate complexity.
