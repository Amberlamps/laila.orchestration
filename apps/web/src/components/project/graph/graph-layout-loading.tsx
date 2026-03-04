/**
 * Loading overlay displayed while the Web Worker computes Dagre layout
 * for large graphs (> 200 nodes).
 *
 * Renders a semi-transparent overlay with a spinner, descriptive text,
 * and the node count. Positioned above the graph canvas but below the
 * toolbar controls.
 *
 * @module graph-layout-loading
 */

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphLayoutLoadingProps {
  /** Number of nodes being positioned. */
  nodeCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Semi-transparent overlay shown during Web Worker layout computation.
 *
 * Visual hierarchy:
 * - Spinner animation (indigo-500 accent)
 * - "Computing layout..." primary text
 * - "Positioning X nodes" secondary text with count
 */
export const GraphLayoutLoading = ({ nodeCount }: GraphLayoutLoadingProps) => (
  <div
    className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm"
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
