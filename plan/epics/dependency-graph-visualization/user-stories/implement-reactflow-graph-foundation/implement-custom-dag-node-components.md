# Implement Custom DAG Node Components

## Task Details

- **Title:** Implement Custom DAG Node Components
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement ReactFlow Graph Foundation](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** Set Up ReactFlow with Dagre Layout

## Description

Implement custom ReactFlow node components for each entity type in the dependency graph. Nodes are styled as rounded rectangles with a colored left border indicating status, a truncated title, and a status badge. Different entity types (epic, story, task) use distinct visual indicators (shape or icon) for quick identification.

### Custom Node Components

```typescript
// apps/web/src/components/project/graph/nodes/dag-node.tsx
// Base custom node component used for all entity types in the DAG.
// Renders a rounded rectangle with status-colored left border.

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Layers, BookOpen, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DagNode renders:
 *
 * - Container: rounded-lg rectangle, approximately 180px x 60px
 *   - White background (bg-white)
 *   - Border: 1px solid zinc-200
 *   - Left border: 3px solid in status color
 *     - not_started: zinc-400
 *     - in_progress: blue-500
 *     - completed: emerald-500
 *     - blocked: amber-500
 *     - failed: red-500
 *   - Shadow: shadow-sm, hover:shadow-md transition
 *   - Cursor: pointer (indicates clickability)
 *
 * - Content (flexbox, vertical, padding 8px 12px):
 *   - Top row: entity type icon + title (truncated to 30 chars)
 *     - Icon: 14px, text-zinc-400
 *     - Title: text-sm, font-medium, truncated with title tooltip
 *   - Bottom row: StatusBadge (compact variant, small text)
 *
 * - Handles:
 *   - Top: target handle (Position.Top) for incoming edges
 *   - Bottom: source handle (Position.Bottom) for outgoing edges
 *   - Handle style: small, invisible (width: 8px, height: 8px, opacity: 0)
 *
 * - Selected state (when node is clicked/selected):
 *   - Ring: ring-2 ring-indigo-500 ring-offset-2
 *   - Shadow: shadow-lg
 */
```

### Entity Type Icons

```typescript
// apps/web/src/components/project/graph/nodes/entity-type-icon.tsx
// Maps entity types to distinct visual indicators.

/**
 * Entity type visual indicators:
 *
 * - Epic: Layers icon (diamond-shaped container or just icon)
 *   Represents the top-level grouping
 *
 * - Story: BookOpen icon (square-shaped container or just icon)
 *   Represents a user story within an epic
 *
 * - Task: ListChecks icon (circle-shaped container or just icon)
 *   Represents an individual task within a story
 *
 * Each icon is 14px with text-zinc-400 color by default,
 * but highlighted to match the status color when the node is selected.
 */
```

### Node Type Registration

```typescript
// apps/web/src/components/project/graph/node-types.ts
// Registers custom node types with ReactFlow.
// Must use useMemo to create a stable reference.

import { DagNode } from './nodes/dag-node';

/**
 * Custom node types map:
 *
 * const nodeTypes = useMemo(() => ({
 *   epicNode: DagNode,    // Same component, differentiated by data.entityType
 *   storyNode: DagNode,
 *   taskNode: DagNode,
 * }), []);
 *
 * Alternative: use a single "dagNode" type and determine the
 * icon/shape from node.data.entityType within the component.
 * This approach is simpler and requires registering only one type.
 */
```

### Status Color Map

```typescript
// apps/web/src/lib/graph/status-colors.ts
// Maps entity statuses to Tailwind border/fill colors.
// Shared across all graph components (nodes, edges, legend).

export const statusBorderColors: Record<string, string> = {
  not_started: 'border-l-zinc-400',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-emerald-500',
  blocked: 'border-l-amber-500',
  failed: 'border-l-red-500',
  draft: 'border-l-zinc-300',
  ready: 'border-l-indigo-500',
};

export const statusHexColors: Record<string, string> = {
  not_started: '#a1a1aa', // zinc-400
  in_progress: '#3b82f6', // blue-500
  completed: '#10b981', // emerald-500
  blocked: '#f59e0b', // amber-500
  failed: '#ef4444', // red-500
  draft: '#d4d4d8', // zinc-300
  ready: '#6366f1', // indigo-500
};
```

## Acceptance Criteria

- [ ] Custom DagNode component renders as a rounded rectangle approximately 180px x 60px
- [ ] Node has a white background with 1px zinc-200 border
- [ ] Node has a 3px colored left border that reflects the entity's current status
- [ ] Entity title is displayed truncated to 30 characters with full title shown on hover via `title` attribute
- [ ] Entity type icon is displayed next to the title: Layers for epics, BookOpen for stories, ListChecks for tasks
- [ ] A compact StatusBadge is displayed below the title
- [ ] Top and bottom ReactFlow Handles are rendered for edge connections (target at top, source at bottom)
- [ ] Handles are visually small and near-invisible (8px, opacity 0)
- [ ] Selected nodes display an indigo-500 ring with ring-offset and larger shadow
- [ ] Nodes have hover:shadow-md transition for interactive feel
- [ ] Cursor changes to pointer on hover to indicate clickability
- [ ] Status color map is defined as a shared module for reuse across graph components
- [ ] Node component is memoized with `memo()` for ReactFlow rendering performance
- [ ] Custom node types are registered with ReactFlow via a stable `useMemo` reference
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow custom nodes must accept `NodeProps` and render `Handle` components for edge connections. The `Handle` component's `Position` enum determines where edges connect (Top for incoming, Bottom for outgoing in a TB layout).
- The `memo()` wrapper on the node component is important for performance — ReactFlow re-renders nodes on every pan/zoom interaction, and `memo` prevents unnecessary re-renders when node data has not changed.
- The status border colors use Tailwind's `border-l-*` classes for the 3px left border. Ensure the base `border-l-[3px]` width class is applied.
- Node dimensions (180x60) should match the values passed to the Dagre layout computation to ensure accurate positioning.

## References

- **ReactFlow:** Custom nodes documentation — `NodeProps`, `Handle`, `Position`
- **Design System:** StatusBadge component from Epic 8
- **Icons:** Lucide React — Layers, BookOpen, ListChecks
- **Colors:** Tailwind CSS v4 color palette

## Estimated Complexity

Medium — Custom ReactFlow node components with conditional styling, entity type differentiation, and performance-conscious memoization.
