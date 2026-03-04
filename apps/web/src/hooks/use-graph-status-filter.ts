/**
 * Hook that manages status filter state and computes visible nodes/edges.
 *
 * Provides multi-select filtering by entity status. Nodes whose status is
 * not in the active set are hidden, along with any edges that connect to
 * a hidden node. The parent component should recompute Dagre layout on
 * the returned visible nodes to fill gaps left by hidden nodes.
 *
 * Statuses are derived dynamically from the actual node dataset so that
 * nodes with statuses like "draft", "ready", or "review" are never
 * hidden on initial render.
 *
 * @module use-graph-status-filter
 */
import { useState, useMemo, useCallback, useEffect } from 'react';

import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Preferred display order for known statuses. Statuses not in this list
 *  are appended alphabetically at the end. */
const KNOWN_STATUS_ORDER: readonly string[] = [
  'not_started',
  'draft',
  'ready',
  'in_progress',
  'review',
  'completed',
  'blocked',
  'failed',
] as const;

/** Human-readable labels for known statuses. Unknown statuses get a
 *  label derived from their key (e.g. "some_status" → "Some Status"). */
const KNOWN_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  completed: 'Completed',
  blocked: 'Blocked',
  failed: 'Failed',
};

/**
 * Converts a snake_case status key into a human-readable label.
 * Falls back to title-casing the key if not in KNOWN_STATUS_LABELS.
 */
const getStatusLabel = (status: string): string => {
  const known = KNOWN_STATUS_LABELS[status];
  if (known) return known;
  // "some_status" → "Some Status"
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface GraphStatusFilterState {
  /** Set of currently active (visible) statuses. */
  activeStatuses: Set<string>;
  /** Nodes whose status is in the active set. */
  visibleNodes: Node<DependencyNodeData>[];
  /** Edges where both source and target are visible. */
  visibleEdges: Edge[];
  /** Count of nodes per status in the full (unfiltered) dataset. */
  statusCounts: Record<string, number>;
  /** Ordered list of statuses present in the data, with human labels. */
  orderedStatuses: { status: string; label: string }[];
  /** Toggle a single status on or off. */
  toggleStatus: (status: string) => void;
  /** Activate all statuses (show every node). */
  selectAll: () => void;
  /** Deactivate all statuses (hide every node). */
  deselectAll: () => void;
}

/**
 * Manages status filter state and computes visible nodes and edges.
 *
 * @param allNodes - The full set of ReactFlow nodes from the transform step.
 * @param allEdges - The full set of ReactFlow edges from the transform step.
 * @returns Filter state and actions, plus the filtered node/edge arrays.
 */
export const useGraphStatusFilter = (
  allNodes: Node<DependencyNodeData>[],
  allEdges: Edge[],
): GraphStatusFilterState => {
  // ---------------------------------------------------------------------------
  // Derive statuses present in the data
  // ---------------------------------------------------------------------------

  const presentStatuses = useMemo(() => {
    const statusSet = new Set<string>();
    for (const node of allNodes) {
      statusSet.add(node.data.status);
    }
    return statusSet;
  }, [allNodes]);

  // ---------------------------------------------------------------------------
  // Ordered statuses — known statuses first (in preferred order), then
  // any unknown statuses sorted alphabetically.
  // ---------------------------------------------------------------------------

  const orderedStatuses = useMemo(() => {
    const result: { status: string; label: string }[] = [];
    const remaining = new Set(presentStatuses);

    // Add known statuses in preferred order (only if present in data)
    for (const status of KNOWN_STATUS_ORDER) {
      if (remaining.has(status)) {
        result.push({ status, label: getStatusLabel(status) });
        remaining.delete(status);
      }
    }

    // Add any unknown statuses alphabetically
    const sorted = [...remaining].sort();
    for (const status of sorted) {
      result.push({ status, label: getStatusLabel(status) });
    }

    return result;
  }, [presentStatuses]);

  // ---------------------------------------------------------------------------
  // Active statuses — initialized to all present statuses
  // ---------------------------------------------------------------------------

  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(() => new Set<string>());

  // Re-sync when the set of present statuses changes (e.g., initial load,
  // view level switch) to ensure new statuses are visible by default.
  useEffect(() => {
    setActiveStatuses(new Set(presentStatuses));
  }, [presentStatuses]);

  // ---------------------------------------------------------------------------
  // Status counts — always computed from the full dataset
  // ---------------------------------------------------------------------------

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of allNodes) {
      const status = node.data.status;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [allNodes]);

  // ---------------------------------------------------------------------------
  // Visible nodes — only those whose status is active
  // ---------------------------------------------------------------------------

  const visibleNodes = useMemo(() => {
    return allNodes.filter((node) => {
      return activeStatuses.has(node.data.status);
    });
  }, [allNodes, activeStatuses]);

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

  const toggleStatus = useCallback((status: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setActiveStatuses(new Set(presentStatuses));
  }, [presentStatuses]);

  const deselectAll = useCallback(() => {
    setActiveStatuses(new Set<string>());
  }, []);

  return {
    activeStatuses,
    visibleNodes,
    visibleEdges,
    statusCounts,
    orderedStatuses,
    toggleStatus,
    selectAll,
    deselectAll,
  };
};
