/**
 * Maps entity statuses to Tailwind border/fill colors.
 * Shared across all graph components (nodes, edges, legend).
 *
 * @module status-colors
 */

/** Tailwind `border-l-*` classes for the node left accent border. */
export const statusBorderColors: Record<string, string> = {
  not_started: 'border-l-zinc-400',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-emerald-500',
  blocked: 'border-l-amber-500',
  failed: 'border-l-red-500',
  draft: 'border-l-zinc-300',
  ready: 'border-l-indigo-500',
};

/** Hex color values for status indicators (edges, legends, programmatic use). */
export const statusHexColors: Record<string, string> = {
  not_started: '#a1a1aa', // zinc-400
  in_progress: '#3b82f6', // blue-500
  completed: '#10b981', // emerald-500
  blocked: '#f59e0b', // amber-500
  failed: '#ef4444', // red-500
  draft: '#d4d4d8', // zinc-300
  ready: '#6366f1', // indigo-500
};
