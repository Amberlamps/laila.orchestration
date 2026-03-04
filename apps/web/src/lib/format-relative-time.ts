/**
 * @module format-relative-time
 *
 * Utility for formatting ISO 8601 timestamps as human-readable relative time
 * strings (e.g., "2 minutes ago", "3 hours ago").
 *
 * Uses `Intl.RelativeTimeFormat` for locale-aware formatting. Falls back to an
 * absolute date string for events older than 7 days.
 *
 * @example
 * ```ts
 * formatRelativeTime('2026-03-04T10:00:00Z'); // "2 minutes ago" (if now is 10:02)
 * formatRelativeTime('2026-02-20T10:00:00Z'); // "Feb 20, 2026"
 * ```
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// ---------------------------------------------------------------------------
// Formatter singletons
// ---------------------------------------------------------------------------

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const absoluteFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Formats an ISO 8601 timestamp as a relative time string.
 *
 * Rules:
 * - Less than 60 seconds ago: "just now"
 * - Less than 60 minutes ago: "X minutes ago"
 * - Less than 24 hours ago: "X hours ago"
 * - Less than 7 days ago: "X days ago"
 * - 7 days or older: absolute date (e.g., "Feb 28, 2026")
 *
 * @param timestamp - ISO 8601 datetime string
 * @param now - Optional reference time for testing. Defaults to `Date.now()`.
 * @returns Human-readable time string
 */
export function formatRelativeTime(timestamp: string, now?: number): string {
  const eventTime = new Date(timestamp).getTime();
  const currentTime = now ?? Date.now();
  const diff = currentTime - eventTime;

  // Future timestamps (edge case)
  if (diff < 0) {
    return 'just now';
  }

  if (diff < MINUTE) {
    return 'just now';
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return relativeFormatter.format(-minutes, 'minute');
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return relativeFormatter.format(-hours, 'hour');
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return relativeFormatter.format(-days, 'day');
  }

  return absoluteFormatter.format(new Date(timestamp));
}

/**
 * Formats an ISO 8601 timestamp as a full absolute datetime string.
 *
 * Intended for tooltip display when hovering over relative timestamps.
 *
 * @param timestamp - ISO 8601 datetime string
 * @returns Full date and time string (e.g., "Mar 4, 2026, 10:30:00 AM")
 */
export function formatAbsoluteTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}
