/**
 * GraphViewLevelToggle — segmented control for switching between
 * Task, Story, and Epic graph views.
 *
 * Each segment displays a Lucide icon and label. The active segment
 * has an indigo tint; inactive segments are white with a hover highlight.
 */
import { BookOpen, Layers, ListChecks } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { GraphViewLevel } from '@/lib/graph/derive-view-levels';
import type { LucideProps } from 'lucide-react';

// ---------------------------------------------------------------------------
// Segment definitions
// ---------------------------------------------------------------------------

/** Configuration for a single toggle segment. */
interface SegmentConfig {
  /** The view level value this segment represents. */
  value: GraphViewLevel;
  /** Display label shown next to the icon. */
  label: string;
  /** Lucide icon component for the segment. */
  Icon: React.ComponentType<LucideProps>;
}

/** Ordered list of toggle segments. */
const SEGMENTS: readonly SegmentConfig[] = [
  { value: 'tasks', label: 'Tasks', Icon: ListChecks },
  { value: 'stories', label: 'Stories', Icon: BookOpen },
  { value: 'epics', label: 'Epics', Icon: Layers },
] as const;

/** Icon size in pixels. */
const ICON_SIZE = 14;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the GraphViewLevelToggle component. */
interface GraphViewLevelToggleProps {
  /** The currently active view level. */
  viewLevel: GraphViewLevel;
  /** Callback fired when the user selects a different view level. */
  onViewLevelChange: (level: GraphViewLevel) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a segmented toggle control with three options:
 * Tasks (ListChecks), Stories (BookOpen), and Epics (Layers).
 *
 * - Active segment: bg-indigo-50, text-indigo-700, font-medium
 * - Inactive segment: bg-white, text-zinc-600, hover:bg-zinc-50
 */
export const GraphViewLevelToggle = ({
  viewLevel,
  onViewLevelChange,
}: GraphViewLevelToggleProps) => {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-zinc-200"
      role="group"
      aria-label="Graph view level"
    >
      {SEGMENTS.map((segment) => {
        const isActive = viewLevel === segment.value;

        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
              // Divider between segments (not on first)
              'border-r border-zinc-200 last:border-r-0',
              isActive
                ? 'bg-indigo-50 font-medium text-indigo-700'
                : 'bg-white text-zinc-600 hover:bg-zinc-50',
            )}
            onClick={() => {
              onViewLevelChange(segment.value);
            }}
          >
            <segment.Icon size={ICON_SIZE} aria-hidden="true" />
            {segment.label}
          </button>
        );
      })}
    </div>
  );
};
