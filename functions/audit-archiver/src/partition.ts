/**
 * Groups audit events by date for S3 partitioning.
 * Each unique date becomes a separate S3 prefix, enabling
 * efficient prefix-based queries in Athena and S3 Select.
 */

import type { AuditEvent } from './dynamo';

/**
 * Group audit events by their UTC date (year/month/day).
 * Returns a Map where keys are "YYYY/MM/DD" strings
 * and values are arrays of events for that date.
 *
 * Month and day are zero-padded to two digits for consistent
 * S3 key formatting and lexicographic ordering.
 *
 * @param events - Array of audit events to group
 * @returns Map from date strings to event arrays
 */
export function groupByDate(events: AuditEvent[]): Map<string, AuditEvent[]> {
  const groups = new Map<string, AuditEvent[]>();

  for (const event of events) {
    const date = new Date(event.timestamp);
    const key = [
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('/');

    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }

  return groups;
}
