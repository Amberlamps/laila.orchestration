/**
 * Hook that manages tooltip visibility, data, and position for graph nodes.
 *
 * Provides onNodeMouseEnter / onNodeMouseLeave handlers that compose with
 * existing hover callbacks in the graph container. Tooltip display is debounced
 * by 150ms to prevent flickering during rapid mouse movement. Position is
 * computed from the mouse event coordinates with viewport boundary detection.
 *
 * @module use-graph-tooltip
 */
import { useCallback, useRef, useState } from 'react';

import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delay in ms before the tooltip becomes visible after mouse enter. */
const TOOLTIP_DELAY_MS = 150;

/** Pixel offset from the cursor to the tooltip origin. */
const TOOLTIP_OFFSET = 16;

/** Estimated tooltip dimensions for viewport boundary detection. */
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Screen-space position for the tooltip. */
export interface TooltipPosition {
  x: number;
  y: number;
}

/** Return type for the useGraphTooltip hook. */
export interface UseGraphTooltipReturn {
  /** Data to display in the tooltip, or null when hidden. */
  tooltipData: DependencyNodeData | null;
  /** Screen-space coordinates where the tooltip should render. */
  tooltipPosition: TooltipPosition;
  /** Handler to call on ReactFlow onNodeMouseEnter. */
  onNodeMouseEnter: (event: React.MouseEvent, node: Node) => void;
  /** Handler to call on ReactFlow onNodeMouseLeave. */
  onNodeMouseLeave: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the tooltip position offset from the cursor, ensuring it
 * stays within the viewport bounds.
 */
const computeTooltipPosition = (clientX: number, clientY: number): TooltipPosition => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

  // Default: position to the right and below the cursor
  let x = clientX + TOOLTIP_OFFSET;
  let y = clientY + TOOLTIP_OFFSET;

  // If tooltip would overflow the right edge, position to the left of the cursor
  if (x + TOOLTIP_WIDTH > viewportWidth) {
    x = clientX - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
  }

  // If tooltip would overflow the bottom edge, position above the cursor
  if (y + TOOLTIP_HEIGHT > viewportHeight) {
    y = clientY - TOOLTIP_OFFSET - TOOLTIP_HEIGHT;
  }

  // Clamp to ensure tooltip never goes off-screen on the left/top
  if (x < 0) {
    x = TOOLTIP_OFFSET;
  }
  if (y < 0) {
    y = TOOLTIP_OFFSET;
  }

  return { x, y };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages tooltip state for dependency graph nodes.
 *
 * - 150ms debounce before showing to prevent flicker
 * - Viewport-aware positioning (flips when near edges)
 * - Clears tooltip on mouse leave immediately
 */
export const useGraphTooltip = (): UseGraphTooltipReturn => {
  const [tooltipData, setTooltipData] = useState<DependencyNodeData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    // Clear any pending show timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    const position = computeTooltipPosition(event.clientX, event.clientY);

    // Debounce: wait 150ms before showing the tooltip
    timerRef.current = setTimeout(() => {
      setTooltipData(node.data as DependencyNodeData);
      setTooltipPosition(position);
      timerRef.current = null;
    }, TOOLTIP_DELAY_MS);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    // Cancel pending show timer if the mouse leaves before the delay completes
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setTooltipData(null);
  }, []);

  return { tooltipData, tooltipPosition, onNodeMouseEnter, onNodeMouseLeave };
};
