/**
 * Worker detail page -- `/workers/{workerId}`
 *
 * Displays a single worker with:
 * - Breadcrumb navigation: Workers > {Worker Name}
 * - Header with inline-editable name and worker ID in monospace
 * - API Key status card
 * - Current Work card (conditional — only when actively assigned)
 * - Project Access management (delegated to WorkerProjectAccess component)
 * - Work History table with aggregated totals
 *
 * Layout: AppLayout with `variant="constrained"` for detail page.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useWorker`, `useWorkerHistory` hooks.
 */
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, History, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonTable, SkeletonText } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WorkerProjectAccess } from '@/components/workers/worker-project-access';
import { useUpdateWorker, useWorker, useWorkerHistory } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Worker data shape from the API detail response. */
interface WorkerData {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  currentAssignment?: {
    storyId: string;
    storyTitle: string;
    projectId: string;
    projectName: string;
    assignedAt: string;
  } | null;
}

/** Work history record shape (matches API response from attempt_history). */
interface WorkHistoryRecord {
  id: string;
  storyId: string;
  storyTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  cost: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** USD currency formatter. */
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Falls back to computing from start/end dates if durationMs is not available.
 * Returns "Xh Ym" for durations over an hour, "Xm" for shorter ones.
 */
const formatDuration = (
  durationMs: number | null,
  startDate: string,
  endDate: string | null,
): string => {
  let diffMs: number;
  if (durationMs !== null) {
    diffMs = durationMs;
  } else {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    diffMs = end.getTime() - start.getTime();
  }
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${String(hours)}h ${String(minutes)}m`;
  }
  return `${String(totalMinutes)}m`;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the entire worker detail page. */
const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading worker details">
    {/* Breadcrumb skeleton */}
    <div className="mb-4">
      <Skeleton width="180px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Header skeleton */}
    <div className="mb-2">
      <Skeleton width="300px" height="30px" rounded="rounded-sm" />
    </div>
    <div className="mb-6">
      <Skeleton width="260px" height="14px" rounded="rounded-sm" />
    </div>

    {/* API Key card skeleton */}
    <div className="mb-6 rounded-md border border-zinc-200 bg-white p-6">
      <Skeleton width="80px" height="18px" rounded="rounded-sm" />
      <div className="mt-3">
        <SkeletonText lines={2} />
      </div>
    </div>

    {/* Project access skeleton */}
    <div className="mb-6">
      <SkeletonTable columns={4} rows={3} />
    </div>

    {/* Work history skeleton */}
    <SkeletonTable columns={6} rows={3} />
  </div>
);

/** 404 state when a worker is not found. */
const WorkerNotFound = () => {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <AlertTriangle className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">Worker Not Found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The worker you are looking for does not exist or has been deleted.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => {
          void router.push('/workers');
        }}
      >
        Back to Workers
      </Button>
    </div>
  );
};

/**
 * Inline-editable worker name.
 *
 * Click to switch from display to input mode. Press Enter or blur to save.
 * Press Escape to cancel. Uses the `useUpdateWorker` mutation.
 */
const InlineEditableName = ({
  name,
  workerId,
  version,
}: {
  name: string;
  workerId: string;
  version: number;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateWorker = useUpdateWorker(workerId);

  // Sync editValue when the worker name changes externally
  useEffect(() => {
    setEditValue(name);
  }, [name]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      updateWorker.mutate({ name: trimmed, version });
    } else {
      setEditValue(name);
    }
    setIsEditing(false);
  }, [editValue, name, updateWorker, version]);

  const handleCancel = useCallback(() => {
    setEditValue(name);
    setIsEditing(false);
  }, [name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg border-b-2 border-indigo-500 bg-transparent text-[30px] leading-tight font-bold text-zinc-900 outline-none"
        aria-label="Edit worker name"
      />
    );
  }

  return (
    <h1 className="text-[30px] leading-tight font-bold text-zinc-900">
      <button
        type="button"
        className="cursor-pointer text-left transition-colors hover:text-indigo-600"
        onClick={() => {
          setIsEditing(true);
        }}
        aria-label={`Edit worker name: ${name}`}
      >
        {name}
      </button>
    </h1>
  );
};

/** API Key status card. */
const ApiKeySection = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        API Key
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-zinc-500">
        API key was shown once at creation and cannot be retrieved. If lost, delete this worker and
        create a new one.
      </p>
    </CardContent>
  </Card>
);

/** Current Work card (conditional — only shown when worker has an active assignment). */
const CurrentWorkCard = ({
  assignment,
}: {
  assignment: {
    storyId: string;
    storyTitle: string;
    projectId: string;
    projectName: string;
    assignedAt: string;
  };
}) => {
  const duration = formatDistanceToNow(new Date(assignment.assignedAt), { addSuffix: false });

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-blue-700">
            Currently working on{' '}
            <Link
              href={`/projects/${assignment.projectId}/stories/${assignment.storyId}`}
              className="font-medium text-blue-800 hover:underline"
            >
              {assignment.storyTitle}
            </Link>{' '}
            in{' '}
            <Link
              href={`/projects/${assignment.projectId}`}
              className="font-medium text-blue-800 hover:underline"
            >
              {assignment.projectName}
            </Link>
          </div>
          <span className="ml-4 text-xs whitespace-nowrap text-blue-500">{duration}</span>
        </div>
      </CardContent>
    </Card>
  );
};

/** Work History table card with aggregated totals. */
const WorkHistorySection = ({
  history,
  isLoading,
}: {
  history: WorkHistoryRecord[];
  isLoading: boolean;
}) => {
  // Calculate total cost
  let totalCost = 0;
  for (const record of history) {
    if (record.cost !== null) {
      totalCost += parseFloat(record.cost);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 pt-0">
            <SkeletonTable columns={6} rows={3} />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={(props: { className?: string }) => <History {...props} />}
            title="No Work History Yet"
            description="This worker has not completed any work assignments. History will appear here once the worker finishes tasks."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200 hover:bg-transparent">
                  <TableHead className="text-overline h-10 px-4 text-zinc-500">
                    Story Title
                  </TableHead>
                  <TableHead className="text-overline h-10 px-4 text-zinc-500">Project</TableHead>
                  <TableHead className="text-overline h-10 px-4 text-zinc-500">Status</TableHead>
                  <TableHead className="text-overline h-10 px-4 text-zinc-500">
                    Started At
                  </TableHead>
                  <TableHead className="text-overline h-10 px-4 text-zinc-500">Duration</TableHead>
                  <TableHead className="text-overline h-10 px-4 text-right text-zinc-500">
                    Cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id} className="h-10 border-b border-zinc-200">
                    <TableCell className="px-4 py-2">
                      <Link
                        href={`/projects/${record.projectId}/stories/${record.storyId}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {record.storyTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      <Link
                        href={`/projects/${record.projectId}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {record.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-zinc-500 capitalize">
                      {record.status === 'in_progress' ? 'In Progress' : record.status}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-zinc-500">
                      {formatDistanceToNow(new Date(record.startedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-zinc-500">
                      {formatDuration(record.durationMs, record.startedAt, record.completedAt)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <span className="font-mono text-[13px] text-zinc-900">
                        {record.cost !== null
                          ? currencyFormatter.format(parseFloat(record.cost))
                          : '--'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-2 text-right font-medium text-zinc-700">
                    Total
                  </TableCell>
                  <TableCell className="px-4 py-2 text-right">
                    <span className="font-mono text-[13px] font-medium text-zinc-900">
                      {currencyFormatter.format(totalCost)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const WorkerDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workerId = router.query.workerId as string;

  // Fetch worker detail
  const { data: workerData, isLoading: workerLoading, isError: workerError } = useWorker(workerId);
  const worker = workerData?.data as WorkerData | undefined;

  // Fetch work history
  const { data: historyData, isLoading: historyLoading } = useWorkerHistory(workerId);
  const history = (historyData?.data ?? []) as WorkHistoryRecord[];

  // Loading state
  if (workerLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // 404 state
  if (workerError || !worker) {
    return <WorkerNotFound />;
  }

  // Extract current assignment from worker data
  const currentAssignment = worker.currentAssignment ?? null;

  const breadcrumbItems = [{ label: 'Workers', href: '/workers' }, { label: worker.name }];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header: Inline-editable name + Worker ID */}
      <div>
        <InlineEditableName name={worker.name} workerId={worker.id} version={worker.version} />
        <p className="mt-1 font-mono text-[13px] text-zinc-400" aria-label="Worker ID">
          {worker.id}
        </p>
      </div>

      {/* API Key Section */}
      <ApiKeySection />

      {/* Current Work Card (conditional) */}
      {currentAssignment && <CurrentWorkCard assignment={currentAssignment} />}

      {/* Project Access Table */}
      <WorkerProjectAccess workerId={workerId} />

      {/* Work History Table */}
      <WorkHistorySection history={history} isLoading={historyLoading} />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width.
 */
WorkerDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default WorkerDetailPage;
