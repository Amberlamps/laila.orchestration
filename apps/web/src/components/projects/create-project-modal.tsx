/**
 * Create Project Modal
 *
 * A dialog form for creating a new project in Draft status.
 * Uses React Hook Form + Zod for validation and the `useCreateProject`
 * mutation hook for the API call.
 *
 * Features:
 * - Name field (required, 1-200 chars) with live character counter
 * - Description field using MarkdownEditor with write/preview toggle
 * - Worker inactivity timeout (number, 5-1440 min, default 30)
 * - Inline validation errors, loading state, success toast
 * - Unsaved-changes guard on backdrop close
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
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
import { useCreateProject } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(200, 'Project name must be 200 characters or fewer'),
  description: z.string().optional(),
  workerInactivityTimeoutMinutes: z
    .number({ invalid_type_error: 'Timeout must be a number' })
    .int('Timeout must be a whole number')
    .min(5, 'Minimum timeout is 5 minutes')
    .max(1440, 'Maximum timeout is 1440 minutes (24 hours)'),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface CreateProjectModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateProjectModal({ open, onOpenChange }: CreateProjectModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const createProjectMutation = useCreateProject();

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      workerInactivityTimeoutMinutes: 30,
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

  const nameValue = watch('name');
  const nameLength = nameValue.length;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    reset();
    setApiError(null);
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const onSubmit = useCallback(
    (data: CreateProjectFormData) => {
      setApiError(null);

      createProjectMutation.mutate(
        {
          name: data.name,
          description: data.description ?? null,
          lifecycleStatus: 'draft',
          workerInactivityTimeoutMinutes: data.workerInactivityTimeoutMinutes,
        },
        {
          onSuccess: () => {
            toast.success('Project Created', 'Your new project has been created in Draft status.');
            handleClose();
          },
          onError: (error: Error) => {
            setApiError(error.message || 'An unexpected error occurred. Please try again.');
          },
        },
      );
    },
    [createProjectMutation, handleClose],
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" aria-describedby="create-project-description">
        <DialogHeader>
          <DialogTitle asChild>
            <h3>Create Project</h3>
          </DialogTitle>
          <DialogDescription id="create-project-description">
            Create a new project in Draft status. Fill in the details below.
          </DialogDescription>
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

          {/* Name field */}
          <div className="space-y-1.5">
            <Label htmlFor="project-name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="e.g., E-commerce Platform Redesign"
              maxLength={200}
              aria-describedby={errors.name ? 'project-name-error' : 'project-name-counter'}
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
            <div className="flex items-center justify-between">
              {errors.name ? (
                <p id="project-name-error" className="text-[13px] text-red-500" role="alert">
                  {errors.name.message}
                </p>
              ) : (
                <span />
              )}
              <p id="project-name-counter" className="text-[13px] text-zinc-400">
                {String(nameLength)} / 200
              </p>
            </div>
          </div>

          {/* Description field */}
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
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
          </div>

          {/* Worker Inactivity Timeout field */}
          <div className="space-y-1.5">
            <Label htmlFor="project-timeout">Worker Inactivity Timeout</Label>
            <div className="flex items-center gap-2">
              <Input
                id="project-timeout"
                type="number"
                min={5}
                max={1440}
                className="w-28"
                aria-describedby={
                  errors.workerInactivityTimeoutMinutes
                    ? 'project-timeout-error'
                    : 'project-timeout-help'
                }
                aria-invalid={errors.workerInactivityTimeoutMinutes ? true : undefined}
                {...register('workerInactivityTimeoutMinutes', { valueAsNumber: true })}
              />
              <span className="text-sm text-zinc-500">minutes</span>
            </div>
            {errors.workerInactivityTimeoutMinutes ? (
              <p id="project-timeout-error" className="text-[13px] text-red-500" role="alert">
                {errors.workerInactivityTimeoutMinutes.message}
              </p>
            ) : (
              <p id="project-timeout-help" className="text-[13px] text-zinc-400">
                Workers will be automatically unassigned after this period of inactivity.
              </p>
            )}
          </div>

          {/* Footer */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              loading={isSubmitting || createProjectMutation.isPending}
            >
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
