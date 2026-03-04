/**
 * Derives story-level and epic-level dependency graphs from the task-level DAG.
 *
 * Each function groups task nodes by their parent entity (story or epic),
 * creates one aggregated node per group, and deduplicates cross-entity edges.
 *
 * Status aggregation priority: failed > blocked > in_progress > not_started > completed.
 *
 * @module derive-view-levels
 */
import {
  DEFAULT_EDGE_MARKER,
  DEFAULT_EDGE_STYLE,
  DEFAULT_EDGE_ZINDEX,
  IN_PROGRESS_EDGE_MARKER,
  IN_PROGRESS_EDGE_STYLE,
} from './edge-config';

import type { DependencyNodeData, GraphEntityType } from './types';
import type { Edge, Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** View level options for the dependency graph. */
export type GraphViewLevel = 'tasks' | 'stories' | 'epics';

/** Result shape returned by derivation functions. */
interface DerivedGraph {
  nodes: Node[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Status aggregation priority — higher index = higher priority. */
const STATUS_PRIORITY: readonly string[] = [
  'completed',
  'not_started',
  'in_progress',
  'blocked',
  'failed',
];

/** Maps entity types to custom ReactFlow node type identifiers. */
const NODE_TYPE_MAP: Record<GraphEntityType, string> = {
  epic: 'epicNode',
  story: 'storyNode',
  task: 'taskNode',
};

/** Statuses that indicate active in-progress work. */
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'review']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the higher-priority status between two statuses.
 *
 * Priority order: failed > blocked > in_progress > not_started > completed.
 * Unknown statuses default to the lowest priority (completed equivalent).
 */
const higherPriorityStatus = (a: string, b: string): string => {
  const priorityA = STATUS_PRIORITY.indexOf(a);
  const priorityB = STATUS_PRIORITY.indexOf(b);

  // Unknown statuses get priority -1 (lowest)
  return priorityA >= priorityB ? a : b;
};

/**
 * Aggregates an array of status strings into a single representative status.
 *
 * Returns the status with the highest priority among all provided statuses.
 * Defaults to 'not_started' for empty arrays.
 */
const aggregateStatuses = (statuses: string[]): string => {
  if (statuses.length === 0) {
    return 'not_started';
  }

  return statuses.reduce(higherPriorityStatus);
};

/**
 * Creates a ReactFlow edge between two derived nodes with appropriate styling.
 */
const createDerivedEdge = (sourceId: string, targetId: string, sourceStatus: string): Edge => {
  const isInProgress = IN_PROGRESS_STATUSES.has(sourceStatus);

  return {
    id: `edge-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
    animated: isInProgress,
    style: isInProgress ? IN_PROGRESS_EDGE_STYLE : DEFAULT_EDGE_STYLE,
    markerEnd: isInProgress ? IN_PROGRESS_EDGE_MARKER : DEFAULT_EDGE_MARKER,
    zIndex: DEFAULT_EDGE_ZINDEX,
  };
};

// ---------------------------------------------------------------------------
// Group info type
// ---------------------------------------------------------------------------

/** Collected information about a group of task nodes sharing a parent entity. */
interface GroupInfo {
  /** All statuses of constituent task nodes. */
  statuses: string[];
  /** Display label for the derived node. */
  label: string;
  /** The parent entity ID for epic-level derivation. */
  epicId?: string | undefined;
  /** The parent entity name for epic-level derivation. */
  epicName?: string | undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives a story-level graph from the task-level DAG.
 *
 * Algorithm:
 * 1. Groups task nodes by their parent story ID.
 * 2. Creates one story-level node per group with aggregated status.
 * 3. Derives edges by deduplicating cross-story task edges.
 *
 * Task nodes without a storyId are grouped under a synthetic "Ungrouped" story.
 */
export const deriveStoryView = (taskNodes: Node[], taskEdges: Edge[]): DerivedGraph => {
  // Build a lookup from task node ID to story ID
  const taskToStory = new Map<string, string>();

  // Group info by story ID
  const storyGroups = new Map<string, GroupInfo>();

  for (const node of taskNodes) {
    const data = node.data as DependencyNodeData;
    const storyId = data.storyId ?? 'ungrouped';
    const storyName = data.storyName ?? 'Ungrouped Tasks';

    taskToStory.set(node.id, storyId);

    const existing = storyGroups.get(storyId);
    if (existing) {
      existing.statuses.push(data.status);
    } else {
      storyGroups.set(storyId, {
        statuses: [data.status],
        label: storyName,
        epicId: data.epicId,
        epicName: data.epicName,
      });
    }
  }

  // Create story-level nodes
  const nodes: Node[] = [];
  for (const [storyId, group] of storyGroups) {
    const aggregatedStatus = aggregateStatuses(group.statuses);
    const nodeData: DependencyNodeData = {
      label: group.label,
      status: aggregatedStatus,
      entityType: 'story',
      entityId: storyId,
      epicId: group.epicId,
      epicName: group.epicName,
    };

    nodes.push({
      id: storyId,
      type: NODE_TYPE_MAP.story,
      position: { x: 0, y: 0 },
      data: nodeData,
    });
  }

  // Derive story-level edges — deduplicate by (sourceStory, targetStory)
  const edgeSet = new Set<string>();
  const statusByStory = new Map<string, string>();
  for (const node of nodes) {
    const data = node.data as DependencyNodeData;
    statusByStory.set(node.id, data.status);
  }

  const edges: Edge[] = [];
  for (const edge of taskEdges) {
    const sourceStory = taskToStory.get(edge.source);
    const targetStory = taskToStory.get(edge.target);

    // Skip edges within the same story
    if (!sourceStory || !targetStory || sourceStory === targetStory) {
      continue;
    }

    const edgeKey = `${sourceStory}->${targetStory}`;
    if (edgeSet.has(edgeKey)) {
      continue;
    }
    edgeSet.add(edgeKey);

    const sourceStatus = statusByStory.get(sourceStory) ?? 'not_started';
    edges.push(createDerivedEdge(sourceStory, targetStory, sourceStatus));
  }

  return { nodes, edges };
};

/**
 * Derives an epic-level graph from the task-level DAG.
 *
 * Algorithm:
 * 1. Groups task nodes by their parent epic ID.
 * 2. Creates one epic-level node per group with aggregated status.
 * 3. Derives edges by deduplicating cross-epic task edges.
 *
 * Task nodes without an epicId are grouped under a synthetic "Ungrouped" epic.
 */
export const deriveEpicView = (taskNodes: Node[], taskEdges: Edge[]): DerivedGraph => {
  // Build a lookup from task node ID to epic ID
  const taskToEpic = new Map<string, string>();

  // Group info by epic ID
  const epicGroups = new Map<string, GroupInfo>();

  for (const node of taskNodes) {
    const data = node.data as DependencyNodeData;
    const epicId = data.epicId ?? 'ungrouped';
    const epicName = data.epicName ?? 'Ungrouped Tasks';

    taskToEpic.set(node.id, epicId);

    const existing = epicGroups.get(epicId);
    if (existing) {
      existing.statuses.push(data.status);
    } else {
      epicGroups.set(epicId, {
        statuses: [data.status],
        label: epicName,
      });
    }
  }

  // Create epic-level nodes
  const nodes: Node[] = [];
  for (const [epicId, group] of epicGroups) {
    const aggregatedStatus = aggregateStatuses(group.statuses);
    const nodeData: DependencyNodeData = {
      label: group.label,
      status: aggregatedStatus,
      entityType: 'epic',
      entityId: epicId,
      epicId: epicId,
      epicName: group.label,
    };

    nodes.push({
      id: epicId,
      type: NODE_TYPE_MAP.epic,
      position: { x: 0, y: 0 },
      data: nodeData,
    });
  }

  // Derive epic-level edges — deduplicate by (sourceEpic, targetEpic)
  const edgeSet = new Set<string>();
  const statusByEpic = new Map<string, string>();
  for (const node of nodes) {
    const data = node.data as DependencyNodeData;
    statusByEpic.set(node.id, data.status);
  }

  const edges: Edge[] = [];
  for (const edge of taskEdges) {
    const sourceEpic = taskToEpic.get(edge.source);
    const targetEpic = taskToEpic.get(edge.target);

    // Skip edges within the same epic
    if (!sourceEpic || !targetEpic || sourceEpic === targetEpic) {
      continue;
    }

    const edgeKey = `${sourceEpic}->${targetEpic}`;
    if (edgeSet.has(edgeKey)) {
      continue;
    }
    edgeSet.add(edgeKey);

    const sourceStatus = statusByEpic.get(sourceEpic) ?? 'not_started';
    edges.push(createDerivedEdge(sourceEpic, targetEpic, sourceStatus));
  }

  return { nodes, edges };
};
