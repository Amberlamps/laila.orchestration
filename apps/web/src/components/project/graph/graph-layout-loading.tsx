/**
 * Loading overlay displayed while the Web Worker computes layout positions
 * for large dependency graphs (>200 nodes).
 *
 * Renders a semi-transparent overlay with a spinner and contextual text
 * showing the number of nodes being positioned. Z-index is set above the
 * graph canvas but below any floating toolbar.
 *
 * @module graph-layout-loading
 */

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphLayoutLoadingProps {
  /** The number of nodes being positioned in the layout computation. */
  nodeCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Semi-transparent overlay with spinner shown during Web Worker layout computation.
 *
 * - `bg-white/80` + `backdrop-blur-sm` for readability over the graph
 * - `z-[5]` to sit above the ReactFlow canvas but below floating controls (z-20)
 * - Centered spinner with contextual "Computing layout..." and node count text
 */
export const GraphLayoutLoading = ({ nodeCount }: GraphLayoutLoadingProps) => (
  <div
    className="absolute inset-0 z-[5] flex items-center justify-center bg-white/80 backdrop-blur-sm"
    role="status"
    aria-label="Computing graph layout"
  >
    <div className="flex flex-col items-center gap-2">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500" />
      <p className="text-sm text-zinc-500">Computing layout...</p>
      <p className="text-xs text-zinc-400">Positioning {String(nodeCount)} nodes</p>
    </div>
  </div>
);
