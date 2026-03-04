/**
 * @module project/tabs/project-activity-tab
 *
 * Activity tab content for the project detail page.
 * Displays project-scoped audit events, newest first.
 *
 * Features:
 * - Heading: "Activity" with Activity icon
 * - Subtitle: "Recent changes and events in this project"
 * - Chronological list of audit events using AuditEntry component
 * - System events styled with distinct bg-zinc-50/50 and left border
 * - "Load More" button with cursor-based infinite pagination (50 per page)
 * - Empty state with Activity icon
 * - Loading state with 10 skeleton rows
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';

import { AuditEntry } from '@/components/audit/audit-entry';
import { AuditExportButton } from '@/components/audit/audit-export-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

import type { AuditEntryEvent } from '@/components/audit/audit-entry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEventsPage {
  events: AuditEntryEvent[];
  lastEvaluatedKey?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of events fetched per page. */
const PAGE_SIZE = 50;

/** Number of skeleton rows displayed during initial load. */
const SKELETON_ROW_COUNT = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectActivityTabProps {
  /** The project ID to scope audit events to. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

/**
 * TanStack Query infinite query for project-scoped audit events.
 *
 * Uses cursor-based pagination via DynamoDB's lastEvaluatedKey.
 * Each page fetches up to 50 events in descending timestamp order.
 */
const useProjectAuditEvents = (projectId: string) => {
  return useInfiniteQuery({
    queryKey: queryKeys.projects.auditEvents(projectId),
    queryFn: async ({ pageParam }): Promise<AuditEventsPage> => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
      });
      if (pageParam) {
        params.set('cursor', pageParam);
      }

      const response = await fetch(
        `/api/v1/projects/${projectId}/audit-events?${params.toString()}`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch audit events: ${String(response.status)}`);
      }

      return (await response.json()) as AuditEventsPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.lastEvaluatedKey ?? undefined,
    enabled: !!projectId,
  });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton showing 10 rows matching the AuditEntry layout. */
function ActivitySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading project activity"
      className="space-y-1"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-zinc-100 py-2.5">
          <Skeleton width="100px" height="14px" rounded="rounded-sm" />
          <Skeleton width="120px" height="14px" rounded="rounded-sm" />
          <Skeleton width="200px" height="14px" rounded="rounded-sm" />
        </div>
      ))}
    </div>
  );
}

/** Empty state when no audit events exist for the project. */
function ActivityEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Activity className="mb-3 size-12 text-zinc-300" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-600">No activity recorded for this project</p>
      <p className="mt-1 text-sm text-zinc-400">
        Activity will appear here once changes are made to this project.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ProjectActivityTab renders the activity feed for a single project.
 *
 * Shows a paginated list of audit events with:
 * - Tab heading with Activity icon
 * - Event list using AuditEntry with showProject=false
 * - System events with distinct background and left border
 * - "Load More" button for cursor-based pagination
 * - Loading and empty states
 */
export function ProjectActivityTab({ projectId }: ProjectActivityTabProps) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useProjectAuditEvents(projectId);

  const allEvents = data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <div className="space-y-4 py-6">
      {/* Tab heading */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-zinc-600" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-zinc-900">Activity</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Recent changes and events in this project</p>
        </div>
        <AuditExportButton events={allEvents} filename="project-activity" />
      </div>

      {/* Loading state */}
      {isLoading && <ActivitySkeleton />}

      {/* Empty state */}
      {!isLoading && allEvents.length === 0 && <ActivityEmptyState />}

      {/* Event list */}
      {!isLoading && allEvents.length > 0 && (
        <div>
          {allEvents.map((event) => (
            <div
              key={event.eventId}
              className={cn(
                'border-b border-zinc-100',
                event.actorType === 'system' && 'border-l-2 border-l-zinc-200 bg-zinc-50/50',
              )}
            >
              <AuditEntry event={event} showProject={false} />
            </div>
          ))}

          {/* Load More button */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
                loading={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
