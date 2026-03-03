/**
 * Worker list page -- `/workers`
 *
 * Displays all AI execution agent workers in a sortable table.
 * Workers are top-level entities scoped to the authenticated user.
 *
 * Layout: AppLayout with `variant="full"` for full-width table.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useWorkers` hook.
 */
import { formatDistanceToNow } from 'date-fns';
import { Bot, Eye, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityTable } from '@/components/ui/entity-table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonTable } from '@/components/ui/skeleton';
import { CreateWorkerModal } from '@/components/workers/create-worker-modal';
import { useDeleteWorker, useWorkers } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../_app';
import type { ColumnDef, RowAction } from '@/components/ui/entity-table';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a worker row as returned by the API list endpoint. */
interface WorkerRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Aggregated: number of assigned projects (may be absent from API). */
  projectCount?: number;
  /** Aggregated: list of assigned projects with id and name. */
  assignedProjects?: Array<{ id: string; name: string }>;
  /** Aggregated: current work assignment info. */
  currentAssignment?: {
    storyTitle: string;
    projectName: string;
    projectId: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the "Assigned Projects" cell with a count badge and popover. */
const ProjectCountCell = ({ worker }: { worker: WorkerRow }) => {
  const projects = worker.assignedProjects ?? [];
  const count = worker.projectCount ?? projects.length;

  if (count === 0) {
    return <span className="text-zinc-400">None</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Badge variant="secondary">
            {String(count)} {count === 1 ? 'project' : 'projects'}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-48 w-56 overflow-y-auto p-3"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {projects.length > 0 ? (
          <ul className="space-y-1.5">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            {String(count)} {count === 1 ? 'project' : 'projects'} assigned
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** Renders the "Current Status" cell with contextual text. */
const CurrentStatusCell = ({ worker }: { worker: WorkerRow }) => {
  const assignment = worker.currentAssignment;
  const projectCount = worker.projectCount ?? (worker.assignedProjects ?? []).length;

  if (assignment) {
    return (
      <span className="text-blue-600">
        Working on {assignment.storyTitle} in{' '}
        <Link
          href={`/projects/${assignment.projectId}`}
          className="font-medium hover:underline"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {assignment.projectName}
        </Link>
      </span>
    );
  }

  if (projectCount === 0) {
    return <span className="text-zinc-400">No projects assigned</span>;
  }

  return <span className="text-zinc-400">Idle</span>;
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const WorkersPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState<WorkerRow | null>(null);

  // Data fetching
  const queryParams: Record<string, unknown> = {
    page,
    limit: PAGE_SIZE,
  };
  if (sortBy) {
    queryParams.sortBy = sortBy;
    queryParams.sortOrder = sortDirection;
  }

  const { data, isLoading } = useWorkers(queryParams);
  const deleteWorker = useDeleteWorker();

  const workers: WorkerRow[] = (data?.data ?? []) as WorkerRow[];
  const pagination = data?.pagination;

  // Handle sort toggle
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDirection('asc');
    }
  };

  // Handle create worker
  const handleCreateWorker = () => {
    setIsCreateModalOpen(true);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (!workerToDelete) return;
    deleteWorker.mutate(workerToDelete.id, {
      onSuccess: () => {
        setWorkerToDelete(null);
      },
    });
  };

  // Column definitions
  const workerColumns: ColumnDef<WorkerRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      cell: (worker) => (
        <Link
          href={`/workers/${worker.id}`}
          className="font-semibold text-zinc-900 transition-colors hover:text-indigo-600"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {worker.name}
        </Link>
      ),
    },
    {
      key: 'projects',
      header: 'Assigned Projects',
      cell: (worker) => <ProjectCountCell worker={worker} />,
    },
    {
      key: 'currentStatus',
      header: 'Current Status',
      cell: (worker) => <CurrentStatusCell worker={worker} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (worker) => (
        <span className="text-zinc-500">
          {formatDistanceToNow(new Date(worker.createdAt), { addSuffix: true })}
        </span>
      ),
    },
  ];

  // Row actions
  const rowActions: RowAction<WorkerRow>[] = [
    {
      label: 'View Details',
      icon: Eye,
      onClick: (worker) => {
        void router.push(`/workers/${worker.id}`);
      },
    },
    {
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      disabled: (worker) =>
        worker.currentAssignment !== null && worker.currentAssignment !== undefined,
      disabledTooltip: 'Cannot delete worker with active work assignments.',
      onClick: (worker) => {
        setWorkerToDelete(worker);
      },
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Workers</h1>
        <Button onClick={handleCreateWorker}>
          <Plus className="size-4" aria-hidden="true" />
          Create Worker
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && <SkeletonTable columns={5} rows={5} />}

      {/* Empty state */}
      {!isLoading && workers.length === 0 && (
        <EmptyState
          icon={(props: { className?: string }) => <Bot {...props} />}
          title="No Workers"
          description="Create your first AI execution agent worker to start automating tasks across your projects."
          actionLabel="+ Create Worker"
          onAction={handleCreateWorker}
        />
      )}

      {/* Worker table */}
      {!isLoading && workers.length > 0 && (
        <EntityTable<WorkerRow>
          columns={workerColumns}
          data={workers}
          getRowKey={(worker) => worker.id}
          actions={rowActions}
          onRowClick={(worker) => {
            void router.push(`/workers/${worker.id}`);
          }}
          onSort={handleSort}
          {...(sortBy != null ? { sortBy, sortDirection } : {})}
          page={pagination?.page ?? page}
          pageSize={pagination?.limit ?? PAGE_SIZE}
          totalCount={pagination?.total ?? workers.length}
          onPageChange={setPage}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={workerToDelete !== null}
        onClose={() => {
          setWorkerToDelete(null);
        }}
        title={`Delete Worker "${workerToDelete?.name ?? ''}"?`}
        description="This will permanently delete this worker. Any active work assignments will be unassigned. This action cannot be undone."
        confirmLabel="Delete Worker"
        onConfirm={handleDeleteConfirm}
        loading={deleteWorker.isPending}
        variant="destructive"
      />

      {/* Create Worker Modal */}
      <CreateWorkerModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="full"`
 * for full-width table layout.
 */
WorkersPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default WorkersPage;
