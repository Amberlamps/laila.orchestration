/**
 * Task detail page -- `/projects/{projectId}/tasks/{taskId}`
 *
 * Displays the complete task specification with:
 * - Breadcrumb navigation: Projects > {Project} > Epics > {Epic} > Stories > {Story} > Tasks > {Task}
 * - Header with title, work status badge, persona assignment, and read-only lock indicator
 * - Content sections in bordered cards: Description, Acceptance Criteria, Technical Notes,
 *   References, Dependencies, Persona (collapsible), and Metadata
 *
 * Layout: AppLayout with `variant="constrained"`.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `useTask`, `useStory`, `useEpic`, `useProject`, `usePersona` hooks.
 */
import { ArrowRight, ChevronDown, ChevronUp, FileQuestion, Lock, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { ErrorPage } from '@/components/error/error-page';
import { AppLayout } from '@/components/layout/app-layout';
import { CreateEditTaskModal } from '@/components/tasks/create-edit-task-modal';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useEpic, usePersona, useProject, useStory, useTask } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../../../_app';
import type { WorkStatus } from '@/components/ui/status-badge';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the task data returned by the API detail endpoint. */
interface TaskData {
  id: string;
  tenantId: string;
  userStoryId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  technicalNotes: string | null;
  personaId: string | null;
  workStatus: string;
  references: Array<{
    type: string;
    url: string;
    title: string;
  }>;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dependencies?: TaskSummary[];
  dependents?: TaskSummary[];
}

/** Summary shape for dependency/dependent tasks. */
interface TaskSummary {
  id: string;
  title: string;
  workStatus: string;
}

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
 * Determines if a task is in a read-only state.
 * Tasks that are in_progress or done should show a lock indicator.
 */
const isTaskReadOnly = (workStatus: string): boolean =>
  workStatus === 'in_progress' || workStatus === 'done' || workStatus === 'review';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton for the task detail page. */
const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading task details">
    {/* Breadcrumb skeleton */}
    <div className="mb-4">
      <Skeleton width="440px" height="14px" rounded="rounded-sm" />
    </div>

    {/* Header skeleton */}
    <div className="mb-6">
      <Skeleton width="320px" height="28px" rounded="rounded-sm" />
      <div className="mt-2 flex gap-2">
        <Skeleton width="80px" height="22px" rounded="rounded-sm" />
        <Skeleton width="100px" height="14px" rounded="rounded-sm" />
      </div>
    </div>

    {/* Card skeletons */}
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton width="120px" height="20px" rounded="rounded-sm" />
        </CardHeader>
        <CardContent>
          <SkeletonText lines={4} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton width="160px" height="20px" rounded="rounded-sm" />
        </CardHeader>
        <CardContent>
          <SkeletonText lines={3} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton width="100px" height="20px" rounded="rounded-sm" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton width="80px" height="12px" rounded="rounded-sm" />
                <Skeleton width="140px" height="16px" rounded="rounded-sm" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

/** 404 state when a task is not found. Uses the project's standard ErrorPage. */
const TaskNotFound = () => {
  const router = useRouter();
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <ErrorPage
      icon={FileQuestion}
      code="404"
      title="Task Not Found"
      description="The task you're looking for doesn't exist or has been deleted."
      primaryAction={{ label: 'Go to Dashboard', href: '/dashboard' }}
      secondaryAction={{ label: 'Go Back', onClick: handleGoBack }}
    />
  );
};

/** Description card section. */
const DescriptionCard = ({ content }: { content: string }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Description</CardTitle>
    </CardHeader>
    <CardContent>
      <MarkdownRenderer content={content} />
    </CardContent>
  </Card>
);

/** Acceptance criteria card with zinc-50 background. */
const AcceptanceCriteriaCard = ({ criteria }: { criteria: string[] }) => {
  // Convert string array to Markdown checklist for rendering
  const markdownContent = criteria.map((item) => `- ${item}`).join('\n');

  return (
    <Card className="bg-zinc-50">
      <CardHeader>
        <CardTitle className="text-lg">Acceptance Criteria</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownRenderer content={markdownContent} />
      </CardContent>
    </Card>
  );
};

/** Technical notes card (hidden when empty). */
const TechnicalNotesCard = ({ content }: { content: string }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Technical Notes</CardTitle>
    </CardHeader>
    <CardContent>
      <MarkdownRenderer content={content} />
    </CardContent>
  </Card>
);

