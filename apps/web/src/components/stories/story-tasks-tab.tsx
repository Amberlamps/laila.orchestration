/**
 * Tasks sub-tab for the story detail page.
 *
 * Shows the task breakdown for a story with:
 * - Read-only banner when the story is in_progress or complete
 * - "+ New Task" button (disabled when read-only)
 * - EntityTable with columns: Order, Title, Status, Persona, Dependencies
 * - Dependency count badge with Popover showing dependency details
 * - Empty state and loading skeleton
 *
 * Data is fetched via the `useTasks` TanStack Query hook.
 */
import { ClipboardList, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityTable } from '@/components/ui/entity-table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonTable } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePersonas, useTasks } from '@/lib/query-hooks';

import type { ColumnDef } from '@/components/ui/entity-table';
import type { WorkStatus } from '@/components/ui/status-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoryTasksTabProps {
  storyId: string;
  projectId: string;
  /** Whether the story is in a read-only state (in_progress or complete) */
  readOnly: boolean;
  /** The actual work status of the story, used to compute the banner text */
  storyWorkStatus: string;
  /** Callback to open the create task modal. When not provided, the button navigates to a stub. */
  onCreateTask?: () => void;
}

/** Shape of a task row as returned by the API list endpoint. */
interface TaskRow {
  id: string;
  title: string;
  workStatus: string;
  personaId: string | null;
  dependencyIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API work status string to the StatusBadge WorkStatus type.
 *
 * The API uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * The StatusBadge uses: draft, not_started, ready, blocked, in_progress, complete, failed
 */
const mapApiWorkStatus = (apiStatus: string): WorkStatus => {
  switch (apiStatus) {
    case 'pending':
      return 'not_started';
    case 'blocked':
      return 'blocked';
    case 'ready':
      return 'ready';
    case 'in_progress':
    case 'review':
      return 'in_progress';
    case 'done':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'complete';
    default:
      return 'draft';
  }
};

/**
 * Computes a simple execution order for tasks based on dependency topology.
 *
 * Tasks with no dependencies get order 1, tasks whose dependencies all have
 * order N get order N+1. This is a simplified topological level assignment.
 * Falls back to index-based ordering if cyclic or unresolved.
 */
const computeExecutionOrder = (tasks: TaskRow[]): Map<string, number> => {
  const orderMap = new Map<string, number>();
  const taskIds = new Set(tasks.map((t) => t.id));

  // Build adjacency: task -> dependency IDs (filtered to only tasks in this list)
  const depsMap = new Map<string, string[]>();
  for (const task of tasks) {
    const deps = (task.dependencyIds ?? []).filter((id) => taskIds.has(id));
    depsMap.set(task.id, deps);
  }

  // Iterative level assignment
  const resolved = new Set<string>();
  let level = 1;
  let remaining = tasks.map((t) => t.id);

  while (remaining.length > 0) {
    const nextRemaining: string[] = [];
    let progressMade = false;

    for (const id of remaining) {
      const deps = depsMap.get(id) ?? [];
      const allDepsResolved = deps.every((depId) => resolved.has(depId));

      if (allDepsResolved) {
        orderMap.set(id, level);
        resolved.add(id);
        progressMade = true;
      } else {
        nextRemaining.push(id);
      }
    }

    if (!progressMade) {
      // Remaining tasks have circular dependencies; assign current level
      for (const id of nextRemaining) {
        orderMap.set(id, level);
      }
      break;
    }

    remaining = nextRemaining;
    level++;
  }

  return orderMap;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Read-only banner shown when the story is in_progress or complete. */
const ReadOnlyBanner = ({ status }: { status: 'in progress' | 'complete' }) => (
  <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
    <Lock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
    <p className="text-sm text-amber-700">
      This story is currently {status}. Tasks cannot be modified.
    </p>
  </div>
);

/** Dependency count badge with a Popover showing dependency details. */
const DependencyPopover = ({
  dependencyIds,
  taskLookup,
}: {
  dependencyIds: string[];
  taskLookup: Map<string, TaskRow>;
}) => {
  if (dependencyIds.length === 0) {
    return <span className="text-sm text-zinc-400">None</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-sm bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {String(dependencyIds.length)} {dependencyIds.length === 1 ? 'dep' : 'deps'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h4 className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Dependencies</h4>
        <ul className="space-y-2">
          {dependencyIds.map((depId) => {
            const depTask = taskLookup.get(depId);
            return (
              <li key={depId} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-zinc-900">
                  {depTask ? depTask.title : depId}
                </span>
                {depTask && (
                  <StatusBadge status={mapApiWorkStatus(depTask.workStatus)} className="shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function StoryTasksTab({
  storyId,
  projectId,
  readOnly,
  storyWorkStatus,
  onCreateTask,
}: StoryTasksTabProps) {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch tasks for this story
  const queryParams: Record<string, unknown> = {
    page,
    limit: PAGE_SIZE,
  };
  if (sortBy) {
    queryParams.sortBy = sortBy;
    queryParams.sortOrder = sortDirection;
  }

  const { data: tasksData, isLoading: tasksLoading } = useTasks(storyId, queryParams);
  const tasks: TaskRow[] = (tasksData?.data ?? []) as TaskRow[];
  const totalCount = tasksData?.pagination.total ?? tasks.length;

  // Fetch personas for name resolution
  const { data: personasData } = usePersonas();
  const personaLookup = new Map<string, string>();
  if (personasData?.data) {
    for (const persona of personasData.data as unknown as Array<{ id: string; title: string }>) {
      personaLookup.set(persona.id, persona.title);
    }
  }

  // Build task lookup for dependency resolution
  const taskLookup = new Map<string, TaskRow>();
  for (const task of tasks) {
    taskLookup.set(task.id, task);
  }

  // Compute execution order from dependency topology
  const executionOrder = computeExecutionOrder(tasks);

  // Handle sort toggle
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDirection('asc');
    }
  };

  // Derive the read-only status label for the banner
  const readOnlyStatus: 'in progress' | 'complete' =
    storyWorkStatus === 'done' || storyWorkStatus === 'complete' ? 'complete' : 'in progress';

  // Column definitions
  const taskColumns: ColumnDef<TaskRow>[] = [
    {
      key: 'order',
      header: '#',
      width: '60px',
      align: 'center',
      cell: (task) => {
        const order = executionOrder.get(task.id) ?? 0;
        return (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
            {String(order)}
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Task',
      sortable: true,
      width: '40%',
      cell: (task) => (
        <Link
          href={`/projects/${projectId}/tasks/${task.id}`}
          className="font-medium text-indigo-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {task.title}
        </Link>
      ),
    },
    {
      key: 'workStatus',
      header: 'Status',
      sortable: true,
      cell: (task) => <StatusBadge status={mapApiWorkStatus(task.workStatus)} />,
    },
    {
      key: 'persona',
      header: 'Persona',
      cell: (task) => {
        if (!task.personaId) {
          return <span className="text-sm text-zinc-400">Not assigned</span>;
        }
        const personaName = personaLookup.get(task.personaId);
        return (
          <Link
            href={`/personas/${task.personaId}`}
            className="text-sm text-indigo-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {personaName ?? 'Unknown'}
          </Link>
        );
      },
    },
    {
      key: 'dependencies',
      header: 'Deps',
      align: 'center',
      cell: (task) => (
        <DependencyPopover dependencyIds={task.dependencyIds ?? []} taskLookup={taskLookup} />
      ),
    },
  ];

  // Loading state
  if (tasksLoading) {
    return (
      <div className="mt-6">
        <SkeletonTable columns={5} rows={5} />
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Read-only banner */}
      {readOnly && <ReadOnlyBanner status={readOnlyStatus} />}

      {/* Header with "+ New Task" button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Tasks</h2>
        {readOnly ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-disabled="true"
                  className="pointer-events-auto opacity-50"
                  onClick={(e) => {
                    e.preventDefault();
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New Task
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Tasks cannot be added while the story is in progress or complete.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            onClick={() => {
              onCreateTask?.();
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            New Task
          </Button>
        )}
      </div>

      {/* Task table */}
      <EntityTable<TaskRow>
        columns={taskColumns}
        data={tasks}
        getRowKey={(row) => row.id}
        loading={tasksLoading}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={setPage}
        onSort={handleSort}
        {...(sortBy != null ? { sortBy, sortDirection } : {})}
        onRowClick={(row) => {
          void router.push(`/projects/${projectId}/tasks/${row.id}`);
        }}
        emptyState={
          <EmptyState
            icon={(props: { className?: string }) => <ClipboardList {...props} />}
            title="No tasks defined"
            description="This story doesn't have any tasks yet. Add a task to get started."
            {...(!readOnly && onCreateTask
              ? {
                  actionLabel: '+ Add Task',
                  onAction: onCreateTask,
                }
              : {})}
          />
        }
      />
    </div>
  );
}

export { StoryTasksTab };
export type { StoryTasksTabProps };
