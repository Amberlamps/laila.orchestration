'use client';

/**
 * ActiveWorkersCard — displays workers currently assigned to in-progress
 * stories within a specific project.
 *
 * Each row shows the worker name (linked to the worker detail page),
 * the assigned story title (linked to the story detail page), and the
 * elapsed time since assignment.
 *
 * The query hook is defined locally because the API endpoint
 * (`GET /api/v1/projects/:id/workers/active`) is not yet in the OpenAPI spec.
 */

import { useQuery } from '@tanstack/react-query';
import { Bot, Clock } from 'lucide-react';
import Link from 'next/link';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatElapsedTime } from '@/lib/format-elapsed-time';

// ---------------------------------------------------------------------------
// Types (local until shared types are available)
// ---------------------------------------------------------------------------

/** A single worker-to-story assignment returned by the active workers endpoint. */
interface ActiveWorkerAssignment {
  /** Unique worker ID. */
  workerId: string;
  /** Display name of the worker. */
  workerName: string;
  /** ID of the story the worker is assigned to. */
  storyId: string;
  /** Title of the assigned story. */
  storyTitle: string;
  /** ISO 8601 timestamp of when the worker was assigned. */
  assignedAt: string;
}

/** Shape of the API response from the active workers endpoint. */
interface ActiveWorkersResponse {
  data: ActiveWorkerAssignment[];
}

// ---------------------------------------------------------------------------
// Local query hook
// ---------------------------------------------------------------------------

/**
 * Fetches the list of active worker assignments scoped to a project.
 *
 * Uses raw `fetch` because this endpoint is not yet in the OpenAPI spec.
 * The query key follows the project-scoped pattern from the query-keys factory.
 */
function useProjectActiveWorkers(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'workers', 'active'] as const,
    queryFn: async (): Promise<ActiveWorkerAssignment[]> => {
      const response = await fetch(`/api/v1/projects/${projectId}/workers/active`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch active workers: ${String(response.status)}`);
      }
      const body = (await response.json()) as ActiveWorkersResponse;
      return body.data;
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------

const SKELETON_ROW_COUNT = 3;

function ActiveWorkersCardSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading active workers">
      <div className="space-y-3">
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-md px-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Skeleton width="120px" height="14px" rounded="rounded-sm" />
              <Skeleton width="180px" height="12px" rounded="rounded-sm" />
            </div>
            <Skeleton width="80px" height="12px" rounded="rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActiveWorkersCardProps {
  /** The project ID to scope the active workers query. */
  projectId: string;
}

export function ActiveWorkersCard({ projectId }: ActiveWorkersCardProps) {
  const { data: workers, isLoading } = useProjectActiveWorkers(projectId);

  const workerCount = workers?.length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-zinc-500" />
          Active Workers
        </CardTitle>
        {!isLoading && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700">
            {workerCount}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ActiveWorkersCardSkeleton />
        ) : workerCount === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No workers currently active.</p>
        ) : (
          <div className="space-y-1">
            {workers?.map((assignment) => (
              <div
                key={assignment.workerId}
                className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-zinc-50"
              >
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/workers/${assignment.workerId}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 hover:underline"
                  >
                    <Bot className="h-3.5 w-3.5 text-zinc-400" />
                    {assignment.workerName}
                  </Link>
                  <Link
                    href={`/projects/${projectId}/stories/${assignment.storyId}`}
                    className="text-xs text-zinc-500 hover:text-zinc-700 hover:underline"
                  >
                    {assignment.storyTitle}
                  </Link>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatElapsedTime(assignment.assignedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
