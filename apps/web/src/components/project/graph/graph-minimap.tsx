/**
 * GraphMinimap — ReactFlow MiniMap configured for the dependency graph.
 *
 * Renders a compact bird's-eye overview of the full graph in the bottom-right
 * corner of the canvas. Nodes are colored by their entity status using the
 * shared statusHexColors palette.
 *
 * Configuration:
 * - Dimensions: 160px wide x 100px tall
 * - Background: zinc-50 (#fafafa)
 * - Border: 1px solid zinc-200 (#e4e4e7), rounded-lg
 * - Mask: semi-transparent overlay on non-viewport areas
 * - Pannable: dragging the viewport rectangle pans the main graph
 * - Not zoomable: always shows the full graph extent
 */
import { MiniMap } from '@xyflow/react';

import { statusHexColors } from '@/lib/graph/status-colors';

import type { Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Inline styles applied to the MiniMap SVG element. */
const MINIMAP_STYLE: React.CSSProperties = {
  width: 160,
  height: 100,
  backgroundColor: '#fafafa', // zinc-50
  border: '1px solid #e4e4e7', // zinc-200
  borderRadius: '0.5rem', // rounded-lg
};

/** Semi-transparent mask color overlaying areas outside the current viewport. */
const MASK_COLOR = 'rgba(0, 0, 0, 0.08)';

/** Fallback hex color for nodes with an unknown or missing status (zinc-400). */
const FALLBACK_NODE_COLOR = '#a1a1aa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a hex color string for the given node based on its data.status.
 *
 * The MiniMap passes each node through this callback to determine its fill
 * color. Since the default Node type has `data: Record<string, unknown>`,
 * we check that `status` is a string before looking it up.
 */
function getNodeColor(node: Node): string {
  const status = node.data.status;

  if (typeof status === 'string') {
    return statusHexColors[status] ?? FALLBACK_NODE_COLOR;
  }

  return FALLBACK_NODE_COLOR;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GraphMinimap renders ReactFlow's built-in MiniMap component with custom
 * styling and status-based node coloring. Place as a child of `<ReactFlow>`.
 */
export function GraphMinimap() {
  return (
    <MiniMap
      style={MINIMAP_STYLE}
      nodeColor={getNodeColor}
      maskColor={MASK_COLOR}
      zoomable={false}
      pannable
    />
  );
}
