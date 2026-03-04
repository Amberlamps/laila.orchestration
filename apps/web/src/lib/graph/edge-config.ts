/**
 * Default edge styling and configuration for the dependency graph.
 *
 * Defines edge appearance constants for normal, highlighted, and in-progress
 * states. These are applied as style overrides on ReactFlow Edge objects.
 *
 * @module edge-config
 */
import { MarkerType } from '@xyflow/react';

import type { EdgeMarker } from '@xyflow/react';
import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

/** Default edge stroke color — zinc-300. */
const DEFAULT_EDGE_COLOR = '#d4d4d8';

/** Highlighted edge stroke color — indigo-500. */
const HIGHLIGHTED_EDGE_COLOR = '#6366f1';

/** In-progress edge stroke color — blue-500. */
const IN_PROGRESS_EDGE_COLOR = '#3b82f6';

// ---------------------------------------------------------------------------
// Marker factories
// ---------------------------------------------------------------------------

/** Creates an ArrowClosed marker with the given color. */
const createArrowMarker = (color: string): EdgeMarker => ({
  type: MarkerType.ArrowClosed,
  color,
});

// ---------------------------------------------------------------------------
// Edge style presets
// ---------------------------------------------------------------------------

/** Style properties for the default (non-highlighted) edge state. */
export const DEFAULT_EDGE_STYLE: CSSProperties = {
  stroke: DEFAULT_EDGE_COLOR,
  strokeWidth: 1.5,
};

/** Marker for the default edge state. */
export const DEFAULT_EDGE_MARKER: EdgeMarker = createArrowMarker(DEFAULT_EDGE_COLOR);

/** Style properties for highlighted edges (hovered or selected node). */
export const HIGHLIGHTED_EDGE_STYLE: CSSProperties = {
  stroke: HIGHLIGHTED_EDGE_COLOR,
  strokeWidth: 2,
};

/** Marker for highlighted edges. */
export const HIGHLIGHTED_EDGE_MARKER: EdgeMarker = createArrowMarker(HIGHLIGHTED_EDGE_COLOR);

/** Style properties for in-progress edges. */
export const IN_PROGRESS_EDGE_STYLE: CSSProperties = {
  stroke: IN_PROGRESS_EDGE_COLOR,
  strokeWidth: 1.5,
};

/** Marker for in-progress edges. */
export const IN_PROGRESS_EDGE_MARKER: EdgeMarker = createArrowMarker(IN_PROGRESS_EDGE_COLOR);

/** Style properties for highlighted in-progress edges. */
export const HIGHLIGHTED_IN_PROGRESS_EDGE_STYLE: CSSProperties = {
  stroke: IN_PROGRESS_EDGE_COLOR,
  strokeWidth: 2,
};

// ---------------------------------------------------------------------------
// Z-index constants
// ---------------------------------------------------------------------------

/** z-index for highlighted edges — elevated above default edges. */
export const HIGHLIGHTED_EDGE_ZINDEX = 10;

/** z-index for default (non-highlighted) edges. */
export const DEFAULT_EDGE_ZINDEX = 0;
