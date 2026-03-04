/**
 * Story detail page -- `/projects/{projectId}/stories/{storyId}`
 *
 * Displays a single user story with:
 * - Breadcrumb navigation: Projects > {Project} > Epics > {Epic} > Stories > {Story Title}
 * - Header with title, priority/status badges, assigned worker, and action buttons
 * - Tab bar: Overview | Tasks | Attempt History (shallow routing)
 * - Overview tab: Markdown description, metadata grid, error display, implicit dependencies
 *
 * Layout: AppLayout with `variant="constrained"`.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useStory`, `useProject`, `useEpic`, `useWorker` hooks.
 */
import { AlertCircle, Clock, Pencil, RotateCcw, Send, Trash2, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { CreateEditStoryModal } from '@/components/stories/create-edit-story-modal';
import {
  DeleteStoryButton,
  DeleteStoryFlow,
  PublishStoryFlow,
  ResetStoryFlow,
  UnassignStoryFlow,
} from '@/components/stories/story-action-flows';
import { StoryAttemptHistoryTab } from '@/components/stories/story-attempt-history-tab';
import { StoryTasksTab } from '@/components/stories/story-tasks-tab';
import { CreateEditTaskModal } from '@/components/tasks/create-edit-task-modal';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useEpic,
  useProject,
  useStory,
  useStoryAttemptHistory,
  useTasks,
  useWorker,
} from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../../../_app';
import type { WorkStatus } from '@/components/ui/status-badge';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoryData {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  description: string | null;
  priority: string;
  workStatus: string;
  costEstimate: number | null;
  actualCost: number | null;
  assignedWorkerId: string | null;
  assignedAt: string | null;
  attempts: number;
  maxAttempts: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
  implicitDependencies?: Array<{
    storyId: string;
    storyTitle: string;
    direction: 'depends_on' | 'blocks';
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maps API priority values to display labels, background, and text colors. */
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  critical: {
    label: 'Critical',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
  },
  high: {
    label: 'High',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an API WorkStatus to the StatusBadge WorkStatus type.
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
 * Determines if a story is in "draft" state.
 * Stories in `pending` workStatus with no prior assignment are considered draft.
 */
const isStoryDraft = (workStatus: string): boolean => workStatus === 'pending';

/**
 * Formats a date string as a human-readable timestamp.
 * Example: "Mar 3, 2026, 2:45 PM"
 */
const formatTimestamp = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Formats a duration in milliseconds as a human-readable string.
 * Example: "2h 45m", "3d 12h", "5m"
 */
const formatDuration = (ms: number): string => {
  if (ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days)}d`);
  if (hours > 0) parts.push(`${String(hours)}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${String(minutes)}m`);
  return parts.join(' ');
};

/**
 * Formats a token count with comma separators.
 * Example: 1234567 -> "1,234,567"
 */
const formatTokens = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

/**
 * Formats a number as a USD currency string.
 * Example: 1234.56 -> "$1,234.56"
 */
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the story detail page. */
const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading story details">
    {/* Breadcrumb skeleton */}
    <div className="mb-4">
      <Skeleton width="360px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Header skeleton */}
    <div className="mb-6 flex items-start justify-between">
      <div className="flex-1">
        <Skeleton width="300px" height="28px" rounded="rounded-sm" />
        <div className="mt-2 flex gap-2">
          <Skeleton width="80px" height="22px" rounded="rounded-sm" />
          <Skeleton width="80px" height="22px" rounded="rounded-sm" />
          <Skeleton width="80px" height="22px" rounded="rounded-sm" />
        </div>
        <div className="mt-2">
          <Skeleton width="120px" height="14px" rounded="rounded-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton width="80px" height="36px" rounded="rounded-md" />
        <Skeleton width="80px" height="36px" rounded="rounded-md" />
        <Skeleton width="36px" height="36px" rounded="rounded-md" />
      </div>
    </div>

    {/* Tabs skeleton */}
    <div className="mb-4 flex gap-4 border-b border-zinc-200 pb-2">
      <Skeleton width="80px" height="14px" rounded="rounded-sm" />
      <Skeleton width="60px" height="14px" rounded="rounded-sm" />
      <Skeleton width="100px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Description skeleton */}
    <div className="mb-8">
      <SkeletonText lines={3} />
    </div>

    {/* Metadata grid skeleton */}
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton width="80px" height="12px" rounded="rounded-sm" />
          <Skeleton width="120px" height="16px" rounded="rounded-sm" />
        </div>
      ))}
    </div>
  </div>
);

/** 404 state when a story is not found. */
const StoryNotFound = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <AlertCircle className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900">Story Not Found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The story you are looking for does not exist or has been deleted.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => {
          void router.push(`/projects/${projectId}`);
        }}
      >
        Back to Project
      </Button>
    </div>
  );
};

/** Priority badge component with colored dot. */
const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = PRIORITY_CONFIG[priority] ?? {
    label: priority,
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    dot: 'bg-zinc-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className={`size-2 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
};

/** Header section with story title, badges, worker assignment, and action buttons. */
const StoryHeader = ({
  story,
  workerName,
  onEditClick,
  onPublishClick,
  onUnassignClick,
  onResetClick,
  onDeleteClick,
}: {
  story: StoryData;
  workerName: string | null;
  onEditClick: () => void;
  onPublishClick: () => void;
  onUnassignClick: () => void;
  onResetClick: () => void;
  onDeleteClick: () => void;
}) => {
  const badgeStatus = mapApiWorkStatus(story.workStatus);
  const isDraft = isStoryDraft(story.workStatus);
  const isFailed = story.workStatus === 'failed';
  const isInProgress = story.workStatus === 'in_progress';
  const isAssigned = story.assignedWorkerId !== null;

  return (
    <div className="flex items-start justify-between gap-4">
      {/* Left: Title, badges, and worker */}
      <div className="min-w-0 flex-1">
        <h1 data-testid="entity-heading" className="text-2xl font-semibold text-zinc-900">
          {story.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <PriorityBadge priority={story.priority} />
          {isDraft && <StatusBadge status="draft" />}
          <span data-testid="status-badge">
            <StatusBadge status={badgeStatus} />
          </span>
        </div>
        <div className="mt-2 text-sm">
          <span className="text-zinc-500">Assigned Worker: </span>
          {isAssigned && story.assignedWorkerId ? (
            <Link
              data-testid="assigned-worker"
              href={`/workers/${story.assignedWorkerId}`}
              className="text-indigo-600 hover:underline"
            >
              {workerName ?? story.assignedWorkerId}
            </Link>
          ) : (
            <span className="text-zinc-400">Unassigned</span>
          )}
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" onClick={onEditClick} disabled={!isDraft}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>

        {isDraft && (
          <Button onClick={onPublishClick}>
            <Send className="size-4" aria-hidden="true" />
            Publish
          </Button>
        )}

        {isAssigned && (
          <Button variant="outline" onClick={onUnassignClick}>
            <UserMinus className="size-4" aria-hidden="true" />
            Unassign
          </Button>
        )}

        {isFailed && (
          <Button variant="secondary" onClick={onResetClick}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset
          </Button>
        )}

        <DeleteStoryButton
          hasInProgressWork={isInProgress}
          onClick={onDeleteClick}
          variant="ghost"
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete story"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </DeleteStoryButton>
      </div>
    </div>
  );
};

/** Metadata grid displaying two-column key-value pairs. */
const MetadataGrid = ({ story, workerName }: { story: StoryData; workerName: string | null }) => {
  const isAssigned = story.assignedWorkerId !== null;

  // Calculate duration: assignedAt to completedAt (or now if in progress)
  let durationDisplay = '—';
  if (story.assignedAt) {
    const start = new Date(story.assignedAt).getTime();
    const end =
      story.completedAt != null
        ? new Date(story.completedAt).getTime()
        : story.workStatus === 'in_progress'
          ? Date.now()
          : new Date(story.updatedAt).getTime();
    durationDisplay = formatDuration(end - start);
  }

  const items: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'Priority',
      value: <PriorityBadge priority={story.priority} />,
    },
    {
      label: 'Status',
      value: <StatusBadge status={mapApiWorkStatus(story.workStatus)} />,
    },
    {
      label: 'Assigned Worker',
      value:
        isAssigned && story.assignedWorkerId ? (
          <Link
            href={`/workers/${story.assignedWorkerId}`}
            className="text-indigo-600 hover:underline"
          >
            {workerName ?? story.assignedWorkerId}
          </Link>
        ) : (
          <span className="text-zinc-400">Unassigned</span>
        ),
    },
    {
      label: 'Created',
      value: formatTimestamp(story.createdAt),
    },
    {
      label: 'Updated',
      value: formatTimestamp(story.updatedAt),
    },
    {
      label: 'Duration',
      value: durationDisplay,
    },
    {
      label: 'Token Cost',
      value: (
        <span className="font-mono">
          {story.costEstimate != null ? formatTokens(story.costEstimate) : '—'}
        </span>
      ),
    },
    {
      label: 'USD Cost',
      value: (
        <span className="font-mono">
          {story.actualCost != null ? formatCurrency(story.actualCost) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-caption text-zinc-500">{item.label}</dt>
          <dd className="mt-1 text-sm text-zinc-900">{item.value}</dd>
        </div>
      ))}
    </div>
  );
};

/** Error message display for failed stories. */
const ErrorDisplay = ({ message }: { message: string }) => (
  <div
    data-testid="failed-error-message"
    className="mt-6 rounded-md border border-red-200 bg-red-50 p-4"
  >
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
      <div>
        <h3 className="text-sm font-medium text-red-700">Error Message</h3>
        <p className="mt-1 text-sm whitespace-pre-wrap text-red-700">{message}</p>
      </div>
    </div>
  </div>
);

/** Implicit dependencies section showing stories this story depends on and blocks. */
const DependenciesSection = ({
  dependencies,
  projectId,
}: {
  dependencies: Array<{
    storyId: string;
    storyTitle: string;
    direction: 'depends_on' | 'blocks';
  }>;
  projectId: string;
}) => {
  if (dependencies.length === 0) {
    return null;
  }

  const dependsOn = dependencies.filter((d) => d.direction === 'depends_on');
  const blocks = dependencies.filter((d) => d.direction === 'blocks');

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-zinc-900">Implicit Dependencies</h2>

      {dependsOn.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium text-zinc-700">Depends On</h3>
          <ul className="mt-2 space-y-2">
            {dependsOn.map((dep) => (
              <li key={dep.storyId} className="flex items-center gap-2 text-sm">
                <span className="size-1.5 rounded-full bg-zinc-400" aria-hidden="true" />
                <Link
                  href={`/projects/${projectId}/stories/${dep.storyId}`}
                  className="text-indigo-600 hover:underline"
                >
                  {dep.storyTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium text-zinc-700">Blocks</h3>
          <ul className="mt-2 space-y-2">
            {blocks.map((dep) => (
              <li key={dep.storyId} className="flex items-center gap-2 text-sm">
                <span className="size-1.5 rounded-full bg-zinc-400" aria-hidden="true" />
                <Link
                  href={`/projects/${projectId}/stories/${dep.storyId}`}
                  className="text-indigo-600 hover:underline"
                >
                  {dep.storyTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/** Possible action dialogs that can be open at once. */
type ActiveDialog = 'publish' | 'reset' | 'unassign' | 'delete' | null;

const StoryDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const storyId = router.query.storyId as string;

  // Dialog state: tracks which action dialog is currently open
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);

  // Determine active tab from query param, defaulting to "overview"
  const activeTab = typeof router.query.tab === 'string' ? router.query.tab : 'overview';

  // Fetch story detail
  const { data: storyData, isLoading: storyLoading, isError: storyError } = useStory(storyId);
  const story = storyData?.data as StoryData | undefined;

  // Fetch epic for breadcrumb (only when story data is available)
  const epicId = story?.epicId ?? '';
  const { data: epicData } = useEpic(epicId);
  const epic = epicData?.data as { id: string; name: string } | undefined;

  // Fetch project for breadcrumb
  const { data: projectData } = useProject(projectId);
  const project = projectData?.data as { id: string; name: string } | undefined;

  // Fetch assigned worker name (only when a worker is assigned)
  const assignedWorkerId = story?.assignedWorkerId ?? '';
  const { data: workerData } = useWorker(assignedWorkerId);
  const workerName = (workerData?.data as { name: string } | undefined)?.name ?? null;

  // Fetch tasks for the story to get the task count for the delete dialog
  const { data: tasksData } = useTasks(storyId);
  const taskList = (tasksData as { data?: unknown[] } | undefined)?.data;
  const taskCount = Array.isArray(taskList) ? taskList.length : 0;

  // Fetch attempt history to detect if the story was recently reclaimed due to timeout.
  const { data: attemptHistory } = useStoryAttemptHistory(storyId);
  const hasTimedOutAttempt =
    Array.isArray(attemptHistory) && attemptHistory.some((a) => a.reason === 'timeout');

  // Handle tab switching with shallow routing
  const handleTabChange = (value: string) => {
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, tab: value },
      },
      undefined,
      { shallow: true },
    );
  };

  // Loading state
  if (storyLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // 404 state
  if (storyError || !story) {
    return <StoryNotFound />;
  }

  // Derive implicit dependencies from story data (if the API provides them)
  const storyRecord = story as unknown as Record<string, unknown>;
  const implicitDependencies = (
    Array.isArray(storyRecord.implicitDependencies) ? storyRecord.implicitDependencies : []
  ) as Array<{
    storyId: string;
    storyTitle: string;
    direction: 'depends_on' | 'blocks';
  }>;

  // Error message for failed stories
  const errorMessage =
    story.workStatus === 'failed'
      ? ((storyRecord.errorMessage as string | null | undefined) ?? null)
      : null;

  // Breadcrumb items
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    {
      label: project?.name ?? 'Project',
      href: `/projects/${projectId}`,
    },
    { label: 'Epics', href: `/projects/${projectId}?tab=epics` },
    {
      label: epic?.name ?? 'Epic',
      href: `/projects/${projectId}/epics/${epicId}`,
    },
    { label: 'Stories' },
    { label: story.title },
  ];

  // Action button handlers
  const handleEdit = () => {
    setEditModalOpen(true);
  };
  const handlePublish = () => {
    setActiveDialog('publish');
  };
  const handleUnassign = () => {
    setActiveDialog('unassign');
  };
  const handleReset = () => {
    setActiveDialog('reset');
  };
  const handleDelete = () => {
    setActiveDialog('delete');
  };
  const closeDialog = () => {
    setActiveDialog(null);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Header */}
      <StoryHeader
        story={story}
        workerName={workerName}
        onEditClick={handleEdit}
        onPublishClick={handlePublish}
        onUnassignClick={handleUnassign}
        onResetClick={handleReset}
        onDeleteClick={handleDelete}
      />

      {/* Read-only banner for in-progress stories */}
      {(story.workStatus === 'in_progress' ||
        story.workStatus === 'done' ||
        story.workStatus === 'review') && (
        <div
          data-testid="read-only-banner"
          className="mt-4 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm text-amber-700">
            This story is in read-only mode because it is currently{' '}
            {story.workStatus === 'done' ? 'complete' : 'in progress'}. Tasks and dependencies
            cannot be modified.
          </p>
        </div>
      )}

      {/* Timeout reclamation banner */}
      {hasTimedOutAttempt && (
        <div
          data-testid="timeout-reclamation-banner"
          className="mt-4 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <Clock className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-700">
              This story was timed out and reclaimed due to worker inactivity.
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              The previous worker assignment has been cleared. This story can be picked up by
              another worker.
            </p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="attempts">Attempt History</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          {/* Rendered description */}
          {story.description && (
            <div className="mt-6 max-w-[720px]">
              <MarkdownRenderer content={story.description} />
            </div>
          )}

          {/* Metadata grid */}
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Metadata</h2>
            <MetadataGrid story={story} workerName={workerName} />
          </div>

          {/* Error message display (only when failed) */}
          {errorMessage !== null && <ErrorDisplay message={errorMessage} />}

          {/* Implicit dependencies */}
          <DependenciesSection dependencies={implicitDependencies} projectId={projectId} />
        </TabsContent>

        {/* Tasks tab */}
        <TabsContent value="tasks">
          <StoryTasksTab
            storyId={storyId}
            projectId={projectId}
            storyWorkStatus={story.workStatus}
            readOnly={
              story.workStatus === 'in_progress' ||
              story.workStatus === 'done' ||
              story.workStatus === 'review'
            }
            onCreateTask={() => {
              setCreateTaskModalOpen(true);
            }}
          />
        </TabsContent>

        {/* Attempt History tab */}
        <TabsContent value="attempts">
          <StoryAttemptHistoryTab storyId={storyId} />
        </TabsContent>
      </Tabs>

      {/* Edit modal */}
      <CreateEditStoryModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        projectId={projectId}
        epicId={epicId}
        story={{
          id: story.id,
          epicId: story.epicId,
          title: story.title,
          description: story.description,
          priority: story.priority,
          version: story.version,
        }}
      />

      {/* Create task modal */}
      <CreateEditTaskModal
        open={createTaskModalOpen}
        onClose={() => {
          setCreateTaskModalOpen(false);
        }}
        storyId={storyId}
        projectId={projectId}
      />

      {/* Action flow dialogs */}
      <PublishStoryFlow
        projectId={projectId}
        epicId={epicId}
        storyId={storyId}
        storyTitle={story.title}
        open={activeDialog === 'publish'}
        onClose={closeDialog}
      />

      <ResetStoryFlow
        projectId={projectId}
        epicId={epicId}
        storyId={storyId}
        storyTitle={story.title}
        open={activeDialog === 'reset'}
        onClose={closeDialog}
      />

      <UnassignStoryFlow
        projectId={projectId}
        epicId={epicId}
        storyId={storyId}
        storyTitle={story.title}
        workerName={workerName ?? 'Unknown Worker'}
        open={activeDialog === 'unassign'}
        onClose={closeDialog}
      />

      <DeleteStoryFlow
        epicId={epicId}
        projectId={projectId}
        storyId={storyId}
        storyTitle={story.title}
        taskCount={taskCount}
        open={activeDialog === 'delete'}
        onClose={closeDialog}
      />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width.
 */
StoryDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default StoryDetailPage;
