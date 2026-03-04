/**
 * useNodeNavigation — handles node click events for navigation in the
 * dependency graph.
 *
 * Single click navigates to the entity detail page:
 *  - Epic:  /projects/:projectId/epics/:entityId
 *  - Story: /projects/:projectId/stories/:entityId
 *  - Task:  /projects/:projectId/tasks/:entityId
 *
 * Double click navigates to a deeper tab on the detail page:
 *  - Epic:  /projects/:projectId/epics/:entityId?tab=stories
 *  - Story: /projects/:projectId/stories/:entityId?tab=tasks
 *  - Task:  same as single click (no deeper level)
 *
 * Uses Next.js pages-router `router.push()` for client-side transitions and
 * stops event propagation to prevent ReactFlow canvas panning on click.
 *
 * @module use-node-navigation
 */
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import type { GraphEntityType } from '@/lib/graph/types';
import type { Node, NodeMouseHandler } from '@xyflow/react';

// ---------------------------------------------------------------------------
// URL segment mapping
// ---------------------------------------------------------------------------

/** Maps an entity type to the plural URL path segment used in route patterns. */
const ENTITY_PATH_SEGMENT: Record<GraphEntityType, string> = {
  epic: 'epics',
  story: 'stories',
  task: 'tasks',
};

/**
 * Maps an entity type to the tab query-parameter appended on double-click.
 * Tasks have no deeper level, so they are omitted from this mapping.
 */
const DOUBLE_CLICK_TAB: Partial<Record<GraphEntityType, string>> = {
  epic: 'stories',
  story: 'tasks',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseNodeNavigationReturn {
  /** Handler for ReactFlow `onNodeClick`. Navigates to the entity detail page. */
  onNodeClick: NodeMouseHandler;
  /** Handler for ReactFlow `onNodeDoubleClick`. Navigates to entity detail with a deeper tab. */
  onNodeDoubleClick: NodeMouseHandler;
}

/**
 * Provides stable click handlers for navigating from a graph node to the
 * corresponding entity detail page.
 *
 * @param projectId - The current project ID used to construct URL paths.
 */
export const useNodeNavigation = (projectId: string): UseNodeNavigationReturn => {
  const router = useRouter();

  const onNodeClick: NodeMouseHandler = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();

      const entityType = node.data.entityType as GraphEntityType;
      const entityId = node.data.entityId as string;
      const segment = ENTITY_PATH_SEGMENT[entityType];

      void router.push(`/projects/${projectId}/${segment}/${entityId}`);
    },
    [projectId, router],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();

      const entityType = node.data.entityType as GraphEntityType;
      const entityId = node.data.entityId as string;
      const segment = ENTITY_PATH_SEGMENT[entityType];
      const tab = DOUBLE_CLICK_TAB[entityType];

      const url = tab
        ? `/projects/${projectId}/${segment}/${entityId}?tab=${tab}`
        : `/projects/${projectId}/${segment}/${entityId}`;

      void router.push(url);
    },
    [projectId, router],
  );

  return { onNodeClick, onNodeDoubleClick };
};
