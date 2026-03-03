'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// ConfirmDialog
// Confirmation dialog for destructive actions with consequence statement.
// Built on Radix AlertDialog for proper role="alertdialog" semantics and
// focus trapping. Supports destructive (red) and warning (amber) variants.
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close (Cancel, backdrop click, or Escape) */
  onClose: () => void;
  /** Dialog title (e.g., "Delete Project 'My Project'?") */
  title: string;
  /** Consequence description (e.g., "This will permanently delete...") */
  description: string;
  /** Text for the confirm action button (e.g., "Delete Project") */
  confirmLabel: string;
  /** Called when the confirm button is clicked */
  onConfirm: () => void;
  /** Whether the confirm action is in progress (shows loading state) */
  loading?: boolean;
  /** Dialog variant — "destructive" shows red styling, "warning" shows amber */
  variant?: 'destructive' | 'warning';
  /** Optional custom icon — defaults to AlertTriangle */
  icon?: LucideIcon;
}

const variantStyles = {
  destructive: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-500',
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-500',
  },
} as const;

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading = false,
  variant = 'destructive',
  icon: Icon = AlertTriangle,
}: ConfirmDialogProps) {
  const descriptionId = React.useId();
  const styles = variantStyles[variant];

  // Ref for the confirm button to receive initial focus when dialog opens
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => {
        // When Radix signals the dialog should close (Escape key),
        // delegate to the parent's onClose handler.
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className={cn(
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-sm',
          )}
          onClick={onClose}
        />
        <AlertDialogPrimitive.Content
          className={cn(
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            'fixed top-[50%] left-[50%] z-50 w-full max-w-[400px]',
            'translate-x-[-50%] translate-y-[-50%]',
            'rounded-lg bg-white p-6 shadow-xl duration-200',
          )}
          aria-describedby={descriptionId}
          onOpenAutoFocus={(event) => {
            // Override default focus behavior to focus the confirm button
            // instead of the cancel button, drawing attention to the
            // destructive action as specified in acceptance criteria.
            event.preventDefault();
            confirmButtonRef.current?.focus();
          }}
        >
          <div className="flex flex-col items-center gap-4">
            {/* Icon circle */}
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                styles.iconBg,
              )}
            >
              <Icon className={cn('h-6 w-6', styles.iconColor)} aria-hidden="true" />
            </div>

            {/* Title */}
            <AlertDialogPrimitive.Title className="text-h3 text-center text-zinc-900">
              {title}
            </AlertDialogPrimitive.Title>

            {/* Consequence statement */}
            <AlertDialogPrimitive.Description
              id={descriptionId}
              className="text-body text-center text-zinc-600"
            >
              {description}
            </AlertDialogPrimitive.Description>

            {/* Action buttons */}
            <div className="flex w-full justify-end gap-3 pt-2">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </AlertDialogPrimitive.Cancel>

              <Button
                ref={confirmButtonRef}
                variant="destructive"
                loading={loading}
                onClick={onConfirm}
                className={cn(
                  variant === 'warning' && 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700',
                )}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
