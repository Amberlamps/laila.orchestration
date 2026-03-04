/**
 * Formats audit events as JSON and triggers a browser download.
 *
 * Maps events to a clean export format and serialises with 2-space
 * indentation for readability.
 */

import { downloadFile } from '@/lib/export/download-file';

import type { AuditEntryEvent } from '@/components/audit/audit-entry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Clean export shape for a single audit event. */
interface ExportedAuditEvent {
  timestamp: string;
  actor: { type: string; name: string };
  action: string;
  entity: { type: string; name: string };
  project: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Exports the given audit events as a formatted JSON file.
 *
 * @param events   - The audit events to export.
 * @param filename - Base filename (without date/extension), e.g. "audit-log".
 */
export function exportAsJson(events: AuditEntryEvent[], filename: string): void {
  const exported: ExportedAuditEvent[] = events.map((event) => ({
    timestamp: event.timestamp,
    actor: { type: event.actorType, name: event.actorName },
    action: event.action,
    entity: { type: event.entityType, name: event.entityName },
    project: event.projectName,
    details: buildDetails(event),
  }));

  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, `${filename}-${todayDateString()}.json`);
}
