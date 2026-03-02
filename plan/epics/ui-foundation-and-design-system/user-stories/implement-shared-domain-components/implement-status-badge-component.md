# Implement StatusBadge Component

## Task Details

- **Title:** Implement StatusBadge Component
- **Status:** Not Started
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a reusable `StatusBadge` component that provides consistent visual representation of work statuses and lifecycle states throughout the application. The badge uses redundant encoding (color + filled circle dot + text label) to ensure accessibility for color-blind users.

### Visual Specification

- **Height:** 22px
- **Border Radius:** 4px (rounded-sm)
- **Padding:** 4px horizontal, 2px vertical
- **Font:** Caption style (12px, medium weight)
- **Structure:** [8px filled circle] [4px gap] [Status label text]

### Status Color Mapping

| Status | Background | Text | Dot Color | Usage |
|---|---|---|---|---|
| Draft | zinc-100 | zinc-600 | zinc-400 | New entities not yet published |
| Not Started | gray-100 | gray-600 | gray-400 | Published but no work assigned |
| Ready | teal-50 | teal-700 | teal-500 | Ready for work assignment |
| Blocked | amber-50 | amber-700 | amber-500 | Blocked by dependencies |
| In Progress | blue-50 | blue-700 | blue-500 | Currently being worked on |
| Complete | green-50 | green-700 | green-500 | Successfully completed |
| Failed | red-50 | red-700 | red-500 | Failed during execution |

```tsx
// apps/web/src/components/ui/status-badge.tsx
// StatusBadge renders a color-coded pill with a filled circle dot and label.
// Uses redundant encoding (color + icon + text) for WCAG accessibility.
// Supports all seven work statuses and can be extended for lifecycle states.

type WorkStatus =
  | "draft"
  | "not_started"
  | "ready"
  | "blocked"
  | "in_progress"
  | "complete"
  | "failed";

interface StatusBadgeProps {
  status: WorkStatus;
  className?: string;
}

// Map each status to its visual configuration.
// Background, text, and dot colors are intentionally distinct
// to support both color and non-color differentiation.
const STATUS_CONFIG: Record<WorkStatus, {
  bg: string;
  text: string;
  dot: string;
  label: string;
}> = {
  draft:        { bg: "bg-zinc-100",  text: "text-zinc-600",  dot: "bg-zinc-400",  label: "Draft" },
  not_started:  { bg: "bg-gray-100",  text: "text-gray-600",  dot: "bg-gray-400",  label: "Not Started" },
  ready:        { bg: "bg-teal-50",   text: "text-teal-700",  dot: "bg-teal-500",  label: "Ready" },
  blocked:      { bg: "bg-amber-50",  text: "text-amber-700", dot: "bg-amber-500", label: "Blocked" },
  in_progress:  { bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-500",  label: "In Progress" },
  complete:     { bg: "bg-green-50",  text: "text-green-700", dot: "bg-green-500", label: "Complete" },
  failed:       { bg: "bg-red-50",    text: "text-red-700",   dot: "bg-red-500",   label: "Failed" },
};
```

## Acceptance Criteria

- [ ] StatusBadge renders with correct colors for all 7 work statuses (Draft, Not Started, Ready, Blocked, In Progress, Complete, Failed)
- [ ] Badge height is 22px with 4px border radius
- [ ] Each badge shows an 8px filled circle dot alongside the status text label
- [ ] Background, text, and dot colors match the design specification for each status
- [ ] Font uses Caption style (12px, medium weight)
- [ ] Component accepts a `status` prop typed as a union of all valid status strings
- [ ] Component accepts an optional `className` prop for layout customization
- [ ] Text label is human-readable (e.g., "In Progress" not "in_progress")
- [ ] Badge meets WCAG 2.1 AA contrast requirements (text against background)
- [ ] Redundant encoding ensures status is distinguishable without color (dot + text label)
- [ ] Component renders without layout shift or visual glitches at all viewport sizes

## Technical Notes

- The redundant encoding pattern (color + shape + text) is a WCAG 2.1 requirement (Success Criterion 1.4.1: Use of Color). The filled circle dot provides a secondary visual cue beyond just color.
- Consider extending the `WorkStatus` type to also support lifecycle states (e.g., `published`, `archived`) if needed, or create a separate `LifecycleBadge` component.
- Use the `cn()` utility for composing the status-specific classes with any passed `className`.
- The status config map is defined outside the component to avoid recreating it on every render.
- Ensure the component works correctly inside table cells, where vertical alignment and height constraints matter.

## References

- **Design Specification:** Section 2.6 (Status Colors), Section 3.4 (StatusBadge Component)
- **Functional Requirements:** FR-UI-001 (status visualization), NFR-UI-001 (WCAG 2.1 AA)
- **WCAG 2.1:** Success Criterion 1.4.1 (Use of Color), Success Criterion 1.4.3 (Contrast)

## Estimated Complexity

Low — The component is a straightforward mapping of status values to predefined color configurations. The main consideration is ensuring WCAG contrast compliance and correct type definitions.
