/**
 * GraphStatusFilter — horizontal row of toggleable status filter chips.
 *
 * Renders one chip per entity status present in the dataset plus an "All"
 * toggle chip. Active chips have a filled background in the status color
 * with white text; inactive chips use an outline style with muted text.
 *
 * Statuses are derived dynamically from the node data so that statuses
 * like "draft", "ready", or "review" always appear when present.
 *
 * @module graph-status-filter
 */
import { useCallback } from 'react';

import { statusHexColors } from '@/lib/graph/status-colors';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphStatusFilterProps {
  /** Set of currently active (visible) statuses. */
  activeStatuses: Set<string>;
  /** Callback to toggle a single status on or off. */
  onToggle: (status: string) => void;
  /** Count of nodes per status in the full (unfiltered) dataset. */
  statusCounts: Record<string, number>;
  /** Ordered list of statuses present in the data, with human labels. */
  orderedStatuses: { status: string; label: string }[];
  /** Activate all statuses. */
  onSelectAll: () => void;
  /** Deactivate all statuses. */
  onDeselectAll: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatusChipProps {
  status: string;
  label: string;
  count: number;
  isActive: boolean;
  hexColor: string;
  onToggle: (status: string) => void;
}

/** A single status filter chip with colored dot, label, and count badge. */
const StatusChip = ({ status, label, count, isActive, hexColor, onToggle }: StatusChipProps) => {
  const handleClick = useCallback(() => {
    onToggle(status);
  }, [onToggle, status]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        isActive
          ? 'text-white'
          : 'border-zinc-300 bg-transparent text-zinc-500 dark:border-zinc-600 dark:text-zinc-400',
      )}
      style={isActive ? { backgroundColor: hexColor, borderColor: hexColor } : undefined}
      aria-pressed={isActive}
      aria-label={`Filter by ${label}: ${String(count)} nodes`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: hexColor }}
        aria-hidden="true"
      />
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold',
          isActive
            ? 'bg-white/25 text-white'
            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
        )}
      >
        {String(count)}
      </span>
    </button>
  );
};

interface AllChipProps {
  allActive: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

/** The "All" chip — toggles between selecting all and deselecting all statuses. */
const AllChip = ({ allActive, onSelectAll, onDeselectAll }: AllChipProps) => {
  const handleClick = useCallback(() => {
    if (allActive) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  }, [allActive, onSelectAll, onDeselectAll]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        allActive
          ? 'border-zinc-800 bg-zinc-800 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900'
          : 'border-zinc-300 bg-transparent text-zinc-500 dark:border-zinc-600 dark:text-zinc-400',
      )}
      aria-pressed={allActive}
      aria-label={allActive ? 'Deselect all statuses' : 'Select all statuses'}
    >
      All
    </button>
  );
};

// ---------------------------------------------------------------------------
// Fallback color for unknown statuses
// ---------------------------------------------------------------------------

const DEFAULT_HEX_COLOR = '#a1a1aa'; // zinc-400

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Renders a horizontal row of status filter chips above the graph canvas.
 *
 * Includes one chip per status present in the data (with colored dot,
 * label, count) and an "All" toggle chip. Wraps to a second line on
 * narrow screens.
 */
export const GraphStatusFilter = ({
  activeStatuses,
  onToggle,
  statusCounts,
  orderedStatuses,
  onSelectAll,
  onDeselectAll,
}: GraphStatusFilterProps) => {
  const allActive =
    orderedStatuses.length > 0 && orderedStatuses.every((s) => activeStatuses.has(s.status));

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-2">
      <span className="text-sm text-zinc-500">Filter by status:</span>
      <AllChip allActive={allActive} onSelectAll={onSelectAll} onDeselectAll={onDeselectAll} />
      {orderedStatuses.map(({ status, label }) => (
        <StatusChip
          key={status}
          status={status}
          label={label}
          count={statusCounts[status] ?? 0}
          isActive={activeStatuses.has(status)}
          hexColor={statusHexColors[status] ?? DEFAULT_HEX_COLOR}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
};
