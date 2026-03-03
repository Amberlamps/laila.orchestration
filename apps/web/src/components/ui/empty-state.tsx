import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Lucide icon component to display (rendered at 48px, zinc-300) */
  icon: React.ComponentType<{ className?: string }>;
  /** Title text (e.g., "No Projects Yet") */
  title: string;
  /** Description text explaining what the user can do */
  description: string;
  /** Primary CTA button label (e.g., "+ Create Project") */
  actionLabel?: string;
  /** Called when the CTA button is clicked */
  onAction?: () => void;
  /** Optional secondary link text (e.g., "Learn about projects") */
  secondaryLabel?: string;
  /** Called when the secondary link is clicked */
  onSecondary?: () => void;
  /** Additional CSS classes for the outer container */
  className?: string;
}

/**
 * Empty state display for lists and containers with no content.
 * Shows icon, title, description, and optional action button to guide the user.
 *
 * Centers vertically and horizontally within its parent container.
 * Works inside tables, card grids, and general containers.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex min-h-[300px] flex-col items-center justify-center gap-4 p-6', className)}
    >
      <Icon className="size-12 text-zinc-300" aria-hidden="true" />

      <h3 className="text-h3 text-zinc-900">{title}</h3>

      <p className="text-body max-w-[400px] text-center text-zinc-500">{description}</p>

      {actionLabel && onAction && (
        <Button variant="default" onClick={onAction}>
          {actionLabel}
        </Button>
      )}

      {secondaryLabel && (
        <button
          type="button"
          onClick={onSecondary}
          className="text-body-sm text-indigo-600 hover:underline"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}

export { EmptyState };
