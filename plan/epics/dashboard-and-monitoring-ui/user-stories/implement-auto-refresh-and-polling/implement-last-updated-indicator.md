# Implement Last-Updated Indicator

## Task Details

- **Title:** Implement Last-Updated Indicator
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Auto-Refresh & Polling](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** Configure Polling for Dashboard Views

## Description

Implement a "Last updated: X seconds ago" indicator in dashboard and project detail page headers. Includes a manual refresh button that triggers an immediate re-fetch of all visible queries. The indicator updates on each successful polling cycle to show how recently data was refreshed.

### Last-Updated Indicator Component

```typescript
// apps/web/src/components/ui/last-updated-indicator.tsx
// Displays when data was last refreshed and provides a manual refresh button.
// Uses TanStack Query's dataUpdatedAt from query results.

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LastUpdatedIndicator renders:
 *
 * - Clock icon (text-zinc-400, 14px)
 * - "Last updated: X seconds ago" text (text-sm, text-zinc-500)
 *   - Updates every second via setInterval to keep the elapsed time current
 *   - Resets to "just now" on each successful data refresh
 *   - Shows "X minutes ago" when > 60 seconds
 * - Manual refresh button:
 *   - Ghost variant, small size
 *   - RefreshCw icon (14px)
 *   - Spins (animate-spin) while refetching
 *   - onClick: invalidates relevant query keys to trigger immediate refetch
 *   - Disabled while already refetching (isFetching state)
 *
 * Props:
 * - dataUpdatedAt: number (timestamp in ms from TanStack Query)
 * - queryKeyPrefix: readonly string[] (keys to invalidate on manual refresh)
 * - isFetching: boolean (from TanStack Query, used for spin animation)
 */
```

### Integration Pattern

```typescript
// apps/web/src/pages/dashboard.tsx
// Example integration of LastUpdatedIndicator in the dashboard page header.

/**
 * The indicator sits in the page header, right-aligned:
 *
 * <PageHeader title="Dashboard">
 *   <LastUpdatedIndicator
 *     dataUpdatedAt={summaryQuery.dataUpdatedAt}
 *     queryKeyPrefix={dashboardKeys.all}
 *     isFetching={summaryQuery.isFetching}
 *   />
 * </PageHeader>
 *
 * For the project detail page:
 * <PageHeader title={project.name}>
 *   <LastUpdatedIndicator
 *     dataUpdatedAt={overviewQuery.dataUpdatedAt}
 *     queryKeyPrefix={projectKeys.detail(projectId)}
 *     isFetching={overviewQuery.isFetching}
 *   />
 * </PageHeader>
 */
```

### Elapsed Time Counter

```typescript
// The elapsed time counter uses a useEffect with setInterval
// to update the displayed text every second.

/**
 * Implementation:
 * 1. Store dataUpdatedAt in state
 * 2. setInterval every 1000ms to compute elapsed = Date.now() - dataUpdatedAt
 * 3. Format elapsed:
 *    - < 5s: "just now"
 *    - < 60s: "X seconds ago"
 *    - < 3600s: "X minutes ago"
 *    - >= 3600s: "X hours ago"
 * 4. Clear interval on unmount
 * 5. Reset when dataUpdatedAt changes (new data arrived)
 */
```

## Acceptance Criteria

- [ ] Dashboard page header displays a "Last updated: X seconds ago" indicator
- [ ] Project detail page header displays the same indicator
- [ ] Indicator shows "just now" for the first 5 seconds after a refresh
- [ ] Indicator updates every second to show elapsed time since last refresh
- [ ] Elapsed time format transitions: "X seconds ago" -> "X minutes ago" -> "X hours ago"
- [ ] Manual refresh button is displayed next to the indicator with RefreshCw icon
- [ ] Manual refresh button uses ghost variant and small size styling
- [ ] Clicking the manual refresh button invalidates the relevant query keys and triggers immediate refetch
- [ ] RefreshCw icon spins (animate-spin) while data is being fetched
- [ ] Manual refresh button is disabled while a fetch is in progress
- [ ] Indicator resets to "just now" when new data arrives from polling or manual refresh
- [ ] Clock icon is displayed before the text in text-zinc-400
- [ ] Component cleans up the setInterval on unmount to prevent memory leaks
- [ ] No `any` types are used in the implementation

## Technical Notes

- TanStack Query v5 provides `dataUpdatedAt` on query results, which is a timestamp (in milliseconds) of when the data was last successfully fetched. This is the source of truth for the indicator.
- The `useQueryClient().invalidateQueries()` method accepts a query key prefix and invalidates all matching queries. Using `dashboardKeys.all` invalidates all dashboard queries; using `projectKeys.detail(id)` invalidates all queries for a specific project.
- The `isFetching` flag from TanStack Query is `true` during both initial loads and background refetches, making it suitable for the spin animation.
- The 1-second interval for the elapsed counter is acceptable because it only updates a single text node, not complex UI. It should be cleared on unmount via the useEffect cleanup function.

## References

- **TanStack Query v5:** `dataUpdatedAt`, `isFetching`, `useQueryClient().invalidateQueries()`
- **Design System:** Button (ghost variant) from shadcn/ui
- **Icons:** Lucide React — RefreshCw, Clock
- **Layout:** PageHeader component from Epic 8

## Estimated Complexity

Low-Medium — Straightforward component with a setInterval timer and TanStack Query integration. The main complexity is ensuring proper cleanup and synchronized state.
