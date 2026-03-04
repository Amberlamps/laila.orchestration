/**
 * Create Task Modal
 *
 * A dialog for creating a new task within a story. Uses React Hook Form + Zod
 * for validation and the `useCreateTask` mutation hook for the API call.
 *
 * Required fields: title, acceptanceCriteria (at least one).
 * Optional fields: description, personaId.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useCreateTask, usePersonas } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const taskFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Task title is required')
    .max(255, 'Title must be 255 characters or fewer'),
  description: z.string().optional(),
  personaId: z.string().optional(),
  acceptanceCriteria: z
    .array(z.object({ value: z.string().min(1, 'Criterion cannot be empty') }))
    .min(1, 'At least one acceptance criterion is required'),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateTaskModal({ open, onOpenChange, storyId }: CreateTaskModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const createTask = useCreateTask(storyId);

  // Fetch personas for the persona select
  const { data: personasData } = usePersonas();
  const personas = personasData
    ? (personasData as unknown as { data: Array<{ id: string; title: string }> }).data
    : [];

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      personaId: '',
      acceptanceCriteria: [{ value: '' }],
    },
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'acceptanceCriteria',
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      form.reset({
        title: '',
        description: '',
        personaId: '',
        acceptanceCriteria: [{ value: '' }],
      });
      setApiError(null);
    }
  }, [open, form]);

  const isPending = form.formState.isSubmitting || createTask.isPending;

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && form.formState.isDirty) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to close?',
        );
        if (!confirmed) return;
      }
      onOpenChange(isOpen);
    },
    [form.formState.isDirty, onOpenChange],
  );

  const onSubmit = useCallback(
    (data: TaskFormData) => {
      setApiError(null);

      createTask.mutate(
        {
          title: data.title,
          ...(data.description ? { description: data.description } : {}),
          ...(data.personaId ? { personaId: data.personaId } : {}),
          acceptanceCriteria: data.acceptanceCriteria.map((c) => c.value),
          references: [],
        },
        {
          onSuccess: () => {
            toast.success('Task Created', `"${data.title}" has been added to the story.`);
            onOpenChange(false);
          },
          onError: (error: Error) => {
            setApiError(error.message);
          },
        },
      );
    },
    [createTask, onOpenChange],
  );

  const titleLength = form.watch('title').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md" aria-describedby="create-task-desc">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription id="create-task-desc">Add a new task to this story.</DialogDescription>
        </DialogHeader>

        {apiError && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {apiError}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
        >
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="task-title"
              placeholder="Enter task title"
              {...form.register('title')}
              aria-invalid={!!form.formState.errors.title}
            />
            <div className="flex items-center justify-between">
              {form.formState.errors.title ? (
                <p className="text-xs text-red-600">{form.formState.errors.title.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-zinc-400">{String(titleLength)}/255</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Optional description (Markdown supported)"
              rows={3}
              {...form.register('description')}
            />
          </div>

          {/* Persona */}
          <div className="space-y-1.5">
            <Label htmlFor="task-persona">Persona</Label>
            <Controller
              control={form.control}
              name="personaId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger id="task-persona">
                    <SelectValue placeholder="Select a persona (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-1.5">
            <Label>
              Acceptance Criteria <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2">
              {fields.map((field, index) => {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- index must remain a number for react-hook-form path inference
                const fieldName = `acceptanceCriteria.${index}.value` as const;
                return (
                  <div key={field.id} className="flex items-start gap-2">
                    <Input
                      placeholder={`Criterion ${String(index + 1)}`}
                      {...form.register(fieldName)}
                      aria-invalid={!!form.formState.errors.acceptanceCriteria?.[index]?.value}
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          remove(index);
                        }}
                        aria-label={`Remove criterion ${String(index + 1)}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {form.formState.errors.acceptanceCriteria && (
              <p className="text-xs text-red-600">
                {form.formState.errors.acceptanceCriteria.message ??
                  form.formState.errors.acceptanceCriteria.root?.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                append({ value: '' });
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Criterion
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleClose(false);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
