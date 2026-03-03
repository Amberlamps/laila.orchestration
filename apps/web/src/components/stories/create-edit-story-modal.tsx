/**
 * Create / Edit Story Modal
 *
 * A combined dialog for creating new user stories (in Draft status) and editing
 * existing ones. Uses React Hook Form + Zod for validation and the
 * `useCreateStory` / `useUpdateStory` mutation hooks for API calls.
 *
 * Features:
 * - Title field (required, 1-200 chars) with live character counter
 * - Description field using MarkdownEditor with write/preview toggle
 * - Priority select (High, Medium, Low) with colored dot indicators
 * - Epic select grouped by work status with pre-selection and read-only in edit
 * - Mode-aware title, description, and submit button text
 * - Inline validation errors, loading state, success toast
 * - Unsaved-changes guard on backdrop close
 * - Form reset when modal opens/closes or story data changes
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useCreateStory, useEpics, useUpdateStory } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const storyFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Story title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low'], {
    required_error: 'Priority is required',
  }),
  epicId: z.string().min(1, 'Epic selection is required'),
});

type StoryFormData = z.infer<typeof storyFormSchema>;

// ---------------------------------------------------------------------------
// Priority options with colored dots
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', dotColor: 'bg-red-500' },
  { value: 'medium', label: 'Medium', dotColor: 'bg-amber-500' },
  { value: 'low', label: 'Low', dotColor: 'bg-green-500' },
] as const;

// ---------------------------------------------------------------------------
// Work status display labels for epic grouping
// ---------------------------------------------------------------------------

const WORK_STATUS_LABELS: Record<string, string> = {
  pending: 'Draft',
  blocked: 'Blocked',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
};

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface CreateEditStoryModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Project ID for fetching epics and cache invalidation context */
  projectId: string;
  /** Pre-selected epic ID (for creating from within an epic context) */
  epicId?: string;
  /** If provided, modal opens in edit mode with pre-filled values */
  story?: {
    id: string;
    epicId: string;
    title: string;
    description?: string | null;
    priority: string;
    version: number;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateEditStoryModal({
  open,
  onOpenChange,
  projectId,
  epicId: preselectedEpicId,
  story,
}: CreateEditStoryModalProps) {
  const isEditMode = !!story;
  const [apiError, setApiError] = useState<string | null>(null);

  // Determine the effective epic ID for mutations
  const effectiveEpicId = story?.epicId ?? preselectedEpicId ?? '';

  const createStoryMutation = useCreateStory(effectiveEpicId);
  const updateStoryMutation = useUpdateStory(story?.id ?? '', effectiveEpicId);

  // Fetch all epics for the project to populate the epic select
  const epicsQuery = useEpics(projectId, { limit: 100 });

  const form = useForm<StoryFormData>({
    resolver: zodResolver(storyFormSchema),
    defaultValues: {
      title: story?.title ?? '',
      description: story?.description ?? '',
      priority: (story?.priority as 'high' | 'medium' | 'low' | undefined) ?? 'medium',
      epicId: story?.epicId ?? preselectedEpicId ?? '',
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
  // Group epics by work status for the select dropdown
  // -------------------------------------------------------------------------

  const groupedEpics = useMemo(() => {
    const epics = epicsQuery.data?.data;
    if (!epics) return [];

    const groups = new Map<string, typeof epics>();

    for (const epic of epics) {
      const status = epic.workStatus;
      const existing = groups.get(status);
      if (existing) {
        existing.push(epic);
      } else {
        groups.set(status, [epic]);
      }
    }

    return Array.from(groups.entries()).map(([status, items]) => ({
      status,
      label: WORK_STATUS_LABELS[status] ?? status,
      epics: items,
    }));
  }, [epicsQuery.data?.data]);

  // Find the current epic name for read-only display in edit mode
  const currentEpicName = useMemo(() => {
    if (!story) return '';
    const epics = epicsQuery.data?.data;
    if (!epics) return '';
    const match = epics.find((e) => e.id === story.epicId);
    return match?.name ?? '';
  }, [story, epicsQuery.data?.data]);

  // -------------------------------------------------------------------------
  // Reset form when modal opens or story data changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      reset({
        title: story?.title ?? '',
        description: story?.description ?? '',
        priority: (story?.priority as 'high' | 'medium' | 'low' | undefined) ?? 'medium',
        epicId: story?.epicId ?? preselectedEpicId ?? '',
      });
      setApiError(null);
    }
  }, [
    open,
    story?.id,
    story?.title,
    story?.description,
    story?.priority,
    story?.epicId,
    preselectedEpicId,
    reset,
  ]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    reset();
    setApiError(null);
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const onSubmit = useCallback(
    (data: StoryFormData) => {
      setApiError(null);

      if (story) {
        updateStoryMutation.mutate(
          {
            title: data.title,
            description: data.description ?? null,
            priority: data.priority,
            version: story.version,
          },
          {
            onSuccess: () => {
              toast.success('Story Updated', 'Your changes have been saved.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      } else {
        createStoryMutation.mutate(
          {
            title: data.title,
            description: data.description ?? null,
            priority: data.priority,
            epicId: data.epicId,
            maxAttempts: 3,
          },
          {
            onSuccess: () => {
              toast.success('Story Created', 'Your new story has been created in Draft status.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      }
    },
    [story, createStoryMutation, updateStoryMutation, handleClose],
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
      } else {
        onOpenChange(true);
      }
    },
    [isDirty, handleClose, onOpenChange],
  );

  const isPending = isSubmitting || createStoryMutation.isPending || updateStoryMutation.isPending;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const modalTitle = isEditMode ? 'Edit Story' : 'Create Story';
  const modalDescription = isEditMode
    ? 'Update the story details below.'
    : 'Create a new story in Draft status. Fill in the details below.';
  const submitLabel = isEditMode ? 'Save Changes' : 'Create Story';
  const descriptionId = isEditMode ? 'edit-story-description' : 'create-story-description';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" aria-describedby={descriptionId}>
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
          className="space-y-5"
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
            <Label htmlFor="story-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="story-title"
              placeholder="e.g., User Login Flow"
              maxLength={200}
              aria-describedby={errors.title ? 'story-title-error' : 'story-title-counter'}
              aria-invalid={errors.title ? true : undefined}
              {...register('title')}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p id="story-title-error" className="text-[13px] text-red-500" role="alert">
                  {errors.title.message}
                </p>
              ) : (
                <span />
              )}
              <p id="story-title-counter" className="text-[13px] text-zinc-400">
                {String(titleLength)} / 200
              </p>
            </div>
          </div>

          {/* Description field */}
          <div className="space-y-1.5">
            <Label htmlFor="story-description">Description</Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Describe the user story requirements and expected behavior..."
                  minHeight={120}
                  {...(errors.description?.message ? { error: errors.description.message } : {})}
                />
              )}
            />
          </div>

          {/* Priority field */}
          <div className="space-y-1.5">
            <Label htmlFor="story-priority">
              Priority <span className="text-red-500">*</span>
            </Label>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="story-priority"
                    aria-invalid={errors.priority ? true : undefined}
                    onBlur={field.onBlur}
                  >
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${option.dotColor}`}
                            aria-hidden="true"
                          />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.priority && (
              <p className="text-[13px] text-red-500" role="alert">
                {errors.priority.message}
              </p>
            )}
          </div>

          {/* Epic field */}
          <div className="space-y-1.5">
            <Label htmlFor="story-epic">
              Epic <span className="text-red-500">*</span>
            </Label>
            {isEditMode ? (
              /* In edit mode, show the epic as read-only */
              <Input
                id="story-epic"
                value={currentEpicName}
                disabled
                readOnly
                aria-label="Parent epic (read-only)"
              />
            ) : (
              <Controller
                name="epicId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="story-epic"
                      aria-invalid={errors.epicId ? true : undefined}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Select an epic" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupedEpics.map((group) => (
                        <SelectGroup key={group.status}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.epics.map((epic) => (
                            <SelectItem key={epic.id} value={epic.id}>
                              {epic.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {errors.epicId && !isEditMode && (
              <p className="text-[13px] text-red-500" role="alert">
                {errors.epicId.message}
              </p>
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
