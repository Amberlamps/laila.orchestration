/**
 * Export button with format selection dropdown for audit data.
 *
 * Renders a ghost-styled button with a dropdown menu offering two
 * export formats: JSON and CSV. Disabled when no events are loaded.
 */

import { ChevronDown, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportAsCsv } from '@/lib/export/export-csv';
import { exportAsJson } from '@/lib/export/export-json';

import type { AuditEntryEvent } from '@/components/audit/audit-entry';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AuditExportButtonProps {
  /** The currently loaded audit events to export. */
  events: AuditEntryEvent[];
  /** Base filename for the download (e.g. "audit-log" or "project-activity"). */
  filename: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AuditExportButton renders a ghost button that opens a dropdown with two
 * export options: JSON and CSV. The button is disabled when no events are
 * loaded.
 */
export function AuditExportButton({ events, filename }: AuditExportButtonProps) {
  const disabled = events.length === 0;

  const handleExportJson = useCallback(() => {
    exportAsJson(events, filename);
  }, [events, filename]);

  const handleExportCsv = useCallback(() => {
    exportAsCsv(events, filename);
  }, [events, filename]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <Download className="size-4" aria-hidden="true" />
          Export
          <ChevronDown className="size-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleExportJson}>
          <FileJson className="size-4" aria-hidden="true" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportCsv}>
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
