# Implement Audit Entry Component

## Task Details

- **Title:** Implement Audit Entry Component
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Audit Log UI](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a shared `AuditEntry` component that renders a single audit event row. This component is used by the cross-project audit log page, the project activity tab, the dashboard recent activity snapshot, and the project overview activity feed. It provides consistent formatting for timestamps, actors, actions, and entity links.

### AuditEntry Component

```typescript
// apps/web/src/components/audit/audit-entry.tsx
// Shared component for rendering a single audit event row.
// Used across multiple pages and sections for consistent audit display.

import { memo } from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Bot, User, Settings, ExternalLink } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import type { AuditEvent } from "@laila/shared";

/**
 * AuditEntry renders a single audit event as a horizontal row:
 *
 * Layout: flex row with items-start, gap-3, py-2.5, border-b border-zinc-100
 * Hover: hover:bg-zinc-50 for subtle interactive feel
 *
 * 1. Timestamp column (w-[100px], flex-shrink-0):
 *    - Relative time: "2 minutes ago", "3 hours ago", etc.
 *    - text-xs, text-zinc-400
 *    - Tooltip on hover showing absolute datetime:
 *      "March 2, 2026 at 10:30:45 AM"
 *    - Uses Intl.DateTimeFormat for locale-aware absolute formatting
 *
 * 2. Actor column (w-[120px], flex-shrink-0):
 *    - Icon prefix based on actor type:
 *      - Worker: Bot icon (14px, text-indigo-500)
 *      - User: User icon (14px, text-zinc-600)
 *      - System: Settings icon (14px, text-zinc-400)
 *    - Actor name:
 *      - Worker: text-sm, font-medium, text-zinc-800
 *      - User: text-sm, font-medium, text-zinc-800
 *      - System: text-sm, italic, text-zinc-500
 *    - Truncated at 18 chars with title tooltip
 *
 * 3. Action + Target column (flex-1):
 *    - Action verb: text-sm, text-zinc-600
 *      (e.g., "created", "updated", "deleted", "changed status of")
 *    - Target entity: text-sm, font-medium, text-indigo-600
 *      - Linked to entity detail page
 *      - Entity type prefix in text-zinc-400:
 *        (e.g., "project", "task", "story")
 *      - Entity name truncated at 40 chars with title tooltip
 *
 * 4. Project column (optional, only in cross-project view):
 *    - Project name linked to /projects/:id
 *    - text-xs, text-zinc-500
 *    - Truncated at 25 chars
 *
 * Props:
 * - event: AuditEvent
 * - showProject: boolean (default false, true for cross-project view)
 * - compact: boolean (default false, true for dashboard snapshots)
 */
```

### Actor Rendering

```typescript
// apps/web/src/components/audit/audit-actor.tsx
// Sub-component for rendering the actor (who performed the action).

/**
 * AuditActor renders the actor with type-specific styling:
 *
 * Worker actors:
 * - Bot icon in indigo-500
 * - Name in regular font weight
 * - Represents an AI agent/worker
 *
 * User actors:
 * - User icon in zinc-600
 * - Name in regular font weight
 * - Represents a human user who signed in via Google OAuth
 *
 * System actors:
 * - Settings icon in zinc-400
 * - "System" text in italic, text-zinc-500
 * - Represents automated system actions (auto-complete, timeout, etc.)
 * - Visually muted to distinguish from intentional user/worker actions
 */
```

### Entity Link Construction

```typescript
// apps/web/src/lib/audit/entity-links.ts
// Constructs navigation links for audit event target entities.

/**
 * getEntityLink(entity: AuditEventTarget, projectId: string): string
 *
 * Maps entity type and ID to a detail page URL:
 * - project:  /projects/{id}
 * - epic:     /projects/{projectId}/epics/{id}
 * - story:    /projects/{projectId}/stories/{id}
 * - task:     /projects/{projectId}/tasks/{id}
 * - worker:   /workers/{id}
 * - persona:  /personas/{id}
 *
 * Workers and personas are not project-scoped, so they use
 * top-level routes. All other entities are nested under projects.
 */
```

### Compact Variant

```typescript
// The compact variant is used in dashboard snapshots where space is limited.

/**
 * Compact differences:
 * - Smaller padding: py-1.5 instead of py-2.5
 * - Timestamp and actor are on the same line
 * - Action description is more condensed
 * - No project column (handled by the parent component)
 * - text-xs for all text instead of text-sm
 */
```

## Acceptance Criteria

- [ ] AuditEntry component renders a single audit event as a horizontal row
- [ ] Timestamp displays relative time (e.g., "2 minutes ago") with absolute datetime in a tooltip
- [ ] Absolute datetime tooltip uses `Intl.DateTimeFormat` for locale-aware formatting
- [ ] Worker actors display a Bot icon in indigo-500 with the worker name
- [ ] User actors display a User icon in zinc-600 with the user name
- [ ] System actors display a Settings icon in zinc-400 with italic "System" text in zinc-500
- [ ] Action descriptions are human-readable (e.g., "created", "updated", "changed status of")
- [ ] Target entity names are linked to the entity detail page
- [ ] Entity links are correctly constructed for all entity types (project, epic, story, task, worker, persona)
- [ ] Entity names are truncated at 40 characters with full name in title tooltip
- [ ] Actor names are truncated at 18 characters with full name in title tooltip
- [ ] `showProject` prop controls whether the project column is displayed
- [ ] `compact` prop enables the condensed variant for dashboard snapshots
- [ ] Rows have hover:bg-zinc-50 transition and border-b border-zinc-100 separator
- [ ] Component is memoized with `memo()` for efficient list rendering
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `memo()` wrapper is important because this component will be rendered in long lists (50+ items). Memoization prevents unnecessary re-renders when the list scrolls or sibling items update.
- The `formatRelativeTime` utility should be shared with the dashboard recent activity snapshot and the project overview activity feed. It should be located in `@/lib/format-relative-time.ts`.
- Entity link construction should handle the case where the entity has been deleted (the link target may return 404). Consider adding a visual indicator (e.g., strikethrough text) for events targeting deleted entities.
- The compact variant should preserve all essential information while reducing vertical space. It is used in dashboard contexts where multiple other sections compete for space.

## References

- **Design System:** Tooltip components from shadcn/ui
- **Icons:** Lucide React — Bot, User, Settings, ExternalLink
- **Formatting:** `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat`
- **Type Definitions:** `AuditEvent`, `AuditEventActor`, `AuditEventTarget` from `@laila/shared`
- **Navigation:** Next.js Link component for entity links

## Estimated Complexity

Medium — Shared component with multiple rendering modes (compact/full, with/without project), conditional actor styling, entity link construction, and timestamp formatting. High reuse value across the application.
