/**
 * Shared utility for formatting elapsed time since a given timestamp.
 *
 * Used by the Active Workers card (project overview) and the global dashboard
 * active workers table to display how long a worker has been assigned.
 *
 * Uses `date-fns/formatDistanceToNow` under the hood for human-readable
 * durations (e.g., "3 minutes", "about 2 hours").
 */
import { differenceInMinutes, formatDistanceToNow } from 'date-fns';

/** Risk level based on elapsed time relative to timeout. */
export type TimeoutRisk = 'normal' | 'warning' | 'critical';

/**
 * Formats a timestamp into a human-readable elapsed duration string.
 */
export function formatElapsedTime(timestamp: string | Date): string;
/**
 * Formats a timestamp with timeout-risk information.
 */
export function formatElapsedTime(
  timestamp: string | Date,
  timeoutMinutes: number,
): { formatted: string; risk: TimeoutRisk };
export function formatElapsedTime(
  timestamp: string | Date,
  timeoutMinutes?: number,
): string | { formatted: string; risk: TimeoutRisk } {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const formatted = formatDistanceToNow(date, { addSuffix: true });

  if (timeoutMinutes === undefined) {
    return formatted;
  }

  const elapsed = differenceInMinutes(new Date(), date);
  const ratio = elapsed / timeoutMinutes;

  let risk: TimeoutRisk = 'normal';
  if (ratio >= 0.9) {
    risk = 'critical';
  } else if (ratio >= 0.7) {
    risk = 'warning';
  }

  return { formatted, risk };
}
