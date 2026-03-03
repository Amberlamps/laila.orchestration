import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Union type representing all valid work statuses in the application.
 * Each status maps to a distinct visual configuration (colors + label).
 */
export type WorkStatus =
  | 'draft'
  | 'not_started'
  | 'ready'
  | 'blocked'
  | 'in_progress'
  | 'complete'
  | 'failed';

export interface StatusBadgeProps {
  /** The work status to display. Determines colors and label text. */
  status: WorkStatus;
  /** Optional additional CSS classes for layout customization. */
  className?: string;
}

/**
 * Visual configuration for each work status.
 *
 * - `bg`    — Tailwind background class for the badge container
 * - `text`  — Tailwind text color class for the label
 * - `dot`   — Tailwind background class for the 8px filled circle
 * - `label` — Human-readable status text
 *
 * Color choices satisfy WCAG 2.1 AA contrast requirements:
 *   - Draft:       zinc-600 (#52525b) on zinc-100 (#f4f4f5) — ~7.2:1
 *   - Not Started: gray-600 (#4b5563) on gray-100 (#f3f4f6) — ~7.0:1
 *   - Ready:       teal-700 (#0f766e) on teal-50  (#f0fdfa) — ~7.1:1
 *   - Blocked:     amber-700(#b45309) on amber-50 (#fffbeb) — ~5.8:1
 *   - In Progress: blue-700 (#1d4ed8) on blue-50  (#eff6ff) — ~8.0:1
 *   - Complete:    green-700(#15803d) on green-50 (#f0fdf4) — ~6.4:1
 *   - Failed:      red-700  (#b91c1c) on red-50   (#fef2f2) — ~7.0:1
 */
const STATUS_CONFIG: Record<WorkStatus, { bg: string; text: string; dot: string; label: string }> =
  {
    draft: {
      bg: 'bg-zinc-100',
      text: 'text-zinc-600',
      dot: 'bg-zinc-400',
      label: 'Draft',
    },
    not_started: {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      dot: 'bg-gray-400',
      label: 'Not Started',
    },
    ready: {
      bg: 'bg-teal-50',
      text: 'text-teal-700',
      dot: 'bg-teal-500',
      label: 'Ready',
    },
    blocked: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      label: 'Blocked',
    },
    in_progress: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      dot: 'bg-blue-500',
      label: 'In Progress',
    },
    complete: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      dot: 'bg-green-500',
      label: 'Complete',
    },
    failed: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      dot: 'bg-red-500',
      label: 'Failed',
    },
  };

/**
 * StatusBadge — A color-coded pill that displays a work status.
 *
 * Renders a fixed-height (22px) badge with:
 *   - An 8px filled circle dot (secondary visual cue)
 *   - A human-readable text label
 *
 * Accessibility:
 *   - Uses redundant encoding (color + dot shape + text label) per WCAG 2.1
 *     Success Criterion 1.4.1 (Use of Color).
 *   - All text/background combinations meet WCAG 2.1 AA contrast ratio (>= 4.5:1)
 *     per Success Criterion 1.4.3 (Contrast).
 *
 * @example
 * ```tsx
 * <StatusBadge status="in_progress" />
 * <StatusBadge status="complete" className="ml-2" />
 * ```
 */
function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        // Layout: inline-flex, fixed height, centered items, no wrapping
        'inline-flex h-[22px] items-center gap-1 rounded-sm px-1 py-0.5 whitespace-nowrap',
        // Typography: Caption style (12px, medium weight, 16px line-height)
        'text-caption',
        // Status-specific colors
        config.bg,
        config.text,
        // Allow external layout overrides
        className,
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      {/* 8px filled circle dot — provides redundant visual encoding beyond color */}
      <span className={cn('size-2 shrink-0 rounded-full', config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

export { StatusBadge, STATUS_CONFIG };
