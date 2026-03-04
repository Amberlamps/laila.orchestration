/**
 * A thin stacked horizontal bar showing status distribution.
 *
 * Each segment is proportionally sized and color-coded, with a minimum
 * width of 2px to ensure visibility for small counts. Hovering a segment
 * displays a tooltip with the count and status name.
 *
 * @example
 * ```tsx
 * <StatusBreakdownBar
 *   segments={[
 *     { status: 'completed', count: 5, color: 'bg-green-500' },
 *     { status: 'in_progress', count: 3, color: 'bg-blue-500' },
 *     { status: 'not_started', count: 2, color: 'bg-zinc-300' },
 *   ]}
 *   total={10}
 * />
 * ```
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BarSegment {
  /** Human-readable status name used in the tooltip */
  status: string;
  /** Count for this segment */
  count: number;
  /** Tailwind bg color class (e.g., "bg-green-500") */
  color: string;
}

export interface StatusBreakdownBarProps {
  /** Ordered array of segments to render left-to-right */
  segments: BarSegment[];
  /** Total count used to calculate proportional widths */
  total: number;
  /** Height variant: "sm" = h-1.5 (default), "md" = h-2.5 */
  height?: 'sm' | 'md';
  /** Additional CSS classes on the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum segment width in pixels to ensure visibility */
const MIN_SEGMENT_PX = 2;

const HEIGHT_CLASS: Record<'sm' | 'md', string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a status string for display in the tooltip.
 * Converts snake_case to Title Case (e.g. "in_progress" -> "In Progress").
 */
function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBreakdownBar({
  segments,
  total,
  height = 'sm',
  className,
}: StatusBreakdownBarProps) {
  // Filter out zero-count segments
  const visibleSegments = segments.filter((seg) => seg.count > 0);

  if (total === 0 || visibleSegments.length === 0) {
    return (
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-zinc-100',
          HEIGHT_CLASS[height],
          className,
        )}
        role="img"
        aria-label="No data"
      />
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-zinc-100',
          HEIGHT_CLASS[height],
          className,
        )}
        role="img"
        aria-label={`Status breakdown: ${visibleSegments
          .map((seg) => `${String(seg.count)} ${formatStatusLabel(seg.status)}`)
          .join(', ')}`}
      >
        {visibleSegments.map((segment) => {
          const pct = (segment.count / total) * 100;

          return (
            <Tooltip key={segment.status}>
              <TooltipTrigger asChild>
                <div
                  className={cn(segment.color, 'transition-all')}
                  style={{
                    width: `${String(pct)}%`,
                    minWidth: `${String(MIN_SEGMENT_PX)}px`,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {String(segment.count)} {formatStatusLabel(segment.status)}
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
