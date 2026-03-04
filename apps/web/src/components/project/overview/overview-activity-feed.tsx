/**
 * OverviewActivityFeed -- "Recent Activity" card for the project overview tab.
 *
 * Displays the last 50 audit events scoped to a specific project, sorted
 * newest first. Each entry shows:
 *
 * - Timestamp: relative time with absolute on hover (via Tooltip)
 * - Actor: worker name (Bot icon), user name (User icon), or "System" (italic, text-zinc-500)
 * - Action: human-readable description (e.g. "updated status to in_progress")
 * - Target entity: entity type + name, linked to detail page
 *
 * A "View all activity" link at the bottom navigates to the project's Activity
 * tab at `/projects/:id?tab=activity`.
 *
 * Card content is capped at max-h-[480px] with overflow-y-auto to prevent
 * the feed from pushing other content down.
 */
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import Link from 'next/link';

import { AuditEntryRow } from '@/components/audit/audit-entry-row';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type { AuditEvent } from '@/components/audit/audit-entry-row';

// ---------------------------------------------------------------------------
// Local query hook
// ---------------------------------------------------------------------------

/**
 * Response shape returned by the project-scoped audit events API.
 * Defined locally since this endpoint is not yet in the OpenAPI spec.
 */
interface AuditEventsResponse {
  data: AuditEvent[];
}

/**
 * Query key factory for project-scoped audit events.
 * Scoped under the project key to allow prefix-based invalidation when
 * the project changes.
 */
const projectActivityKeys = {
  all: (projectId: string) => ['projects', projectId, 'activity'] as const,
};

/**
 * Fetches the most recent audit events for a specific project.
 *
 * NOTE: This endpoint is not in the OpenAPI spec yet, so we use a manual fetch
 * through the same base URL that apiClient uses. Disabled when projectId is falsy.
 */
const useProjectActivity = (projectId: string) =>
  useQuery({
    queryKey: projectActivityKeys.all(projectId),
    queryFn: async (): Promise<AuditEvent[]> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(
        `${baseUrl}/v1/projects/${projectId}/audit-events?limit=50&sort_order=desc`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch project activity (${String(response.status)})`);
      }

      const result = (await response.json()) as AuditEventsResponse;
      return result.data;
    },
    enabled: !!projectId,
  });

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

const SKELETON_ROW_COUNT = 6;

function ActivityLoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading activity feed">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-zinc-100 px-1 py-2.5 last:border-b-0"
        >
          <Skeleton width="96px" height="14px" rounded="rounded-sm" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Skeleton width="80px" height="14px" rounded="rounded-sm" />
              <Skeleton width="140px" height="14px" rounded="rounded-sm" />
            </div>
            <Skeleton width="120px" height="14px" rounded="rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function ActivityEmptyState() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
      No activity recorded yet
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface OverviewActivityFeedProps {
  /** The project ID whose activity to display. */
  projectId: string;
}

export function OverviewActivityFeed({ projectId }: OverviewActivityFeedProps) {
  const { data: events, isLoading } = useProjectActivity(projectId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        <Activity className="h-5 w-5 text-zinc-500" />
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading && <ActivityLoadingSkeleton />}

          {!isLoading && (!events || events.length === 0) && <ActivityEmptyState />}

          {!isLoading &&
            events &&
            events.length > 0 &&
            events.map((event) => (
              <AuditEntryRow key={event.id} event={event} projectId={projectId} />
            ))}
        </div>

        {/* "View all activity" link */}
        <div className="mt-4 border-t border-zinc-100 pt-3 text-center">
          <Link
            href={`/projects/${projectId}?tab=activity`}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            View all activity
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
