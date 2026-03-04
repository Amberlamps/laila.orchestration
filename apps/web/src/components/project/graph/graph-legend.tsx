/**
 * GraphLegend — always-visible legend showing status color and label pairs.
 *
 * Positioned below the ReactFlow graph canvas at the bottom of the
 * graph container. Uses the same hex colors as graph nodes and minimap
 * for visual consistency.
 *
 * Layout:
 * - Desktop: single horizontal row with all items
 * - Mobile: wraps to multiple rows (flex-wrap)
 * - Always visible, not toggleable or collapsible
 */

import { statusHexColors } from '@/lib/graph/status-colors';

// ---------------------------------------------------------------------------
// Legend item definitions
// ---------------------------------------------------------------------------

interface LegendItem {
  /** Status key matching statusHexColors. */
  status: string;
  /** Human-readable label displayed next to the color indicator. */
  label: string;
  /** Hex color for the status indicator circle. */
  color: string;
}

/** Fallback color used when a status key is missing from the hex color map. */
const FALLBACK_COLOR = '#a1a1aa';

const legendItems: LegendItem[] = [
  {
    status: 'not_started',
    label: 'Not Started',
    color: statusHexColors.not_started ?? FALLBACK_COLOR,
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    color: statusHexColors.in_progress ?? FALLBACK_COLOR,
  },
  { status: 'completed', label: 'Completed', color: statusHexColors.completed ?? FALLBACK_COLOR },
  { status: 'blocked', label: 'Blocked', color: statusHexColors.blocked ?? FALLBACK_COLOR },
  { status: 'failed', label: 'Failed', color: statusHexColors.failed ?? FALLBACK_COLOR },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a horizontal legend strip showing status-to-color mappings.
 *
 * Each item displays a small colored circle paired with a text label.
 * The legend uses a semi-transparent background with backdrop blur for
 * a subtle glass-morphism effect and a top border to visually separate
 * it from the graph canvas above.
 */
export const GraphLegend = () => (
  <div
    className="flex flex-wrap items-center justify-center gap-4 border-t border-zinc-200 bg-white/80 px-4 py-2 backdrop-blur-sm"
    role="list"
    aria-label="Graph status legend"
  >
    {legendItems.map((item) => (
      <div key={item.status} className="flex items-center gap-2" role="listitem">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: item.color }}
          aria-hidden="true"
        />
        <span className="text-xs text-zinc-600">{item.label}</span>
      </div>
    ))}
  </div>
);
