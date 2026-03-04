/**
 * Hook that manages epic filter state and computes visible nodes/edges.
 *
 * Provides multi-select filtering by parent epic. Nodes whose epicId is
 * not in the selected set are hidden, along with any edges that connect
 * to a hidden node. The parent component should recompute Dagre layout
 * on the returned visible nodes to fill gaps left by hidden nodes.
 *
 * @module use-graph-epic-filter
 */
import { useState, useMemo, useCallback, useEffect } from 'react';

import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a unique epic extracted from node data, with its node count. */
export interface EpicOption {
  /** Epic entity ID. */
  id: string;
  /** Epic display name. */
  name: string;
  /** Number of nodes belonging to this epic. */
  nodeCount: number;
}

export interface GraphEpicFilterState {
  /** Set of currently selected (visible) epic IDs. */
  selectedEpicIds: Set<string>;
  /** Unique epics extracted from node data, sorted alphabetically, with node counts. */
  epicOptions: EpicOption[];
  /** Nodes whose epicId is in the selected set. */
  visibleNodes: Node<DependencyNodeData>[];
  /** Edges where both source and target are visible. */
  visibleEdges: Edge[];
  /** Toggle a single epic on or off. */
  toggleEpic: (epicId: string) => void;
  /** Select all epics (show all nodes). */
  selectAll: () => void;
  /** Clear all epics (hide all nodes). */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts unique epics from node data and counts nodes per epic.
 * Returns options sorted alphabetically by epic name.
 */
const buildEpicOptions = (nodes: Node<DependencyNodeData>[]): EpicOption[] => {
  const epicMap = new Map<string, { name: string; count: number }>();

  for (const node of nodes) {
    const data = node.data;
    const epicId = data.epicId;
    const epicName = data.epicName;

    if (epicId !== undefined && epicName !== undefined) {
      const existing = epicMap.get(epicId);
      if (existing) {
        existing.count += 1;
      } else {
        epicMap.set(epicId, { name: epicName, count: 1 });
      }
    }
  }

  const options: EpicOption[] = [];
  for (const [id, value] of epicMap) {
    options.push({ id, name: value.name, nodeCount: value.count });
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
};

/**
 * Extracts all unique epic IDs from node data.
 */
const extractAllEpicIds = (nodes: Node<DependencyNodeData>[]): Set<string> => {
  const ids = new Set<string>();
  for (const node of nodes) {
    const data = node.data;
    if (data.epicId !== undefined) {
      ids.add(data.epicId);
    }
  }
  return ids;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages epic filter state and computes visible nodes and edges.
 *
 * @param allNodes - The full set of ReactFlow nodes from the transform step.
 * @param allEdges - The full set of ReactFlow edges from the transform step.
 * @returns Filter state and actions, plus the filtered node/edge arrays.
 */
export const useGraphEpicFilter = (
  allNodes: Node<DependencyNodeData>[],
  allEdges: Edge[],
): GraphEpicFilterState => {
  // ---------------------------------------------------------------------------
  // Epic options — unique epics from node data, sorted alphabetically
  // ---------------------------------------------------------------------------

  const epicOptions = useMemo(() => buildEpicOptions(allNodes), [allNodes]);

  // ---------------------------------------------------------------------------
  // All epic IDs — used for initialization and selectAll
  // ---------------------------------------------------------------------------

  const allEpicIds = useMemo(() => extractAllEpicIds(allNodes), [allNodes]);

  // ---------------------------------------------------------------------------
  // Selected epic IDs — initialized with all epic IDs
  // ---------------------------------------------------------------------------

  const [selectedEpicIds, setSelectedEpicIds] = useState<Set<string>>(() => new Set<string>());

  // Sync selected epic IDs when the available epics change (e.g., initial data load)
  useEffect(() => {
    setSelectedEpicIds(new Set(allEpicIds));
  }, [allEpicIds]);

  // ---------------------------------------------------------------------------
  // Visible nodes — only those whose epicId is selected
  // ---------------------------------------------------------------------------

  const visibleNodes = useMemo(() => {
    // If no epic options exist (no nodes have epicId), show all nodes
    if (epicOptions.length === 0) {
      return allNodes;
    }
    return allNodes.filter((node) => {
      const data = node.data;
      // Nodes without an epicId (e.g., epic nodes themselves) are always visible
      if (data.epicId === undefined) {
        return true;
      }
      return selectedEpicIds.has(data.epicId);
    });
  }, [allNodes, selectedEpicIds, epicOptions.length]);

  // ---------------------------------------------------------------------------
  // Visible edges — both source and target must be visible
  // ---------------------------------------------------------------------------

  const visibleEdges = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return allEdges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    );
  }, [allEdges, visibleNodes]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const toggleEpic = useCallback((epicId: string) => {
    setSelectedEpicIds((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedEpicIds(new Set(allEpicIds));
  }, [allEpicIds]);

  const clearAll = useCallback(() => {
    setSelectedEpicIds(new Set<string>());
  }, []);

  return {
    selectedEpicIds,
    epicOptions,
    visibleNodes,
    visibleEdges,
    toggleEpic,
    selectAll,
    clearAll,
  };
};
