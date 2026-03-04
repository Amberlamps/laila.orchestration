/**
 * GraphLegend — always-visible legend displaying status color mappings.
 *
 * Renders a horizontal row of color-label pairs at the bottom of the graph
 * container. Uses the same statusHexColors that nodes and edges use, ensuring
 * visual consistency across the graph.
 */
import { statusHexColors } from '@/lib/graph/status-colors';

// ---------------------------------------------------------------------------
// Legend item definitions
// ---------------------------------------------------------------------------

interface LegendItem {
  /** Internal status key matching statusHexColors keys. */
  status: string;
  /** Human-readable label shown next to the color circle. */
  label: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  { status: 'not_started', label: 'Not Started' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'failed', label: 'Failed' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Always-visible legend showing status color and label pairs. */
export const GraphLegend = () => (
  <div className="flex flex-wrap items-center justify-center gap-4 border-t border-zinc-200 bg-white/80 px-4 py-2 backdrop-blur-sm">
    {LEGEND_ITEMS.map((item) => (
      <div key={item.status} className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: statusHexColors[item.status] }}
          aria-hidden="true"
        />
        <span className="text-xs text-zinc-600">{item.label}</span>
      </div>
    ))}
  </div>
);
