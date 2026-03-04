/**
 * GraphMinimap — bird's-eye overview of the dependency graph.
 *
 * Renders ReactFlow's built-in MiniMap component configured for the
 * dependency graph:
 * - Position: bottom-right corner (ReactFlow default)
 * - Dimensions: 160px wide x 100px tall
 * - Node color: mapped to entity status via statusHexColors
 * - Mask: semi-transparent overlay on areas outside the current viewport
 * - Background: zinc-50 (#fafafa), 1px zinc-200 border, rounded corners
 * - Pannable: yes (drag viewport rectangle to pan main graph)
 * - Zoomable: no (always shows full graph extent)
 */
import { MiniMap } from '@xyflow/react';

import { statusHexColors } from '@/lib/graph/status-colors';

import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node } from '@xyflow/react';

const MINIMAP_STYLE = {
  width: 160,
  height: 100,
  backgroundColor: '#fafafa',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
} as const;

const MASK_COLOR = 'rgba(0, 0, 0, 0.08)';

/** Fallback color when status is not found (zinc-400, same as not_started). */
const DEFAULT_NODE_COLOR = '#a1a1aa';

function getNodeColor(node: Node<DependencyNodeData>): string {
  return statusHexColors[node.data.status] ?? DEFAULT_NODE_COLOR;
}

export function GraphMinimap() {
  return (
    <MiniMap<Node<DependencyNodeData>>
      style={MINIMAP_STYLE}
      nodeColor={getNodeColor}
      maskColor={MASK_COLOR}
      zoomable={false}
      pannable
    />
  );
}
