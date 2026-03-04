# Implement Epic Filter Dropdown

## Task Details

- **Title:** Implement Epic Filter Dropdown
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Interactivity](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement a dropdown control in the graph toolbar that allows users to filter the graph to show only tasks/stories within selected epics. Supports multi-select so users can view dependencies across multiple epics simultaneously. Unselected epics' nodes and edges are hidden, and the layout is recomputed.

### Epic Filter Dropdown Component

```typescript
// apps/web/src/components/project/graph/graph-epic-filter.tsx
// Multi-select dropdown for filtering graph nodes by parent epic.
// Renders in the graph toolbar alongside status filter chips.

import { useState, useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Layers, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * GraphEpicFilter renders:
 *
 * - Trigger button:
 *   - Icon: Layers (14px)
 *   - Label: "Epics" (or "X of Y epics" when filtered)
 *   - ChevronDown icon (14px)
 *   - Variant: outline
 *   - Visual indicator when filter is active (indigo-50 background)
 *
 * - Popover content (dropdown):
 *   - "Select Epics" heading (text-sm, font-medium)
 *   - "Select All" / "Clear All" links (text-xs, text-indigo-600)
 *   - ScrollArea (max-h-[240px]) for epic list
 *   - Each epic row:
 *     - Checkbox for selection
 *     - Epic name (truncated at 35 chars with title tooltip)
 *     - Node count badge showing how many tasks/stories belong to this epic
 *   - Rows sorted alphabetically by epic name
 *
 * Props:
 * - epics: Array<{ id: string, name: string, nodeCount: number }>
 * - selectedEpicIds: Set<string>
 * - onToggle: (epicId: string) => void
 * - onSelectAll: () => void
 * - onClearAll: () => void
 */
```

### Filter Hook

```typescript
// apps/web/src/hooks/use-graph-epic-filter.ts
// Hook that manages epic filter state and computes visible nodes/edges.

import { useState, useMemo, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';

/**
 * useGraphEpicFilter(allNodes: Node[], allEdges: Edge[]):
 *   { visibleNodes, visibleEdges, selectedEpicIds, toggleEpic,
 *     selectAll, clearAll, epicOptions }
 *
 * State:
 * - selectedEpicIds: Set<string> — initialized with all epic IDs selected
 *
 * Computed (useMemo):
 * - epicOptions: unique epics extracted from node data,
 *   with node count per epic
 * - visibleNodes: nodes where node.data.epicId is in selectedEpicIds
 * - visibleEdges: edges where both source and target are visible
 *
 * Actions:
 * - toggleEpic(epicId): adds or removes epicId from selectedEpicIds
 * - selectAll(): adds all epic IDs to selectedEpicIds
 * - clearAll(): clears selectedEpicIds (shows empty graph)
 *
 * Edge visibility follows the same rule as status filters:
 * an edge is visible only if both its source and target nodes are visible.
 */
```

## Acceptance Criteria

- [ ] A dropdown button labeled "Epics" is displayed in the graph toolbar
- [ ] Clicking the button opens a popover with a list of all epics in the project
- [ ] Each epic row has a checkbox, epic name, and node count badge
- [ ] Epic names longer than 35 characters are truncated with title tooltip
- [ ] Epics are sorted alphabetically by name
- [ ] Clicking a checkbox toggles the epic's visibility in the graph
- [ ] Multiple epics can be selected simultaneously (multi-select)
- [ ] "Select All" link selects all epics
- [ ] "Clear All" link deselects all epics
- [ ] All epics are selected by default (all nodes visible on initial render)
- [ ] When epics are filtered, only nodes belonging to selected epics are shown
- [ ] Edges are hidden when either the source or target node is filtered out
- [ ] The trigger button shows "X of Y epics" when a subset is selected
- [ ] The trigger button has a visual indicator (indigo background tint) when filter is active
- [ ] Dagre layout is recomputed for visible nodes after filter changes
- [ ] Epic list scrolls when there are many epics (max-h-[240px] with ScrollArea)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The epic filter and status filter interact additively: a node must pass both filters to be visible. The graph container should apply both filters before computing the visible node/edge set.
- Use shadcn/ui's Popover, Checkbox, and ScrollArea components for consistent styling with the rest of the application.
- The epic options list is derived from the node data at initialization — each node's `data.epicId` and `data.epicName` fields provide the epic information. Use a `Map` for deduplication.
- When combining with the view level toggle: at the Story view level, filter by epics directly. At the Epic view level, the filter becomes a direct show/hide of epic nodes. At the Task view level, filter tasks by their parent epic.

## References

- **Design System:** Popover, PopoverTrigger, PopoverContent, Checkbox, ScrollArea, Button from shadcn/ui
- **Icons:** Lucide React — Layers, ChevronDown, Check
- **Graph Library:** ReactFlow node filtering
- **Layout:** Dagre recomputation on filter changes

## Estimated Complexity

Medium — Multi-select dropdown with checkboxes, node/edge filtering, and Dagre layout recomputation. Uses standard shadcn/ui components for the UI.
