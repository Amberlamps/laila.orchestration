/**
 * Project list page — `/projects`
 *
 * Displays all projects in a filterable, paginated card grid.
 * Primary entry point for project management.
 *
 * Layout: AppLayout with `variant="full"` for full-width grid.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useProjects` hook with filter + pagination params.
 */
import { formatDistanceToNow } from 'date-fns';
import { Bot, Clock, DollarSign, FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { CreateProjectModal } from '@/components/projects/create-project-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useProjects } from '@/lib/query-hooks';
import { cn } from '@/lib/utils';

import type { NextPageWithLayout } from '../_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status filter values for the filter chips.
 *
 * Maps UI labels to `ProjectLifecycleStatus` values used by the API.
 * "all" is a sentinel that means "no filter applied".
 */
type StatusFilter = 'all' | 'draft' | 'ready' | 'active' | 'completed';

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
}

const STATUS_FILTERS: StatusFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'In Progress' },
  { value: 'completed', label: 'Complete' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const SKELETON_COUNT = 6;

/** USD currency formatter */
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a `ProjectLifecycleStatus` to the closest `WorkStatus` value
 * that StatusBadge can display.
 *
 * The Project entity has both `lifecycleStatus` and `workStatus`.
 * The card shows `workStatus` via StatusBadge when available,
 * otherwise we fall back from lifecycleStatus.
 */
function lifecycleToWorkStatus(lifecycle: string): 'draft' | 'ready' | 'in_progress' | 'complete' {
  switch (lifecycle) {
    case 'draft':
    case 'planning':
      return 'draft';
    case 'ready':
      return 'ready';
    case 'active':
      return 'in_progress';
    case 'completed':
    case 'archived':
      return 'complete';
    default:
      return 'draft';
  }
}

/**
 * Returns a numeric progress percentage (0-100) derived from the
 * work status. In a real implementation this would come from
 * aggregated task completion data.
 */
function getProgressFromStatus(workStatus: string): { complete: number; inProgress: number } {
  switch (workStatus) {
    case 'done':
    case 'complete':
      return { complete: 100, inProgress: 0 };
    case 'in_progress':
    case 'review':
      return { complete: 30, inProgress: 40 };
    case 'ready':
      return { complete: 0, inProgress: 10 };
    default:
      return { complete: 0, inProgress: 0 };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Horizontal row of status filter chips with counts. */
function FilterChips({
  activeFilter,
  onFilterChange,
  statusCounts,
}: {
  activeFilter: StatusFilter;
  onFilterChange: (value: StatusFilter) => void;
  statusCounts: Record<StatusFilter, number | undefined>;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter projects by status">
      {STATUS_FILTERS.map((filter) => {
        const isActive = activeFilter === filter.value;
        const count = statusCounts[filter.value];
        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => {
              onFilterChange(filter.value);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-indigo-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
            )}
            aria-pressed={isActive}
          >
            {filter.label}
            {count !== undefined && (
              <span
                className={cn(
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs',
                  isActive ? 'bg-indigo-400/50 text-white' : 'bg-zinc-200 text-zinc-500',
                )}
              >
                {String(count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A single project card in the grid. */
function ProjectCard({
  project,
}: {
  project: Record<string, unknown> & {
    id: string;
    name: string;
    description: string | null;
    workStatus: string;
    lifecycleStatus: string;
    updatedAt: string;
  };
}) {
  const badgeStatus = lifecycleToWorkStatus(project.lifecycleStatus);
  const progress = getProgressFromStatus(project.workStatus);
  const relativeTime = formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true });

  const activeWorkers = typeof project.activeWorkers === 'number' ? project.activeWorkers : 0;
  const totalCost = typeof project.totalCost === 'number' ? project.totalCost : 0;

  return (
    <Card className="flex flex-col p-5">
      {/* Header: Name + Status Badge */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-base leading-tight font-semibold">
          <Link
            href={`/projects/${project.id}`}
            className="text-zinc-900 transition-colors hover:text-indigo-600"
          >
            {project.name}
          </Link>
        </h3>
        <StatusBadge status={badgeStatus} className="shrink-0" />
      </div>

      {/* Description (2-line excerpt) */}
      <p className="mt-1 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-zinc-500">
        {project.description ?? 'No description'}
      </p>

      {/* Progress bar */}
      <div
        className="mt-3 flex h-1 w-full overflow-hidden rounded-full bg-zinc-200"
        role="progressbar"
        aria-valuenow={progress.complete + progress.inProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Project progress: ${String(progress.complete + progress.inProgress)}%`}
      >
        {progress.complete > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${String(progress.complete)}%` }}
          />
        )}
        {progress.inProgress > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${String(progress.inProgress)}%` }}
          />
        )}
      </div>

      {/* Metadata row */}
      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1" title="Active workers">
          <Bot className="size-3.5" aria-hidden="true" />
          <span>{String(activeWorkers)}</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Cost">
          <DollarSign className="size-3.5" aria-hidden="true" />
          <span>{currencyFormatter.format(totalCost)}</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Last updated">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>{relativeTime}</span>
        </span>
      </div>
    </Card>
  );
}

/** Loading skeleton grid — 6 cards. */
function LoadingGrid() {
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
      role="status"
      aria-label="Loading projects"
    >
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Pagination controls: "Showing X-Y of Z" + Previous/Next. */
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-zinc-500">
        Showing {String(start)}&ndash;{String(end)} of {String(total)}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const ProjectsPage: NextPageWithLayout = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const queryParams: Record<string, unknown> = {
    page,
    limit: PAGE_SIZE,
  };
  if (statusFilter !== 'all') {
    queryParams.status = statusFilter;
  }

  const { data, isLoading } = useProjects(queryParams);

  // Fetch counts for each status filter chip using lightweight queries
  const allCountQuery = useProjects({ page: 1, limit: 1 });
  const draftCountQuery = useProjects({ page: 1, limit: 1, status: 'draft' });
  const readyCountQuery = useProjects({ page: 1, limit: 1, status: 'ready' });
  const activeCountQuery = useProjects({ page: 1, limit: 1, status: 'active' });
  const completedCountQuery = useProjects({ page: 1, limit: 1, status: 'completed' });

  const statusCounts: Record<StatusFilter, number | undefined> = {
    all: (allCountQuery.data as { pagination?: { total?: number } } | undefined)?.pagination?.total,
    draft: (draftCountQuery.data as { pagination?: { total?: number } } | undefined)?.pagination
      ?.total,
    ready: (readyCountQuery.data as { pagination?: { total?: number } } | undefined)?.pagination
      ?.total,
    active: (activeCountQuery.data as { pagination?: { total?: number } } | undefined)?.pagination
      ?.total,
    completed: (completedCountQuery.data as { pagination?: { total?: number } } | undefined)
      ?.pagination?.total,
  };

  const projects = data?.data ?? [];
  const pagination = data?.pagination;

  const handleFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1); // Reset to page 1 when filter changes
  };

  const handleNewProject = () => {
    setIsCreateModalOpen(true);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Projects</h1>
        <Button onClick={handleNewProject}>
          <Plus className="size-4" aria-hidden="true" />
          New Project
        </Button>
      </div>

      {/* Filter Chips */}
      <FilterChips
        activeFilter={statusFilter}
        onFilterChange={handleFilterChange}
        statusCounts={statusCounts}
      />

      {/* Loading state */}
      {isLoading && <LoadingGrid />}

      {/* Empty state */}
      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={(props: { className?: string }) => <FolderKanban {...props} />}
          title="No Projects Yet"
          description="Create your first project to start organizing work with epics, stories, and tasks."
          actionLabel="+ Create Project"
          onAction={handleNewProject}
        />
      )}

      {/* Card grid */}
      {!isLoading && projects.length > 0 && (
        <>
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
          >
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project as Record<string, unknown> & typeof project}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              pageSize={pagination.limit}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="full"`
 * for full-width card grid. Overrides the default constrained layout.
 */
ProjectsPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default ProjectsPage;
