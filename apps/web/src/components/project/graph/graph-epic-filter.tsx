/**
 * GraphEpicFilter — multi-select dropdown for filtering graph nodes by parent epic.
 *
 * Renders a Popover with a list of epics, each with a checkbox, name, and
 * node count badge. Supports "Select All" and "Clear All" bulk actions.
 *
 * @module graph-epic-filter
 */
import { ChevronDown, Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { EpicOption } from '@/hooks/use-graph-epic-filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters to display for an epic name before truncating. */
const MAX_EPIC_NAME_LENGTH = 35;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphEpicFilterProps {
  /** List of available epics with node counts. */
  epics: EpicOption[];
  /** Set of currently selected epic IDs. */
  selectedEpicIds: Set<string>;
  /** Toggle a single epic on or off. */
  onToggle: (epicId: string) => void;
  /** Select all epics. */
  onSelectAll: () => void;
  /** Clear all epic selections. */
  onClearAll: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a name to a maximum length, appending an ellipsis if truncated.
 */
const truncateName = (name: string, maxLength: number): string => {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength) + '...';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Multi-select epic filter dropdown for the dependency graph toolbar.
 *
 * - Trigger: outline button with Layers icon, label, and chevron.
 * - Content: heading, bulk action links, scrollable epic list.
 * - Each epic row: checkbox, name (truncated), node count badge.
 */
export const GraphEpicFilter = ({
  epics,
  selectedEpicIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: GraphEpicFilterProps) => {
  const totalEpics = epics.length;
  const selectedCount = selectedEpicIds.size;
  const isFiltered = selectedCount < totalEpics;

  // Build the trigger label
  const triggerLabel = isFiltered
    ? `${String(selectedCount)} of ${String(totalEpics)} epics`
    : 'Epics';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-1.5',
            isFiltered && 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <span className="text-sm font-medium text-zinc-900">Select Epics</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-indigo-600 hover:text-indigo-700"
              onClick={onSelectAll}
            >
              Select All
            </button>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:text-indigo-700"
              onClick={onClearAll}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Epic list — scrollable */}
        <div className="max-h-[240px] overflow-y-auto">
          {epics.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-400">No epics available</div>
          ) : (
            <div className="py-1">
              {epics.map((epic) => {
                const isSelected = selectedEpicIds.has(epic.id);
                const displayName = truncateName(epic.name, MAX_EPIC_NAME_LENGTH);
                const needsTooltip = epic.name.length > MAX_EPIC_NAME_LENGTH;

                return (
                  <label
                    key={epic.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50"
                    title={needsTooltip ? epic.name : undefined}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => {
                        onToggle(epic.id);
                      }}
                    />
                    <span className="flex-1 truncate text-sm text-zinc-700">{displayName}</span>
                    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
                      {String(epic.nodeCount)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