/** References card (hidden when empty). */
const ReferencesCard = ({
  references,
}: {
  references: Array<{ type: string; url: string; title: string }>;
}) => {
  // Convert references to Markdown links for rendering
  const markdownContent = references
    .map((ref) => `- [${ref.title}](${ref.url}) (${ref.type})`)
    .join('\n');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">References</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownRenderer content={markdownContent} />
      </CardContent>
    </Card>
  );
};

/** Dependencies card showing "Depends on" and "Blocks" lists. */
const DependenciesCard = ({
  dependencies,
  dependents,
  projectId,
}: {
  dependencies: TaskSummary[];
  dependents: TaskSummary[];
  projectId: string;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Dependencies</CardTitle>
    </CardHeader>
    <CardContent>
      {dependencies.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-700">Depends on</h4>
          <ul className="mt-2 space-y-2">
            {dependencies.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2 text-sm">
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                <Link
                  href={`/projects/${projectId}/tasks/${dep.id}`}
                  className="text-indigo-600 hover:underline"
                >
                  {dep.title}
                </Link>
                <StatusBadge status={mapApiWorkStatus(dep.workStatus)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {dependents.length > 0 && (
        <div className={dependencies.length > 0 ? 'mt-4' : ''}>
          <h4 className="text-sm font-medium text-zinc-700">Blocks</h4>
          <ul className="mt-2 space-y-2">
            {dependents.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2 text-sm">
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                <Link
                  href={`/projects/${projectId}/tasks/${dep.id}`}
                  className="text-indigo-600 hover:underline"
                >
                  {dep.title}
                </Link>
                <StatusBadge status={mapApiWorkStatus(dep.workStatus)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardContent>
  </Card>
);

/** Collapsible persona card. Default state: collapsed (shows title only). */
const PersonaCard = ({
  personaId,
  personaTitle,
  personaDescription,
}: {
  personaId: string;
  personaTitle: string;
  personaDescription: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Assigned Persona</CardTitle>
          <button
            type="button"
            onClick={() => {
              setIsExpanded((prev) => !prev);
            }}
            className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse persona details' : 'Expand persona details'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <h3 className="text-base font-semibold text-zinc-900">
          <Link href={`/personas/${personaId}`} className="text-indigo-600 hover:underline">
            {personaTitle}
          </Link>
        </h3>
        {isExpanded && (
          <div className="mt-3">
            <MarkdownRenderer content={personaDescription} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** Metadata card with two-column grid. */
const MetadataCard = ({
  task,
  storyTitle,
  storyId,
  epicTitle,
  epicId,
  projectId,
}: {
  task: TaskData;
  storyTitle: string;
  storyId: string;
  epicTitle: string;
  epicId: string;
  projectId: string;
}) => {
  const items: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'ID',
      value: <span className="font-mono text-sm text-zinc-900">{task.id}</span>,
    },
    {
      label: 'Parent Story',
      value: (
        <Link
          href={`/projects/${projectId}/stories/${storyId}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          {storyTitle}
        </Link>
      ),
    },
    {
      label: 'Parent Epic',
      value: (
        <Link
          href={`/projects/${projectId}/epics/${epicId}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          {epicTitle}
        </Link>
      ),
    },
    {
      label: 'Created',
      value: <span className="text-sm text-zinc-900">{formatTimestamp(task.createdAt)}</span>,
    },
    {
      label: 'Updated',
      value: <span className="text-sm text-zinc-900">{formatTimestamp(task.updatedAt)}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Metadata</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-caption text-zinc-500">{item.label}</dt>
              <dd className="mt-1">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const TaskDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const taskId = router.query.taskId as string;
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Fetch task detail
  const { data: taskData, isLoading: taskLoading, isError: taskError } = useTask(taskId);
  const task = taskData?.data as TaskData | undefined;

  // Fetch parent story for breadcrumb and metadata
  const storyId = task?.userStoryId ?? '';
  const { data: storyData } = useStory(storyId);
  const story = storyData?.data as { id: string; title: string; epicId: string } | undefined;

  // Fetch epic for breadcrumb and metadata
  const epicId = story?.epicId ?? '';
  const { data: epicData } = useEpic(epicId);
  const epic = epicData?.data as { id: string; name: string } | undefined;

  // Fetch project for breadcrumb
  const { data: projectData } = useProject(projectId);
  const project = projectData?.data as { id: string; name: string } | undefined;

  // Fetch persona if assigned
  const personaId = task?.personaId ?? '';
  const { data: personaData } = usePersona(personaId);
  const persona = personaData?.data as
    | { id: string; title: string; description: string }
    | undefined;

  // Loading state
  if (taskLoading || !router.isReady) {
    return <DetailSkeleton />;
  }

  // 404 state
  if (taskError || !task) {
    return <TaskNotFound />;
  }

  // Extract dependencies and dependents from task response
  const taskRecord = task as unknown as Record<string, unknown>;
  const dependencies = (
    Array.isArray(taskRecord.dependencies) ? taskRecord.dependencies : []
  ) as TaskSummary[];
  const dependents = (
    Array.isArray(taskRecord.dependents) ? taskRecord.dependents : []
  ) as TaskSummary[];

  const hasDependencies = dependencies.length > 0 || dependents.length > 0;
  const badgeStatus = mapApiWorkStatus(task.workStatus);
  const readOnly = isTaskReadOnly(task.workStatus);

  // Determine if optional sections should be visible
  const hasTechnicalNotes = task.technicalNotes !== null && task.technicalNotes !== '';
  const hasReferences = task.references.length > 0;
  const hasPersona = task.personaId !== null && persona !== undefined;

  // Breadcrumb items (full hierarchy)
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    {
      label: project?.name ?? '...',
      href: `/projects/${projectId}`,
    },
    { label: 'Epics', href: `/projects/${projectId}?tab=epics` },
    {
      label: epic?.name ?? '...',
      href: `/projects/${projectId}/epics/${epicId}`,
    },
    {
      label: 'Stories',
      href: `/projects/${projectId}/epics/${epicId}?tab=stories`,
    },
    {
      label: story?.title ?? '...',
      href: `/projects/${projectId}/stories/${storyId}`,
    },
    { label: 'Tasks', href: `/projects/${projectId}/stories/${storyId}?tab=tasks` },
    { label: task.title },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">{task.title}</h1>
            {readOnly && (
              <Lock
                className="h-5 w-5 text-zinc-400"
                aria-label="Read-only: task is in progress or complete"
              />
            )}
          </div>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditModalOpen(true);
              }}
            >
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={badgeStatus} />
          <span className="text-sm">
            <span className="text-zinc-500">Persona: </span>
            {task.personaId !== null && persona ? (
              <Link
                href={`/personas/${task.personaId}`}
                className="text-indigo-600 hover:underline"
              >
                {persona.title}
              </Link>
            ) : (
              <span className="text-zinc-400">No persona</span>
            )}
          </span>
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-6">
        {/* Description card */}
        {task.description !== null && task.description !== '' && (
          <DescriptionCard content={task.description} />
        )}

        {/* Acceptance criteria card (zinc-50 background) */}
        {task.acceptanceCriteria.length > 0 && (
          <AcceptanceCriteriaCard criteria={task.acceptanceCriteria} />
        )}

        {/* Technical notes card (hidden when empty) */}
        {hasTechnicalNotes && <TechnicalNotesCard content={task.technicalNotes as string} />}

        {/* References card (hidden when empty) */}
        {hasReferences && <ReferencesCard references={task.references} />}

        {/* Dependencies card (hidden when no dependencies in either direction) */}
        {hasDependencies && (
          <DependenciesCard
            dependencies={dependencies}
            dependents={dependents}
            projectId={projectId}
          />
        )}

        {/* Persona card (collapsible) */}
        {hasPersona && (
          <PersonaCard
            personaId={task.personaId as string}
            personaTitle={persona.title}
            personaDescription={persona.description}
          />
        )}

        {/* Metadata card */}
        <MetadataCard
          task={task}
          storyTitle={story?.title ?? '...'}
          storyId={storyId}
          epicTitle={epic?.name ?? '...'}
          epicId={epicId}
          projectId={projectId}
        />
      </div>

      {/* Edit task modal */}
      <CreateEditTaskModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
        }}
        storyId={storyId}
        projectId={projectId}
        task={{
          id: task.id,
          title: task.title,
          description: task.description ?? undefined,
          acceptanceCriteria: task.acceptanceCriteria.join('\n'),
          technicalNotes: task.technicalNotes ?? undefined,
          references: task.references
            .map((ref) => `- [${ref.title}](${ref.url}) (${ref.type})`)
            .join('\n'),
          personaId: task.personaId ?? undefined,
          dependencyIds: dependencies.map((d) => d.id),
          version: task.version,
        }}
      />
    </div>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="constrained"`
 * for detail page content width.
 */
TaskDetailPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="constrained">{page}</AppLayout>
  </ProtectedRoute>
);

export default TaskDetailPage;
