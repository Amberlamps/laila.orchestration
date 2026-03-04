/**
 * Overview Activity Feed -- project overview tab section component.
 *
 * Displays the last 50 audit events scoped to a specific project, newest first.
 * Each entry shows the timestamp, actor, action, and target entity with links
 * to the relevant detail pages.
 *
 * States:
 * - Loading: Skeleton row placeholders
 * - Empty: "No activity recorded yet" message
 * - Data: Chronological list of audit entries with a "View all activity" footer link
 */

import { Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AuditEntry } from '@/components/audit/audit-entry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectActivity } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Number of skeleton rows to display while loading. */
const SKELETON_ROW_COUNT = 6;

function ActivitySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading project activity"
      className="space-y-3"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <Skeleton width="72px" height="14px" rounded="rounded-sm" />
          <Skeleton width="80px" height="14px" rounded="rounded-sm" />
          <Skeleton width="60px" height="14px" rounded="rounded-sm" />
          <Skeleton width="120px" height="14px" rounded="rounded-sm" />
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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Activity className="mb-3 size-8 text-zinc-300" aria-hidden="true" />
      <p className="text-sm text-zinc-500">No activity recorded yet</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface OverviewActivityFeedProps {
  /** The project ID to scope audit events to. */
  projectId: string;
}

/**
 * OverviewActivityFeed renders a "Recent Activity" card on the project
 * overview tab with the last 50 audit events scoped to this project.
 *
 * Features:
 * - Card with header: "Recent Activity" with Activity icon
 * - Chronological list (newest first) of the last 50 audit events
 * - Each entry: relative timestamp (absolute on hover), actor (Bot/User/System
 *   icon), action description, target entity link
 * - "View all activity" link at the bottom navigating to the project Activity tab
 * - Max height: max-h-[480px] overflow-y-auto to prevent feed from pushing
 *   other content down
 * - Loading skeleton placeholders
 * - Empty state when no events exist
 */
export function OverviewActivityFeed({ projectId }: OverviewActivityFeedProps) {
  const { data, isLoading } = useProjectActivity(projectId);

  const events = data?.data ?? [];

  return (
    <Card data-testid="overview-activity-feed">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        <Activity className="size-5 text-zinc-600" aria-hidden="true" />
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Scrollable content area */}
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading && <ActivitySkeleton />}

          {!isLoading && events.length === 0 && <ActivityEmptyState />}

          {!isLoading && events.length > 0 && (
            <div className="divide-y divide-zinc-100">
              {events.map((event) => (
                <AuditEntry key={event.eventId} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* Footer link */}
        {!isLoading && events.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-3">
            <Link
              href={`/projects/${projectId}?tab=activity`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              View all activity
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
