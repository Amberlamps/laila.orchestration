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

/**
 * Formats a timestamp into a human-readable elapsed duration string.
 *
 * @param timestamp - ISO 8601 date string or Date object representing the start time.
 * @returns A human-readable string such as "3 minutes ago" or "about 2 hours ago".
 *
 * @example
 * ```ts
 * formatElapsedTime("2026-03-04T10:00:00Z"); // "5 minutes ago"
 * formatElapsedTime(new Date(Date.now() - 3600000)); // "about 1 hour ago"
 * ```
 */
export function formatElapsedTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return formatDistanceToNow(date, { addSuffix: true });
}
