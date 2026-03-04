# Implement Status Filter Chips

## Task Details

- **Title:** Implement Status Filter Chips
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Interactivity](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement a horizontal row of filter chips above the graph that allow users to show or hide nodes by their status. Chips support multi-select — multiple statuses can be active simultaneously. Filtered-out nodes and their connected edges are hidden from the graph. The Dagre layout is recomputed for the visible nodes to maintain clean positioning.

### Status Filter Chips Component

```typescript
// apps/web/src/components/project/graph/graph-status-filter.tsx
// Horizontal row of toggleable status filter chips above the graph canvas.
// Controls which nodes are visible based on entity status.

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { statusHexColors } from '@/lib/graph/status-colors';

/**
 * GraphStatusFilter renders:
 *
 * - Horizontal flex row with gap-2, wrapping on mobile
 * - Label: "Filter by status:" (text-sm, text-zinc-500)
 * - One chip per status:
 *   - not_started (gray)
 *   - in_progress (blue)
 *   - completed (green)
 *   - blocked (amber)
 *   - failed (red)
 *
 * Each chip:
 * - Active (selected): filled background in status color, white text
 * - Inactive (deselected): outline style, muted text, bg-transparent
 * - Small colored dot (w-2 h-2 rounded-full) as visual indicator
 * - Text: status label (e.g., "In Progress")
 * - Count badge: shows number of nodes with this status (e.g., "(12)")
 * - Click toggles the status on/off
 * - Cursor: pointer
 *
 * "All" chip: toggles all statuses on/off (select all / deselect all)
 *
 * Props:
 * - activeStatuses: Set<string>
 * - onToggle: (status: string) => void
 * - statusCounts: Record<string, number>
 */
```

### Filter Logic

```typescript
// apps/web/src/hooks/use-graph-status-filter.ts
// Hook that manages status filter state and computes visible nodes/edges.

import { useState, useMemo, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';

/**
 * useGraphStatusFilter(allNodes: Node[], allEdges: Edge[]):
 *   { visibleNodes, visibleEdges, activeStatuses, toggleStatus,
 *     statusCounts, selectAll, deselectAll }
 *
 * State:
 * - activeStatuses: Set<string> — initialized with all statuses active
 *
 * Computed (useMemo):
 * - visibleNodes: nodes where node.data.status is in activeStatuses
 * - visibleEdges: edges where BOTH source and target are in visibleNodes
 *   (an edge is hidden if either connected node is filtered out)
 * - statusCounts: count of nodes per status in the full (unfiltered) dataset
 *
 * Actions:
 * - toggleStatus(status): adds or removes status from activeStatuses
 * - selectAll(): adds all statuses to activeStatuses
 * - deselectAll(): clears activeStatuses (shows empty graph)
 *
 * After filtering, the parent should recompute Dagre layout for
 * the remaining visible nodes to fill gaps left by hidden nodes.
 */
```

## Acceptance Criteria

- [ ] A horizontal row of status filter chips is displayed above the graph canvas
- [ ] One chip exists per status: not_started, in_progress, completed, blocked, failed
- [ ] Chips display the status label and a count of nodes with that status
- [ ] Each chip has a small colored dot matching the status color
- [ ] Active chips have filled background in the status color with white text
- [ ] Inactive chips have outline style with muted text
- [ ] Clicking a chip toggles the status visibility on/off
- [ ] Multiple statuses can be active simultaneously (multi-select)
- [ ] An "All" chip toggles between selecting all and deselecting all statuses
- [ ] Filtered-out nodes are hidden from the graph
- [ ] Edges are hidden when either the source or target node is filtered out
- [ ] Dagre layout is recomputed for visible nodes to maintain clean positioning
- [ ] All statuses are active by default (all nodes visible on initial render)
- [ ] Status counts reflect the full dataset (not the filtered subset)
- [ ] Filter chips wrap to a second line on narrow screens
- [ ] No `any` types are used in the implementation

## Technical Notes

- Filtering is performed on the client side by computing `visibleNodes` and `visibleEdges` from the full dataset. This avoids additional API calls when filters change.
- When nodes are filtered out, the Dagre layout should be recomputed for the remaining visible nodes. This prevents gaps in the graph where hidden nodes would have been positioned.
- The `activeStatuses` state uses a `Set<string>` for O(1) lookup performance.
- The "All" chip behavior: if all statuses are active, clicking "All" deselects all. If any status is inactive, clicking "All" selects all.
- Edge filtering rule: an edge is visible only if both its source and target nodes are visible. This prevents dangling edges pointing to empty space.

## References

- **Design System:** Chip/badge styling from Tailwind CSS v4
- **Graph Library:** ReactFlow node and edge filtering
- **Layout:** Dagre layout recomputation on filter changes
- **Colors:** Status color map from `@/lib/graph/status-colors.ts`

## Estimated Complexity

Medium — Multi-select filter state management, node/edge filtering with edge visibility rules, and Dagre layout recomputation on filter changes.
