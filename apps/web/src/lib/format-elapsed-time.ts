/**
 * Shared utility for formatting elapsed time since a given timestamp.
 *
 * Used by the Active Workers card (project overview) and the global dashboard
 * active workers table to display how long a worker has been assigned.
 *
 * Uses `date-fns/formatDistanceToNow` under the hood for human-readable
 * durations (e.g., "3 minutes", "about 2 hours").
 */
import { formatDistanceToNow } from 'date-fns';

/** Timeout risk level used for styling elapsed time indicators. */
export type TimeoutRisk = 'normal' | 'warning' | 'critical';

/** Threshold (as a fraction of timeoutMinutes) at which risk becomes "warning". */
const WARNING_THRESHOLD = 0.75;

/**
 * Formats a timestamp into a human-readable elapsed duration string and
 * computes the timeout risk level.
 *
 * @param timestamp - ISO 8601 date string representing the start time.
 * @param timeoutMinutes - The timeout threshold in minutes used to compute risk.
 * @returns An object with `formatted` (human-readable string) and `risk` level.
 *
 * @example
 * ```ts
 * formatElapsedTime("2026-03-04T10:00:00Z", 30);
 * // { formatted: "5 minutes ago", risk: "normal" }
 * ```
 */
export function formatElapsedTime(
  timestamp: string | Date,
  timeoutMinutes: number,
): { formatted: string; risk: TimeoutRisk } {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const formatted = formatDistanceToNow(date, { addSuffix: true });

  const elapsedMs = Date.now() - date.getTime();
  const elapsedMinutes = elapsedMs / 60_000;
  const ratio = elapsedMinutes / timeoutMinutes;

  let risk: TimeoutRisk = 'normal';
  if (ratio >= 1) {
    risk = 'critical';
  } else if (ratio >= WARNING_THRESHOLD) {
    risk = 'warning';
  }

  return { formatted, risk };
}
