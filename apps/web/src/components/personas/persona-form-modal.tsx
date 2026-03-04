/**
 * Create / Edit Persona Modal
 *
 * A combined dialog for creating new personas and editing existing ones.
 * Uses React Hook Form + Zod for validation and the `useCreatePersona` /
 * `useUpdatePersona` mutation hooks for API calls.
 *
 * Features:
 * - Title field (required, 1-200 chars) with live character counter
 * - Description field using MarkdownEditor with write/preview toggle (required)
 * - Mode-aware title, description, and submit button text
 * - Inline validation errors, loading state, success toast
 * - Unsaved-changes guard on backdrop close
 * - Form reset when modal opens/closes or persona data changes
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { personaSchema } from '@laila/shared';
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
import { useCreatePersona, useUpdatePersona } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Validation schema — derived from the shared personaSchema
// ---------------------------------------------------------------------------

/**
 * Form schema derived from the shared entity schema (`personaSchema`).
 *
 * The API uses "title" for the persona name; the shared schema defines
 * validation rules under "name" (min 1, max 255). We reuse the same
 * validator so constraints stay in sync with the shared package.
 *
 * Description is required in the form (unlike the optional entity field).
 */
const TITLE_MAX_LENGTH = 255;

const personaFormSchema = z.object({
  title: personaSchema.shape.name,
  description: z.string().min(1, 'Description is required'),
});

type PersonaFormData = z.infer<typeof personaFormSchema>;

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface PersonaFormModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** If provided, modal opens in edit mode with pre-filled values */
  persona?: {
    id: string;
    title: string;
    description: string;
    version?: number | undefined;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonaFormModal({ open, onOpenChange, persona }: PersonaFormModalProps) {
  const isEditMode = !!persona;
  const [apiError, setApiError] = useState<string | null>(null);

  const createPersonaMutation = useCreatePersona();
  const updatePersonaMutation = useUpdatePersona(persona?.id ?? '');

  const form = useForm<PersonaFormData>({
    resolver: zodResolver(personaFormSchema),
    defaultValues: {
      title: persona?.title ?? '',
      description: persona?.description ?? '',
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
  // Reset form when modal opens or persona data changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      reset({
        title: persona?.title ?? '',
        description: persona?.description ?? '',
      });
      setApiError(null);
    }
  }, [open, persona?.id, persona?.title, persona?.description, reset]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    reset();
    setApiError(null);
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const onSubmit = useCallback(
    (data: PersonaFormData) => {
      setApiError(null);

      if (persona) {
        updatePersonaMutation.mutate(
          {
            title: data.title,
            description: data.description,
            version: persona.version ?? 1,
          },
          {
            onSuccess: () => {
              toast.success('Persona Updated', 'Your changes have been saved.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      } else {
        createPersonaMutation.mutate(
          {
            title: data.title,
            description: data.description,
          },
          {
            onSuccess: () => {
              toast.success('Persona Created', 'Your new persona has been created.');
              handleClose();
            },
            onError: (error: Error) => {
              setApiError(error.message || 'An unexpected error occurred. Please try again.');
            },
          },
        );
      }
    },
    [persona, createPersonaMutation, updatePersonaMutation, handleClose],
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

  const isPending =
    isSubmitting || createPersonaMutation.isPending || updatePersonaMutation.isPending;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const modalTitle = isEditMode ? 'Edit Persona' : 'Create Persona';
  const modalDescription = isEditMode
    ? 'Update the persona details below.'
    : 'Create a new persona. Fill in the details below.';
  const submitLabel = isPending ? 'Saving...' : 'Save';
  const descriptionId = isEditMode ? 'edit-persona-description' : 'create-persona-description';

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
            <Label htmlFor="persona-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="persona-title"
              placeholder="e.g., Senior Frontend Developer"
              maxLength={TITLE_MAX_LENGTH}
              aria-describedby={errors.title ? 'persona-title-error' : 'persona-title-counter'}
              aria-invalid={errors.title ? true : undefined}
              {...register('title')}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p id="persona-title-error" className="text-[13px] text-red-500" role="alert">
                  {errors.title.message}
                </p>
              ) : (
                <span />
              )}
              <p id="persona-title-counter" className="text-[13px] text-zinc-400">
                {String(titleLength)} / {String(TITLE_MAX_LENGTH)}
              </p>
            </div>
          </div>

          {/* Description field */}
          <div className="space-y-1.5">
            <Label htmlFor="persona-description-field">
              Description <span className="text-red-500">*</span>
            </Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Describe the role, expertise, and behavioral guidelines for this persona..."
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
