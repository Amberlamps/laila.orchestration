/**
 * Create Worker Modal
 *
 * A two-step dialog for creating a new worker.
 *
 * Step 1 — Name Input:
 *   Collects the worker name (required, max 100 chars) and calls the
 *   create worker API. Shows loading spinner and inline errors.
 *
 * Step 2 — API Key Reveal:
 *   Displays the one-time API key with auto-copy, manual copy button,
 *   and a warning that the key cannot be retrieved again. The modal
 *   cannot be dismissed via backdrop click during this step.
 *
 * Uses React Hook Form + Zod for validation and the `useCreateWorker`
 * mutation hook for the API call.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { useCreateWorker } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const createWorkerSchema = z.object({
  name: z
    .string()
    .min(1, 'Worker name is required')
    .max(100, 'Name must be 100 characters or fewer'),
});

type CreateWorkerFormData = z.infer<typeof createWorkerSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalStep = 'name' | 'api-key';

interface CreateWorkerModalProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateWorkerModal({ open, onOpenChange }: CreateWorkerModalProps) {
  const [step, setStep] = useState<ModalStep>('name');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clipboardFailed, setClipboardFailed] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createWorkerMutation = useCreateWorker();

  const form = useForm<CreateWorkerFormData>({
    resolver: zodResolver(createWorkerSchema),
    defaultValues: {
      name: '',
    },
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = form;

  // -------------------------------------------------------------------------
  // Reset state when modal closes and reopens
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      setStep('name');
      setApiKey(null);
      setCopied(false);
      setClipboardFailed(false);
      setApiError(null);
      reset({ name: '' });
    }

    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, [open, reset]);

  // -------------------------------------------------------------------------
  // Clipboard helpers
  // -------------------------------------------------------------------------

  const copyToClipboard = useCallback(async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setClipboardFailed(false);

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setClipboardFailed(true);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const onSubmit = useCallback(
    (data: CreateWorkerFormData) => {
      setApiError(null);

      createWorkerMutation.mutate(
        { name: data.name },
        {
          onSuccess: (result) => {
            // CreateWorkerResponse shape: { data: Worker, apiKey: CreateApiKeyResponse }
            // CreateApiKeyResponse shape: { id, name, rawKey, maskedKey, createdAt, expiresAt }
            const rawKey = result?.apiKey.rawKey;
            if (rawKey) {
              setApiKey(rawKey);
              setStep('api-key');
              // Auto-copy to clipboard
              void copyToClipboard(rawKey);
            } else {
              setApiError('Worker created but API key was not returned. Please contact support.');
            }
          },
          onError: (error: Error) => {
            setApiError(error.message || 'An unexpected error occurred. Please try again.');
          },
        },
      );
    },
    [createWorkerMutation, copyToClipboard],
  );

  const handleCopy = useCallback(() => {
    if (apiKey) {
      void copyToClipboard(apiKey);
    }
  }, [apiKey, copyToClipboard]);

  const handleDone = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // -------------------------------------------------------------------------
  // Dialog open/close handler
  // -------------------------------------------------------------------------

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // During Step 2, prevent closing via backdrop/escape — user must click "Done"
      if (!nextOpen && step === 'api-key') {
        return;
      }
      onOpenChange(nextOpen);
    },
    [step, onOpenChange],
  );

  const isPending = isSubmitting || createWorkerMutation.isPending;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        aria-describedby={
          step === 'name' ? 'create-worker-description' : 'worker-created-description'
        }
        {...(step === 'api-key'
          ? {
              onInteractOutside: (e: Event) => {
                e.preventDefault();
              },
              onEscapeKeyDown: (e: KeyboardEvent) => {
                e.preventDefault();
              },
            }
          : {})}
      >
        {step === 'name' && (
          <>
            <DialogHeader>
              <DialogTitle asChild>
                <h3>Create Worker</h3>
              </DialogTitle>
              <DialogDescription id="create-worker-description">
                Create a new AI execution agent worker.
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
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
                    aria-hidden="true"
                  />
                  <p className="text-[13px] leading-snug text-red-700">{apiError}</p>
                </div>
              )}

              {/* Name field */}
              <div className="space-y-1.5">
                <Label htmlFor="worker-name">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="worker-name"
                  placeholder="e.g., Build Agent 1"
                  maxLength={100}
                  aria-describedby={errors.name ? 'worker-name-error' : undefined}
                  aria-invalid={errors.name ? true : undefined}
                  {...register('name')}
                />
                {errors.name && (
                  <p id="worker-name-error" className="text-[13px] text-red-500" role="alert">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Footer */}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isValid || isPending} loading={isPending}>
                  Create Worker
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === 'api-key' && apiKey && (
          <>
            <DialogHeader className="items-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" aria-hidden="true" />
              <DialogTitle asChild>
                <h3>Worker Created Successfully</h3>
              </DialogTitle>
              <DialogDescription id="worker-created-description">
                Your worker has been created. Copy the API key below.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* API Key display */}
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg bg-zinc-100 p-4 select-all">
                    <code className="font-mono text-sm break-all text-zinc-900">{apiKey}</code>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    aria-label="Copy API key"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {clipboardFailed && (
                  <p className="text-[13px] text-amber-600">
                    Auto-copy failed. Please select the key above and copy it manually.
                  </p>
                )}
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                <p className="text-[13px] leading-snug text-amber-700">
                  This API key will only be shown once. Store it securely. If lost, you&apos;ll need
                  to delete this worker and create a new one.
                </p>
              </div>
            </div>

            {/* Footer */}
            <DialogFooter>
              <Button type="button" onClick={handleDone}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
