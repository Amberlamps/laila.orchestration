/**
 * Shared custom tooltip component for Recharts charts.
 *
 * Provides consistent styling with the design system across all chart tooltips
 * in the project overview tab (throughput, completion rate, cost tracking).
 *
 * Renders:
 * - White background with shadow-lg, rounded-lg, border
 * - Date formatted as full date (e.g., "February 28, 2026")
 * - Metric label and value in bold
 * - Uses design system font and color tokens
 */

interface ChartTooltipEntry {
  /** The name/label of the metric being displayed. */
  name: string;
  /** The numeric value for this metric. */
  value: number;
  /** The color of the associated chart line/area. */
  color: string;
}

interface ChartTooltipProps {
  /** Whether the tooltip is currently active/visible. */
  active?: boolean | undefined;
  /** The raw label from the x-axis (typically a date string). */
  label?: string | number | undefined;
  /** The data entries for the hovered data point. */
  payload?: ReadonlyArray<ChartTooltipEntry> | undefined;
  /**
   * Optional function to format the label into a display string.
   * Defaults to formatting the label as a full locale date.
   */
  labelFormatter?: ((label: string | number) => string) | undefined;
}

/** Formats a date string into a full locale date (e.g., "February 28, 2026"). */
function formatFullDate(raw: string | number): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return String(raw);
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * A reusable chart tooltip that renders a styled card with the hovered
 * data point's date and metric value(s). Designed to be passed as the
 * `content` prop of a Recharts `<Tooltip />`.
 *
 * @example
 * ```tsx
 * <Tooltip content={(props) => <ChartTooltip {...props} />} />
 * ```
 */
function ChartTooltip({ active, label, payload, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0 || label == null) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label) : formatFullDate(label);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-1 text-xs font-medium text-zinc-500">{formattedLabel}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-zinc-700">{entry.name}:</span>
          <span className="text-sm font-bold text-zinc-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export { ChartTooltip };
export type { ChartTooltipProps, ChartTooltipEntry };
