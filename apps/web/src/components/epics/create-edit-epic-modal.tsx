/**
 * Create / Edit Epic Modal
 *
 * A combined dialog for creating new epics (in Draft status) and editing
 * existing ones. Uses React Hook Form + Zod for validation and the
 * `useCreateEpic` / `useUpdateEpic` mutation hooks for API calls.
 *
 * Features:
 * - Title field (required, 1-200 chars) with live character counter
 * - Description field using MarkdownEditor with write/preview toggle
 * - Project context auto-set from parent project (not user-selectable)
 * - Mode-aware title, description, and submit button text
 * - Inline validation errors, loading state, success toast
 * - Unsaved-changes guard on backdrop close
 * - Form reset when modal opens/closes or epic data changes
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { toast } from '@/components/ui/toast';
import { useCreateEpic, useUpdateEpic } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const epicFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Epic title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: z.string().optional(),
});

type EpicFormData = z.infer<typeof epicFormSchema>;

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface CreateEditEpicModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Project ID for creating new epics or context for cache invalidation */
  projectId: string;
  /** If provided, modal opens in edit mode with pre-filled values */
  epic?: {
    id: string;
    name: string;
    description?: string | null;
    version: number;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateEditEpicModal({
  open,
  onOpenChange,
  projectId,
  epic,
}: CreateEditEpicModalProps) {
  const isEditMode = !!epic;
  const [apiError, setApiError] = useState<string | null>(null);

  const createEpicMutation = useCreateEpic(projectId);
  const updateEpicMutation = useUpdateEpic(epic?.id ?? '', projectId);

  const form = useForm<EpicFormData>({
    resolver: zodResolver(epicFormSchema),
    defaultValues: {
      title: epic?.name ?? '',
      description: epic?.description ?? '',
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
  // Reset form when modal opens or epic data changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      reset({
        title: epic?.name ?? '',
        description: epic?.description ?? '',
      });
      setApiError(null);
    }
  }, [open, epic?.id, epic?.name, epic?.description, reset]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    reset();
    setApiError(null);
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const onSubmit = useCallback(
    (data: EpicFormData) => {
      setApiError(null);

      if (epic) {
        updateEpicMutation.mutate(
          {
            name: data.title,
            description: data.description ?? null,
            version: epic.version,
          },
          {
            onSuccess: () => {
              toast.success('Epic Updated', 'Your changes have been saved.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      } else {
        createEpicMutation.mutate(
          {
            name: data.title,
            description: data.description ?? null,
            sortOrder: 0,
          },
          {
            onSuccess: () => {
              toast.success('Epic Created', 'Your new epic has been created in Draft status.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      }
    },
    [epic, createEpicMutation, updateEpicMutation, handleClose],
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

  const isPending = isSubmitting || createEpicMutation.isPending || updateEpicMutation.isPending;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const modalTitle = isEditMode ? 'Edit Epic' : 'Create Epic';
  const modalDescription = isEditMode
    ? 'Update the epic details below.'
    : 'Create a new epic in Draft status. Fill in the details below.';
  const submitLabel = isEditMode ? 'Save Changes' : 'Create Epic';
  const descriptionId = isEditMode ? 'edit-epic-description' : 'create-epic-description';

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
            <Label htmlFor="epic-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="epic-title"
              placeholder="e.g., User Authentication & Authorization"
              maxLength={200}
              aria-describedby={errors.title ? 'epic-title-error' : 'epic-title-counter'}
              aria-invalid={errors.title ? true : undefined}
              {...register('title')}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p id="epic-title-error" className="text-[13px] text-red-500" role="alert">
                  {errors.title.message}
                </p>
              ) : (
                <span />
              )}
              <p id="epic-title-counter" className="text-[13px] text-zinc-400">
                {String(titleLength)} / 200
              </p>
            </div>
          </div>

          {/* Description field */}
          <div className="space-y-1.5">
            <Label htmlFor="epic-description">Description</Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Describe the epic's scope, goals, and key deliverables..."
                  minHeight={120}
                  {...(errors.description?.message ? { error: errors.description.message } : {})}
                />
              )}
            />
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
