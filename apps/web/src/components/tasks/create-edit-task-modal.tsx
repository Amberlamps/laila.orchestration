/**
 * Create / Edit Task Modal
 *
 * A combined dialog for creating new tasks (in Draft status) and editing
 * existing ones. This is the most complex form in the application, with
 * multiple Markdown editors and a dependency picker integration point.
 *
 * Uses React Hook Form + Zod for validation and the `useCreateTask` /
 * `useUpdateTask` mutation hooks for API calls.
 *
 * Features:
 * - Title field (required, 1-200 chars) with live character counter
 * - Description field using MarkdownEditor
 * - Acceptance Criteria field using MarkdownEditor with publish help text
 * - Technical Notes field using MarkdownEditor (optional, collapsible)
 * - References field using MarkdownEditor (optional, collapsible)
 * - Persona select showing all personas with title and description preview
 * - Dependencies section using TaskDependencyPicker (placeholder for Wave 3)
 * - Mode-aware title, description, and submit button text
 * - Inline validation errors, loading state, success toast
 * - Unsaved-changes guard on backdrop close
 * - Form reset when modal opens/closes or task data changes
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useCreateTask, usePersonas, useUpdateTask } from '@/lib/query-hooks';

import { TaskDependencyPicker } from './task-dependency-picker';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const taskFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Task title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  technicalNotes: z.string().optional(),
  references: z.string().optional(),
  personaId: z.string().min(1, 'Persona is required'),
  dependencyIds: z.array(z.string()),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

// ---------------------------------------------------------------------------
// Helper: truncate persona description for the select dropdown
// ---------------------------------------------------------------------------

function truncateDescription(description: string | undefined | null, maxLength = 60): string {
  if (!description) return '';
  const firstLine = description.split('\n')[0] ?? '';
  if (firstLine.length <= maxLength) return firstLine;
  return firstLine.slice(0, maxLength) + '...';
}

/**
 * Parse Markdown-style links into structured TaskReference objects.
 * Matches patterns like: `- [Title](url) (type)` or `[Title](url)`
 * Lines that don't match are treated as references with a "doc" type
 * and the line text used as both title and URL if it looks like a URL.
 */
const MARKDOWN_LINK_RE = /\[([^\]]+)]\(([^)]+)\)(?:\s*\(([^)]*)\))?/;

