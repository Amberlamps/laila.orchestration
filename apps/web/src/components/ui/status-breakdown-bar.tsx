/**
 * A thin stacked horizontal bar showing status distribution.
 *
 * Each segment is proportionally sized and color-coded.
 * Renders a flex container with colored segments whose widths reflect
 * their proportion of the total. Each segment shows a tooltip on hover
 * with the count and status name.
 *
 * @example
 * ```tsx
 * <StatusBreakdownBar
 *   segments={[
 *     { status: "completed", count: 5, color: "bg-emerald-500" },
 *     { status: "in_progress", count: 3, color: "bg-blue-500" },
 *     { status: "not_started", count: 7, color: "bg-zinc-300" },
 *   ]}
 *   total={15}
 * />
 * ```
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusSegment {
  /** Status key used as React key and displayed in the tooltip */
  status: string;
  /** Count for this segment */
  count: number;
  /** Tailwind bg color class (e.g., "bg-emerald-500") */
  color: string;
}

export interface StatusBreakdownBarProps {
  /** Array of segments describing each status slice */
  segments: StatusSegment[];
  /** Total count used as the denominator for percentage calculations */
  total: number;
  /** Bar height variant. "sm" = h-1.5, "md" = h-2.5. Defaults to "sm". */
  height?: 'sm' | 'md';
  /** Additional class names for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEIGHT_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
};

/** Minimum width in pixels so tiny segments remain visible */
const MIN_SEGMENT_PX = 2;

/**
 * Formats a status key into a human-readable label.
 * Replaces underscores with spaces and capitalizes each word.
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
  // Filter out zero-count segments so they don't render empty divs
  const visibleSegments = segments.filter((seg) => seg.count > 0);

  if (total === 0 || visibleSegments.length === 0) {
    return (
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-zinc-100',
          HEIGHT_CLASSES[height],
          className,
        )}
        role="img"
        aria-label="No data"
      />
    );
  }

  // Build aria-label from all visible segments
  const ariaLabel = visibleSegments
    .map((seg) => `${formatStatusLabel(seg.status)}: ${String(seg.count)}`)
    .join(', ');

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-zinc-100',
          HEIGHT_CLASSES[height],
          className,
        )}
        role="img"
        aria-label={`Status breakdown: ${ariaLabel}`}
      >
        {visibleSegments.map((segment) => {
          const percentage = (segment.count / total) * 100;

          return (
            <Tooltip key={segment.status}>
              <TooltipTrigger asChild>
                <div
                  className={cn('transition-all', segment.color)}
                  style={{
                    width: `${String(percentage)}%`,
                    minWidth: `${String(MIN_SEGMENT_PX)}px`,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
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
