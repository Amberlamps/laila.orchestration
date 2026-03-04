# Implement Audit Export Functionality

## Task Details

- **Title:** Implement Audit Export Functionality
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Audit Log UI](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** Implement Cross-Project Audit Log Page, Implement Project Activity Tab

## Description

Implement export functionality for audit data, allowing users to download the currently loaded audit events in JSON or CSV format. The export button appears on both the cross-project audit log page and the project activity tab. Uses a ghost-styled button with a format selection dropdown.

### Export Button Component

```typescript
// apps/web/src/components/audit/audit-export-button.tsx
// Export button with format selection dropdown for audit data.
// Supports JSON and CSV export formats.

import { useState, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download, FileJson, FileSpreadsheet, ChevronDown } from 'lucide-react';
import type { AuditEvent } from '@laila/shared';

/**
 * AuditExportButton renders:
 *
 * - Trigger: ghost Button with Download icon and "Export" label
 *   - Small size variant
 *   - ChevronDown icon for dropdown indication
 *
 * - Dropdown menu with two options:
 *   1. "Export as JSON" with FileJson icon
 *      - Downloads a .json file with formatted audit data
 *   2. "Export as CSV" with FileSpreadsheet icon
 *      - Downloads a .csv file with tabular audit data
 *
 * - Disabled state when no events are loaded (events.length === 0)
 *
 * Props:
 * - events: AuditEvent[] (currently loaded/visible events)
 * - filename: string (base filename, e.g., "audit-log" or "project-activity")
 */
```

### JSON Export

```typescript
// apps/web/src/lib/export/export-json.ts
// Formats audit events as JSON and triggers browser download.

/**
 * exportAsJson(events: AuditEvent[], filename: string): void
 *
 * 1. Map events to a clean export format:
 *    {
 *      timestamp: string (ISO 8601),
 *      actor: { type: string, name: string },
 *      action: string,
 *      entity: { type: string, name: string },
 *      project: string (project name or ID),
 *      details: string,
 *    }
 *
 * 2. Serialize as JSON with 2-space indentation for readability
 *
 * 3. Create a Blob with type "application/json"
 *
 * 4. Generate a download URL using URL.createObjectURL()
 *
 * 5. Create a temporary <a> element, set href and download attribute,
 *    trigger click, then revoke the object URL
 *
 * Filename format: "{filename}-{date}.json"
 * Example: "audit-log-2026-03-02.json"
 */
```

### CSV Export

```typescript
// apps/web/src/lib/export/export-csv.ts
// Formats audit events as CSV and triggers browser download.

/**
 * exportAsCsv(events: AuditEvent[], filename: string): void
 *
 * 1. Define CSV headers:
 *    "Timestamp", "Actor Type", "Actor Name", "Action",
 *    "Entity Type", "Entity Name", "Project", "Details"
 *
 * 2. Map each event to a CSV row:
 *    - Escape fields containing commas, quotes, or newlines
 *    - Wrap fields in double quotes
 *    - Join fields with commas
 *    - Join rows with newlines (CRLF for Windows compatibility)
 *
 * 3. Prepend BOM (byte order mark) for Excel compatibility:
 *    "\uFEFF" prefix for proper UTF-8 detection
 *
 * 4. Create a Blob with type "text/csv;charset=utf-8"
 *
 * 5. Trigger download using the same temporary <a> element pattern
 *
 * Filename format: "{filename}-{date}.csv"
 * Example: "project-activity-2026-03-02.csv"
 *
 * CSV escaping rules:
 * - If a field contains a comma, newline, or double quote,
 *   wrap it in double quotes
 * - Escape double quotes within fields by doubling them: " -> ""
 */
```

### Download Utility

```typescript
// apps/web/src/lib/export/download-file.ts
// Generic utility for triggering a file download in the browser.

/**
 * downloadFile(blob: Blob, filename: string): void
 *
 * 1. Create object URL: URL.createObjectURL(blob)
 * 2. Create temporary <a> element
 * 3. Set href to object URL
 * 4. Set download attribute to filename
 * 5. Append to document.body
 * 6. Trigger click
 * 7. Remove from document.body
 * 8. Revoke object URL: URL.revokeObjectURL(url)
 *
 * This pattern works across all modern browsers and does not
 * require a server-side endpoint for file generation.
 */
```

## Acceptance Criteria

- [ ] Export button is displayed on the cross-project audit log page header
- [ ] Export button is displayed on the project activity tab
- [ ] Export button uses ghost variant with Download icon and "Export" label
- [ ] Clicking the export button opens a dropdown with "Export as JSON" and "Export as CSV" options
- [ ] "Export as JSON" downloads a .json file with formatted audit event data
- [ ] "Export as CSV" downloads a .csv file with tabular audit event data
- [ ] JSON export uses 2-space indentation for readability
- [ ] CSV export includes a header row with column names
- [ ] CSV export properly escapes fields containing commas, quotes, and newlines
- [ ] CSV export includes a BOM prefix for Excel UTF-8 compatibility
- [ ] Downloaded filenames include the current date (e.g., "audit-log-2026-03-02.json")
- [ ] Export downloads the currently loaded/visible events (all pages loaded so far)
- [ ] Export button is disabled when no events are loaded
- [ ] File download uses the Blob + createObjectURL pattern (client-side, no server round-trip)
- [ ] Object URLs are revoked after download to prevent memory leaks
- [ ] JSON icon (FileJson) and CSV icon (FileSpreadsheet) are displayed in dropdown items
- [ ] No `any` types are used in the implementation

## Technical Notes

- The export operates on the client side using data already loaded by TanStack Query. No additional API calls are needed. The `events` prop should be the flattened array from all loaded infinite query pages.
- CSV escaping is critical for data integrity. The RFC 4180 standard defines CSV formatting rules: fields with special characters must be quoted, and quotes within fields must be doubled.
- The BOM (Byte Order Mark, `\uFEFF`) prefix is necessary for Excel to correctly detect UTF-8 encoding. Without it, Excel may misinterpret non-ASCII characters.
- The `downloadFile` utility creates and clicks a temporary `<a>` element because `window.open()` with blob URLs may be blocked by popup blockers. The `<a>` element approach is more reliable.
- The Blob object URL should be revoked with `URL.revokeObjectURL()` after the download starts to free memory.

## References

- **Design System:** DropdownMenu, Button (ghost variant) from shadcn/ui
- **Icons:** Lucide React — Download, FileJson, FileSpreadsheet, ChevronDown
- **Web APIs:** Blob, URL.createObjectURL(), URL.revokeObjectURL()
- **CSV Standard:** RFC 4180 for CSV formatting rules
- **Type Definitions:** `AuditEvent` from `@laila/shared`

## Estimated Complexity

Medium — Client-side file generation with proper CSV escaping and JSON formatting. The download mechanism is straightforward but requires attention to browser compatibility and memory management (revoking object URLs).