function parseReferences(markdown: string): Array<{ type: string; url: string; title: string }> {
  if (!markdown.trim()) return [];

  const refs: Array<{ type: string; url: string; title: string }> = [];
  const lines = markdown.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-*]\s*/, '').trim();
    if (!line) continue;

    const match = MARKDOWN_LINK_RE.exec(line);
    if (match) {
      const title = match[1] ?? '';
      const url = match[2] ?? '';
      const type = match[3]?.trim() || 'doc';
      if (title && url) {
        refs.push({ type, url, title });
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface CreateEditTaskModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Story ID for creating new tasks and cache invalidation */
  storyId: string;
  /** Project ID for the dependency picker scope */
  projectId: string;
  /** If provided, modal opens in edit mode with pre-filled values */
  task?: {
    id: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    technicalNotes?: string;
    references?: string;
    personaId?: string;
    dependencyIds: string[];
    version: number;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateEditTaskModal({
  open,
  onClose,
  storyId,
  projectId,
  task,
}: CreateEditTaskModalProps) {
  const isEditMode = !!task;
  const [apiError, setApiError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createTaskMutation = useCreateTask(storyId);
  const updateTaskMutation = useUpdateTask(task?.id ?? '', storyId);

  // Fetch personas for the persona select dropdown
  const personasQuery = usePersonas({ limit: 100 });

  const personas = useMemo(() => {
    const data = personasQuery.data as
      | { data: Array<{ id: string; title: string; description: string }> }
      | undefined;
    return data?.data ?? [];
  }, [personasQuery.data]);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      acceptanceCriteria: task?.acceptanceCriteria ?? '',
      technicalNotes: task?.technicalNotes ?? '',
      references: task?.references ?? '',
      personaId: task?.personaId ?? '',
      dependencyIds: task?.dependencyIds ?? [],
    },
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty, isValid },
  } = form;

  const titleValue = watch('title');
  const titleLength = titleValue.length;

  // -------------------------------------------------------------------------
  // Reset form when modal opens or task data changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      reset({
        title: task?.title ?? '',
        description: task?.description ?? '',
        acceptanceCriteria: task?.acceptanceCriteria ?? '',
        technicalNotes: task?.technicalNotes ?? '',
        references: task?.references ?? '',
        personaId: task?.personaId ?? '',
        dependencyIds: task?.dependencyIds ?? [],
      });
      setApiError(null);

      // Expand advanced section if task has technical notes or references
      if (task?.technicalNotes || task?.references) {
        setShowAdvanced(true);
      } else {
        setShowAdvanced(false);
      }
    }
  }, [
    open,
    task?.id,
    task?.title,
    task?.description,
    task?.acceptanceCriteria,
    task?.technicalNotes,
    task?.references,
    task?.personaId,
    task?.dependencyIds,
    reset,
  ]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    reset();
    setApiError(null);
    onClose();
  }, [reset, onClose]);

  const onSubmit = useCallback(
    (data: TaskFormData) => {
      setApiError(null);

      const parsedReferences = parseReferences(data.references ?? '');

      if (task) {
        // Edit mode — send UpdateTask payload
        updateTaskMutation.mutate(
          {
            title: data.title,
            description: data.description ?? null,
            ...(data.acceptanceCriteria
              ? { acceptanceCriteria: [data.acceptanceCriteria] }
              : { acceptanceCriteria: [] }),
            technicalNotes: data.technicalNotes ?? null,
            ...(data.personaId ? { personaId: data.personaId } : { personaId: null }),
            references: parsedReferences,
            version: task.version,
          },
          {
            onSuccess: () => {
              toast.success('Task Updated', 'Your changes have been saved.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      } else {
        // Create mode — send CreateTask payload
        createTaskMutation.mutate(
          {
            title: data.title,
            ...(data.description ? { description: data.description } : {}),
            acceptanceCriteria: data.acceptanceCriteria ? [data.acceptanceCriteria] : [],
            ...(data.technicalNotes ? { technicalNotes: data.technicalNotes } : {}),
            ...(data.personaId ? { personaId: data.personaId } : {}),
            references: parsedReferences,
          },
          {
            onSuccess: () => {
              toast.success('Task Created', 'Your new task has been created.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      }
    },
    [task, createTaskMutation, updateTaskMutation, handleClose],
  );

  /**
   * Intercept backdrop / escape-key close attempts.
   * If the form has unsaved changes, show a confirmation dialog.
   * Otherwise, close normally.
   */
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isDirty) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to close?',
        );
        if (!confirmed) return;
      }

      if (!nextOpen) {
        handleClose();
      }
    },
    [isDirty, handleClose],
  );

  const isPending = isSubmitting || createTaskMutation.isPending || updateTaskMutation.isPending;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const modalTitle = isEditMode ? 'Edit Task' : 'Create Task';
  const modalDescription = isEditMode
    ? 'Update the task details below.'
    : 'Create a new task. Fill in the details below.';
  const submitLabel = isEditMode ? 'Save Changes' : 'Create Task';
  const descriptionId = isEditMode ? 'edit-task-description' : 'create-task-description';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="lg"
        aria-describedby={descriptionId}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <DialogHeader>
          <DialogTitle asChild>
            <h3>{modalTitle}</h3>
          </DialogTitle>
          <DialogDescription id={descriptionId}>{modalDescription}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          noValidate
          className="space-y-5 overflow-y-auto"
        >
          {/* API error alert */}
          {apiError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              <p className="text-[13px] leading-snug text-red-700">{apiError}</p>
            </div>
          )}

          {/* Title field */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="task-title"
              placeholder="e.g., Implement user login form with email/password fields"
              maxLength={200}
              aria-describedby={errors.title ? 'task-title-error' : 'task-title-counter'}
              aria-invalid={errors.title ? true : undefined}
              {...register('title')}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p id="task-title-error" className="text-[13px] text-red-500" role="alert">
                  {errors.title.message}
                </p>
              ) : (
                <span />
              )}
              <p id="task-title-counter" className="text-[13px] text-zinc-400">
                {String(titleLength)} / 200
              </p>
            </div>
          </div>

          {/* Description field */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Describe what needs to be done..."
                  minHeight={100}
                />
              )}
            />
          </div>

          {/* Acceptance Criteria field */}
          <div className="space-y-1.5">
            <Label>Acceptance Criteria</Label>
            <Controller
              name="acceptanceCriteria"
              control={control}
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Define the criteria that must be met for this task to be considered complete..."
                  minHeight={100}
                />
              )}
            />
            <p className="text-[13px] text-zinc-400">
              Required before the parent story can be published.
            </p>
          </div>

          {/* Persona field */}
          <div className="space-y-1.5">
            <Label htmlFor="task-persona">
              Persona <span className="text-red-500">*</span>
            </Label>
            <Controller
              name="personaId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="task-persona"
                    aria-invalid={errors.personaId ? true : undefined}
                    onBlur={field.onBlur}
                  >
                    <SelectValue placeholder="Select a persona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={persona.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{persona.title}</span>
                          {persona.description ? (
                            <span className="text-muted-foreground text-sm">
                              {truncateDescription(persona.description)}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.personaId && (
              <p className="text-[13px] text-red-500" role="alert">
                {errors.personaId.message}
              </p>
            )}
          </div>

          {/* Dependencies section */}
          <div className="space-y-1.5">
            <Label>Dependencies</Label>
            <Controller
              name="dependencyIds"
              control={control}
              render={({ field }) => (
                <TaskDependencyPicker
                  currentTaskId={task?.id}
                  projectId={projectId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {/* Collapsible advanced fields */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
              onClick={() => {
                setShowAdvanced(!showAdvanced);
              }}
            >
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              {showAdvanced ? 'Hide' : 'Show'} advanced fields
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5">
                {/* Technical Notes field */}
                <div className="space-y-1.5">
                  <Label>Technical Notes</Label>
                  <Controller
                    name="technicalNotes"
                    control={control}
                    render={({ field }) => (
                      <MarkdownEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        placeholder="Any technical implementation guidance, code patterns, or architecture notes..."
                        minHeight={100}
                      />
                    )}
                  />
                </div>

                {/* References field */}
                <div className="space-y-1.5">
                  <Label>References</Label>
                  <Controller
                    name="references"
                    control={control}
                    render={({ field }) => (
                      <MarkdownEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        placeholder="Links to design specs, documentation, related PRs, or external resources..."
                        minHeight={100}
                      />
                    )}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isPending} loading={isPending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
