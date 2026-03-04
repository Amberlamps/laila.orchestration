/**
 * LastUpdatedIndicator — displays when data was last refreshed and provides
 * a manual refresh button.
 *
 * Uses TanStack Query's `dataUpdatedAt` timestamp to compute elapsed time,
 * which updates every second via `setInterval`. The manual refresh button
 * invalidates the supplied query key prefix to trigger an immediate refetch.
 *
 * @example
 * ```tsx
 * <LastUpdatedIndicator
 *   dataUpdatedAt={query.dataUpdatedAt}
 *   queryKeyPrefixes={[queryKeys.dashboard.all()]}
 *   isFetching={query.isFetching}
 * />
 * ```
 */
import { useQueryClient } from '@tanstack/react-query';
import { Clock, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Elapsed time formatting
// ---------------------------------------------------------------------------

/** Number of seconds before "just now" transitions to "X seconds ago". */
const JUST_NOW_THRESHOLD_SECONDS = 5;

/** Number of seconds in one minute. */
const SECONDS_PER_MINUTE = 60;

/** Number of seconds in one hour. */
const SECONDS_PER_HOUR = 3600;

/** Interval at which the elapsed counter updates (1 second). */
const TICK_INTERVAL_MS = 1000;

/**
 * Formats an elapsed duration in milliseconds into a human-readable string.
 *
 * - < 5s: "just now"
 * - < 60s: "X seconds ago"
 * - < 3600s: "X minutes ago"
 * - >= 3600s: "X hours ago"
 */
function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);

  if (totalSeconds < JUST_NOW_THRESHOLD_SECONDS) {
    return 'just now';
  }

  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${String(totalSeconds)} seconds ago`;
  }

  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for {@link LastUpdatedIndicator}. */
interface LastUpdatedIndicatorProps {
  /**
   * Timestamp (in milliseconds) of when the data was last successfully fetched.
   * Sourced from TanStack Query's `dataUpdatedAt` on query results.
   */
  dataUpdatedAt: number;

  /**
   * Query key prefixes to invalidate when the user clicks the manual refresh
   * button. Pass one or more broad keys that cover all queries visible on the
   * page (e.g. `[queryKeys.dashboard.all()]` or
   * `[queryKeys.dashboard.all(), queryKeys.projects.lists()]`).
   */
  queryKeyPrefixes: readonly (readonly unknown[])[];

  /**
   * Whether data is currently being fetched (initial load or background
   * refetch). Sourced from TanStack Query's `isFetching` flag. Controls
   * the spin animation on the refresh icon and disables the button.
   */
  isFetching: boolean;
}

/**
 * Displays a "Last updated: X seconds ago" indicator with a manual refresh
 * button. The elapsed time updates every second and resets when new data
 * arrives (i.e. when `dataUpdatedAt` changes).
 */
export function LastUpdatedIndicator({
  dataUpdatedAt,
  queryKeyPrefixes,
  isFetching,
}: LastUpdatedIndicatorProps) {
  const queryClient = useQueryClient();

  // Elapsed time text, recomputed every second
  const [elapsedText, setElapsedText] = useState(() => formatElapsed(Date.now() - dataUpdatedAt));

  // Update elapsed text every second; reset when dataUpdatedAt changes
  useEffect(() => {
    // Immediately recompute on mount or when dataUpdatedAt changes
    setElapsedText(formatElapsed(Date.now() - dataUpdatedAt));

    const intervalId = setInterval(() => {
      setElapsedText(formatElapsed(Date.now() - dataUpdatedAt));
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [dataUpdatedAt]);

  // Manual refresh handler — invalidates all matching query key prefixes
  const handleRefresh = useCallback(() => {
    for (const prefix of queryKeyPrefixes) {
      void queryClient.invalidateQueries({ queryKey: prefix });
    }
  }, [queryClient, queryKeyPrefixes]);

  return (
    <div className="flex items-center gap-2">
      {/* Clock icon + elapsed text */}
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <span className="text-sm text-zinc-500">Last updated: {elapsedText}</span>
      </div>

      {/* Manual refresh button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={isFetching}
        aria-label="Refresh data"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
      </Button>
    </div>
  );
}
