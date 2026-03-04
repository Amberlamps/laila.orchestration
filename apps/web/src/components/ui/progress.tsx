/**
 * Progress — A simple progress bar component.
 *
 * Renders a horizontal bar with a filled portion representing the
 * current value as a percentage of the maximum value (0-100).
 *
 * Visual spec:
 *   Track background: zinc-200
 *   Indicator: indigo-500 (default), customizable via indicatorClassName
 *   Border radius: rounded-full
 *   Transition: width changes animate smoothly
 *
 * Accessibility:
 *   - Uses role="progressbar" with aria-valuenow, aria-valuemin, aria-valuemax
 *   - Accepts an optional aria-label for screen readers
 *
 * @example
 * ```tsx
 * <Progress value={45} className="h-2" />
 * <Progress value={80} className="h-1.5" indicatorClassName="bg-green-500" />
 * ```
 */
import { cn } from '@/lib/utils';

interface ProgressProps {
  /** Current progress value (0-100). Clamped to valid range internally. */
  value: number;
  /** Optional additional CSS classes for the track container. */
  className?: string;
  /** Optional CSS classes for the filled indicator bar. Defaults to "bg-indigo-500". */
  indicatorClassName?: string;
  /** Accessible label describing what this progress bar represents. */
  'aria-label'?: string;
}

function Progress({
  value,
  className,
  indicatorClassName,
  'aria-label': ariaLabel,
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn('w-full overflow-hidden rounded-full bg-zinc-200', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          indicatorClassName ?? 'bg-indigo-500',
        )}
        style={{ width: `${String(clampedValue)}%` }}
      />
    </div>
  );
}

export { Progress };
export type { ProgressProps };
