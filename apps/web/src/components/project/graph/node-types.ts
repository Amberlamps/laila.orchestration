/**
 * Custom node types registry for ReactFlow.
 *
 * Defined at module scope to guarantee a stable reference across re-renders.
 * ReactFlow will re-register node types (and unmount/remount all custom nodes)
 * whenever the nodeTypes object identity changes, so a module-level constant
 * is the most robust approach.
 *
 * All entity types (epic, story, task) share the same DagNode component;
 * the visual differentiation (icon, status color) is driven by node.data.
 */
import { DagNode } from './nodes/dag-node';

import type { NodeTypes } from '@xyflow/react';

/**
 * Maps ReactFlow node type strings to the DagNode component.
 *
 * The type keys must match the values produced by NODE_TYPE_MAP
 * in transform-graph-data.ts: "epicNode", "storyNode", "taskNode".
 */
export const NODE_TYPES: NodeTypes = {
  epicNode: DagNode,
  storyNode: DagNode,
  taskNode: DagNode,
};
