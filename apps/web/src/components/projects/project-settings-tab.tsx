/**
 * Project Settings Tab
 *
 * Settings tab content for the project detail page, organized into four
 * sections: General, Orchestration, Lifecycle, and Danger Zone.
 *
 * - General: Editable Name + Description, read-only StatusBadge
 * - Orchestration: Worker inactivity timeout (number, 5-1440 min)
 * - Lifecycle: Publish / Revert to Draft buttons (status-gated)
 * - Danger Zone: Delete project with DeleteProjectFlow
 *
 * Uses React Hook Form + Zod for validation and partial update via
 * `useUpdateProject`. Warns on unsaved changes before navigation.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Undo2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DeleteProjectButton, DeleteProjectFlow } from '@/components/projects/delete-project-flow';
import { PublishProjectFlow } from '@/components/projects/publish-project-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/components/ui/toast';
import { useUpdateProject } from '@/lib/query-hooks';

import type { WorkStatus } from '@/components/ui/status-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  lifecycleStatus: string;
  workStatus: string;
  version: number;
  workerInactivityTimeoutMinutes?: number;
  totalEpics?: number;
  totalStories?: number;
  totalTasks?: number;
}

interface ProjectSettingsTabProps {
  project: ProjectData;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const generalSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(200, 'Project name must be 200 characters or fewer'),
  description: z.string().optional(),
});

type GeneralFormData = z.infer<typeof generalSchema>;

const orchestrationSchema = z.object({
  workerInactivityTimeoutMinutes: z
    .number({ invalid_type_error: 'Timeout must be a number' })
    .int('Timeout must be a whole number')
    .min(5, 'Minimum timeout is 5 minutes')
    .max(1440, 'Maximum timeout is 1440 minutes (24 hours)'),
});

type OrchestrationFormData = z.infer<typeof orchestrationSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapApiWorkStatus(apiStatus: string): WorkStatus {
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
}

function getLifecycleLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'planning':
      return 'Planning';
    case 'ready':
      return 'Ready';
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// General Section
// ---------------------------------------------------------------------------

function GeneralSection({
  project,
  onDirtyChange,
}: ProjectSettingsTabProps & { onDirtyChange: (dirty: boolean) => void }) {
  const updateProject = useUpdateProject(project.id);

  const form = useForm<GeneralFormData>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      name: project.name,
      description: project.description ?? '',
    },
    mode: 'onBlur',
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isDirty },
  } = form;

  // Propagate dirty state to parent for navigation guard
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Reset form when project data changes (e.g., after a save)
  useEffect(() => {
    reset({
      name: project.name,
      description: project.description ?? '',
    });
  }, [project.name, project.description, reset]);

  const handleNameBlur = useCallback(() => {
    if (!dirtyFields.name) return;

    void handleSubmit((data) => {
      updateProject.mutate(
        { name: data.name, version: project.version },
        {
          onSuccess: () => {
            toast.success('Name Updated', 'Project name has been saved.');
          },
          onError: (error: Error) => {
            toast.error('Update Failed', error.message);
          },
        },
      );
    })();
  }, [dirtyFields.name, handleSubmit, updateProject, project.version]);

  const handleDescriptionSave = useCallback(() => {
    void handleSubmit((data) => {
      updateProject.mutate(
        { description: data.description ?? null, version: project.version },
        {
          onSuccess: () => {
            toast.success('Description Updated', 'Project description has been saved.');
          },
          onError: (error: Error) => {
            toast.error('Update Failed', error.message);
          },
        },
      );
    })();
  }, [handleSubmit, updateProject, project.version]);

  const badgeStatus = mapApiWorkStatus(project.workStatus);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
        <CardDescription className="text-[13px] text-zinc-500">
          Basic project information including name, description, and current status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name field */}
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Name</Label>
          <Input
            id="settings-name"
            maxLength={200}
            aria-describedby={errors.name ? 'settings-name-error' : undefined}
            aria-invalid={errors.name ? true : undefined}
            {...register('name', {
              onBlur: handleNameBlur,
            })}
          />
          {errors.name && (
            <p id="settings-name-error" className="text-[13px] text-red-500" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Description field */}
        <div className="space-y-1.5">
          <Label htmlFor="settings-description">Description</Label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <MarkdownEditor
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                placeholder="Describe your project goals, scope, and key objectives..."
                minHeight={120}
                {...(errors.description?.message ? { error: errors.description.message } : {})}
              />
            )}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleDescriptionSave}
              disabled={!dirtyFields.description}
              loading={updateProject.isPending}
            >
              Save Description
            </Button>
          </div>
        </div>

        {/* Status (read-only) */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <div>
            <StatusBadge status={badgeStatus} />
          </div>
          <p className="text-[13px] text-zinc-400">
            Work status is derived from the project lifecycle and task progress.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Orchestration Section
// ---------------------------------------------------------------------------

function OrchestrationSection({ project }: ProjectSettingsTabProps) {
  const updateProject = useUpdateProject(project.id);

  const form = useForm<OrchestrationFormData>({
    resolver: zodResolver(orchestrationSchema),
    defaultValues: {
      workerInactivityTimeoutMinutes: project.workerInactivityTimeoutMinutes ?? 30,
    },
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  // Reset form when project data changes (e.g., after a save)
  useEffect(() => {
    reset({
      workerInactivityTimeoutMinutes: project.workerInactivityTimeoutMinutes ?? 30,
    });
  }, [project.workerInactivityTimeoutMinutes, reset]);

  const handleSave = useCallback(() => {
    void handleSubmit((data) => {
      updateProject.mutate(
        {
          version: project.version,
          workerInactivityTimeoutMinutes: data.workerInactivityTimeoutMinutes,
        } as Record<string, unknown> as Parameters<typeof updateProject.mutate>[0],
        {
          onSuccess: () => {
            toast.success('Orchestration Updated', 'Worker timeout settings have been saved.');
          },
          onError: (error: Error) => {
            toast.error('Update Failed', error.message);
          },
        },
      );
    })();
  }, [handleSubmit, updateProject, project.version]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orchestration</CardTitle>
        <CardDescription className="text-[13px] text-zinc-500">
          Configure how workers interact with this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-timeout">Worker Inactivity Timeout</Label>
          <div className="flex items-center gap-2">
            <Input
              id="settings-timeout"
              type="number"
              min={5}
              max={1440}
              className="w-28"
              aria-describedby={
                errors.workerInactivityTimeoutMinutes
                  ? 'settings-timeout-error'
                  : 'settings-timeout-help'
              }
              aria-invalid={errors.workerInactivityTimeoutMinutes ? true : undefined}
              {...register('workerInactivityTimeoutMinutes', { valueAsNumber: true })}
            />
            <span className="text-sm text-zinc-500">minutes</span>
          </div>
          {errors.workerInactivityTimeoutMinutes ? (
            <p id="settings-timeout-error" className="text-[13px] text-red-500" role="alert">
              {errors.workerInactivityTimeoutMinutes.message}
            </p>
          ) : (
            <p id="settings-timeout-help" className="text-[13px] text-zinc-400">
              Workers will be automatically unassigned after this period of inactivity. Valid range:
              5 to 1440 minutes (24 hours).
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty}
            loading={updateProject.isPending}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle Section
// ---------------------------------------------------------------------------

function LifecycleSection({ project }: ProjectSettingsTabProps) {
  const updateProject = useUpdateProject(project.id);
  const [publishFlowOpen, setPublishFlowOpen] = useState(false);

  const isDraft = project.lifecycleStatus === 'draft' || project.lifecycleStatus === 'planning';
  const isReady = project.lifecycleStatus === 'ready';
  const hasInProgressWork = project.workStatus === 'in_progress' || project.workStatus === 'review';
  const canRevert = isReady && !hasInProgressWork;
  const lifecycleLabel = getLifecycleLabel(project.lifecycleStatus);

  const handleRevertToDraft = useCallback(() => {
    updateProject.mutate(
      { lifecycleStatus: 'draft', version: project.version },
      {
        onSuccess: () => {
          toast.success('Reverted to Draft', 'The project has been reverted to Draft status.');
        },
        onError: (error: Error) => {
          toast.error('Revert Failed', error.message);
        },
      },
    );
  }, [updateProject, project.version]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lifecycle</CardTitle>
          <CardDescription className="text-[13px] text-zinc-500">
            Manage the project lifecycle status and transitions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm text-zinc-700">
              Current lifecycle status: <span className="font-semibold">{lifecycleLabel}</span>
            </p>
            {isDraft && (
              <p className="text-[13px] text-zinc-400">
                Publishing this project will validate all child entities and transition it to Ready
                status, making it available for work assignment.
              </p>
            )}
            {isReady && !hasInProgressWork && (
              <p className="text-[13px] text-zinc-400">
                Reverting to Draft will remove this project from active work assignment.
              </p>
            )}
            {isReady && hasInProgressWork && (
              <p className="text-[13px] text-zinc-400">
                Cannot revert to Draft while work is in progress. Stop all active workers first.
              </p>
            )}
            {!isDraft && !isReady && (
              <p className="text-[13px] text-zinc-400">
                No lifecycle transitions are available in the current state.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            {isDraft && (
              <Button
                type="button"
                onClick={() => {
                  setPublishFlowOpen(true);
                }}
              >
                <Send className="size-4" aria-hidden="true" />
                Publish
              </Button>
            )}
            {canRevert && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRevertToDraft}
                loading={updateProject.isPending}
              >
                <Undo2 className="size-4" aria-hidden="true" />
                Revert to Draft
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Publish validation flow dialog */}
      <PublishProjectFlow
        projectId={project.id}
        projectName={project.name}
        open={publishFlowOpen}
        onClose={() => {
          setPublishFlowOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone Section
// ---------------------------------------------------------------------------

function DangerZoneSection({ project }: ProjectSettingsTabProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const hasInProgressWork = project.workStatus === 'in_progress' || project.workStatus === 'review';

  return (
    <>
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <CardTitle className="text-base text-red-700">Danger Zone</CardTitle>
          <CardDescription className="text-[13px] text-red-600/70">
            Irreversible actions that permanently affect this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-900">Delete this project</p>
              <p className="text-[13px] text-zinc-500">
                Permanently delete this project and all associated epics, stories, and tasks.
              </p>
            </div>
            <DeleteProjectButton
              hasInProgressWork={hasInProgressWork}
              onClick={() => {
                setDeleteDialogOpen(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <DeleteProjectFlow
        projectId={project.id}
        projectName={project.name}
        entityCounts={{
          epics: project.totalEpics ?? 0,
          stories: project.totalStories ?? 0,
          tasks: project.totalTasks ?? 0,
        }}
        hasInProgressWork={hasInProgressWork}
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProjectSettingsTab({ project }: ProjectSettingsTabProps) {
  const router = useRouter();

  // Track whether the general form has unsaved changes for navigation guard
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Warn on browser close/refresh with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Warn on Next.js route change with unsaved changes
  useEffect(() => {
    const handleRouteChange = () => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to leave?',
        );
        if (!confirmed) {
          router.events.emit('routeChangeError');
          throw new Error('Route change aborted due to unsaved changes');
        }
      }
    };

    router.events.on('routeChangeStart', handleRouteChange);
    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [hasUnsavedChanges, router.events]);

  return (
    <div className="space-y-6 py-6">
      <GeneralSection project={project} onDirtyChange={setHasUnsavedChanges} />
      <OrchestrationSection project={project} />
      <LifecycleSection project={project} />
      <DangerZoneSection project={project} />
    </div>
  );
}
