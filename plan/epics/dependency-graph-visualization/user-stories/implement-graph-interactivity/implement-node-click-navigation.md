# Implement Node Click Navigation

## Task Details

- **Title:** Implement Node Click Navigation
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Interactivity](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement click-based navigation on graph nodes so that clicking a node navigates the user to the entity's detail page. Single click navigates to the entity detail, and double-click can be used for deep navigation (e.g., into a story's task list).

### Click Navigation Handler

```typescript
// apps/web/src/components/project/graph/hooks/use-node-navigation.ts
// Hook that handles node click events for navigation.
// Uses Next.js router for client-side navigation.

import { useCallback } from 'react';
import { useRouter } from 'next/router';
import type { Node } from '@xyflow/react';

/**
 * useNodeNavigation(projectId: string):
 *   { onNodeClick: (event: React.MouseEvent, node: Node) => void,
 *     onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void }
 *
 * Single click navigation:
 * - Builds URL based on entity type and ID from node.data:
 *   - Epic: /projects/:projectId/epics/:epicId
 *   - Story: /projects/:projectId/stories/:storyId
 *   - Task: /projects/:projectId/tasks/:taskId
 * - Uses router.push() for client-side navigation
 *
 * Double click navigation:
 * - Navigates to the entity detail page with a specific tab or section:
 *   - Epic: /projects/:projectId/epics/:epicId?tab=stories
 *   - Story: /projects/:projectId/stories/:storyId?tab=tasks
 *   - Task: same as single click (no deeper level)
 * - Uses router.push() for client-side navigation
 *
 * Prevents event propagation to avoid canvas pan on click.
 */
```

### Integration with Graph Container

```typescript
// The node click handler is integrated into the DependencyGraphContainer
// via ReactFlow's onNodeClick and onNodeDoubleClick props.

/**
 * const { onNodeClick, onNodeDoubleClick } = useNodeNavigation(projectId);
 *
 * <ReactFlow
 *   onNodeClick={onNodeClick}
 *   onNodeDoubleClick={onNodeDoubleClick}
 *   ...
 * />
 */
```

## Acceptance Criteria

- [ ] Single-clicking a node navigates to the entity's detail page
- [ ] Epic nodes navigate to `/projects/:projectId/epics/:epicId`
- [ ] Story nodes navigate to `/projects/:projectId/stories/:storyId`
- [ ] Task nodes navigate to `/projects/:projectId/tasks/:taskId`
- [ ] Double-clicking an epic node navigates to the epic detail with the stories tab selected
- [ ] Double-clicking a story node navigates to the story detail with the tasks tab selected
- [ ] Double-clicking a task node navigates to the task detail page (same as single click)
- [ ] Navigation uses Next.js `router.push()` for client-side transitions
- [ ] Click events do not trigger canvas pan (event propagation is handled)
- [ ] Navigation URL is constructed from `node.data.entityType` and `node.data.entityId`
- [ ] The hook receives `projectId` to construct correct URL paths
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow's `onNodeClick` callback receives `(event: React.MouseEvent, node: Node)` as arguments. The `node.data` object contains the entity type and ID set during data transformation.
- Distinguish between single and double click using ReactFlow's separate `onNodeClick` and `onNodeDoubleClick` props. ReactFlow handles the event discrimination internally.
- The `useRouter()` hook from Next.js provides `router.push()` for programmatic navigation. Use it within the click handler for client-side transitions without full page reloads.
- Consider adding a brief visual feedback (e.g., ring animation) on the clicked node before navigation occurs, to acknowledge the user's action.

## References

- **ReactFlow:** `onNodeClick`, `onNodeDoubleClick` callback props
- **Next.js Router:** `useRouter()` hook, `router.push()` for navigation
- **URL Structure:** Entity detail pages from Epic 9 (Entity Management UI)

## Estimated Complexity

Low — Straightforward click handler that maps node data to URL paths and navigates. The main consideration is proper URL construction for different entity types.
