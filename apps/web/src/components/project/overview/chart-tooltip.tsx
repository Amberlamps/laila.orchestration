/**
 * Shared custom tooltip component for Recharts charts.
 *
 * Renders a styled tooltip with:
 * - White background with shadow-lg, rounded-lg border
 * - Full formatted date (e.g., "February 28, 2026")
 * - Metric label and value displayed in bold
 * - Design system font and color tokens
 *
 * This component is designed to be reused across multiple charts
 * (throughput, task completion rate, cost tracking, etc.).
 */

'use client';

import type { NameType, Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';

/**
 * Props received by the custom tooltip content function.
 *
 * These match the shape Recharts passes when a component is used
 * as the `content` prop of `<Tooltip>`.
 */
interface ChartTooltipProps<TValue extends ValueType, TName extends NameType> {
  /** Whether the tooltip is currently active (visible). */
  active?: boolean;
  /** The tooltip payload entries — one per data series. */
  payload?: ReadonlyArray<Payload<TValue, TName>>;
  /** The label value from the X-axis (typically a date string). */
  label?: string | number;
  /** Function to format the label (date) displayed in the tooltip header. */
  formatLabel?: (label: string) => string;
  /** Label to display next to the metric value (e.g., "Stories Completed"). */
  metricLabel?: string;
}

/**
 * Formats a date string into a full locale-aware date string.
 * Example: "2026-02-28" -> "February 28, 2026"
 */
function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * ChartTooltip is a shared tooltip component for Recharts charts.
 *
 * It is passed as the `content` prop of Recharts `<Tooltip>`.
 * The component receives tooltip state from Recharts and renders
 * a custom styled HTML tooltip.
 */
function ChartTooltip<TValue extends ValueType, TName extends NameType>({
  active,
  payload,
  label,
  formatLabel,
  metricLabel,
}: ChartTooltipProps<TValue, TName>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const dateLabel =
    typeof label === 'string' ? (formatLabel ? formatLabel(label) : formatFullDate(label)) : '';

  const firstEntry = payload[0];
  const value = firstEntry?.value;
  const displayLabel = metricLabel ?? (typeof firstEntry?.name === 'string' ? firstEntry.name : '');

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-1 text-xs text-zinc-500">{dateLabel}</p>
      <p className="text-sm font-semibold text-zinc-900">
        {displayLabel}:{' '}
        <span className="text-indigo-600">
          {typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : value}
        </span>
      </p>
    </div>
  );
}

export { ChartTooltip, formatFullDate };
export type { ChartTooltipProps };
