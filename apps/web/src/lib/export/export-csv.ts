/**
 * Formats audit events as CSV and triggers a browser download.
 *
 * Follows RFC 4180 for CSV escaping:
 * - Fields containing commas, double quotes, or newlines are wrapped in
 *   double quotes.
 * - Double quotes inside a field are escaped by doubling them.
 *
 * Includes a UTF-8 BOM (\uFEFF) for Excel compatibility and uses
 * CRLF line endings for Windows compatibility.
 */

import { downloadFile } from '@/lib/export/download-file';

import type { AuditEntryEvent } from '@/components/audit/audit-entry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CSV column headers. */
const HEADERS = [
  'Timestamp',
  'Actor Type',
  'Actor Name',
  'Action',
  'Entity Type',
  'Entity Name',
  'Project',
  'Details',
] as const;

/** UTF-8 BOM for Excel compatibility. */
const BOM = '\uFEFF';

/** CRLF line ending for Windows compatibility. */
const CRLF = '\r\n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a CSV field according to RFC 4180.
 *
 * If the field contains a comma, double quote, or newline character, the
 * entire field is wrapped in double quotes. Any existing double quotes
 * within the field are doubled.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a human-readable details string from an event's changes and metadata.
 */
function buildDetails(event: AuditEntryEvent): string {
  const parts: string[] = [];

  if (event.changes) {
    for (const [field, change] of Object.entries(event.changes)) {
      parts.push(`${field}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`);
    }
  }

  if (event.metadata) {
    for (const [key, value] of Object.entries(event.metadata)) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.join('; ');
}

/**
 * Returns today's date as an ISO-formatted date string (YYYY-MM-DD).
 */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports the given audit events as a CSV file.
 *
 * @param events   - The audit events to export.
 * @param filename - Base filename (without date/extension), e.g. "audit-log".
 */
export function exportAsCsv(events: AuditEntryEvent[], filename: string): void {
  const headerRow = HEADERS.map(escapeCsvField).join(',');

  const dataRows = events.map((event) => {
    const fields = [
      event.timestamp,
      event.actorType,
      event.actorName,
      event.action,
      event.entityType,
      event.entityName,
      event.projectName,
      buildDetails(event),
    ];
    return fields.map(escapeCsvField).join(',');
  });

  const csv = BOM + [headerRow, ...dataRows].join(CRLF) + CRLF;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadFile(blob, `${filename}-${todayDateString()}.csv`);
}
