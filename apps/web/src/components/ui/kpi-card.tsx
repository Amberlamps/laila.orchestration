/**
 * KPI/Stat card for dashboard metrics and entity detail summaries.
 * Displays a large number with label, optional trend, and optional status breakdown.
 */
import { TrendingDown, TrendingUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface StatusSegment {
  /** Status key for color lookup */
  status: string;
  /** Count or proportion for this segment */
  value: number;
  /** Tailwind bg color class (e.g., "bg-green-500") */
  color: string;
}

export interface KPICardProps {
  /** The primary metric value displayed prominently */
  value: string | number;
  /** Descriptive label shown below the value */
  label: string;
  /** Color of the left border accent (Tailwind border color class, e.g., "border-blue-500") */
  accentColor?: string;
  /** Trend percentage — positive shows green up arrow, negative shows red down arrow */
  trend?: number;
  /** Optional status breakdown bar showing proportional segments */
  breakdown?: StatusSegment[];
  /** Additional class names for layout customization (e.g., grid column span) */
  className?: string;
}

/**
 * Formats a trend value as a signed percentage string.
 * Positive values get a "+" prefix; negative values already have "-".
 */
function formatTrend(trend: number): string {
  const sign = trend >= 0 ? '+' : '';
  return `${sign}${String(trend)}%`;
}

/**
 * Calculates percentage widths for breakdown segments, ensuring they sum to 100.
 * Uses Math.round per the spec, with remainder correction on the largest segment.
 */
function calculateSegmentWidths(segments: StatusSegment[]): number[] {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (total === 0) return segments.map(() => 0);

  const rawWidths = segments.map((seg) => (seg.value / total) * 100);
  const rounded = rawWidths.map((w) => Math.round(w));
  const roundedSum = rounded.reduce((sum, w) => sum + w, 0);

  // Correct rounding error by adjusting the largest segment
  if (roundedSum !== 100) {
    const diff = 100 - roundedSum;
    let maxIndex = 0;
    let maxValue = rounded[0] ?? 0;
    for (let i = 1; i < rounded.length; i++) {
      const current = rounded[i] ?? 0;
      if (current > maxValue) {
        maxValue = current;
        maxIndex = i;
      }
    }
    rounded[maxIndex] = (rounded[maxIndex] ?? 0) + diff;
  }

  return rounded;
}

export function KPICard({ value, label, accentColor, trend, breakdown, className }: KPICardProps) {
  const widths = breakdown ? calculateSegmentWidths(breakdown) : [];

  return (
    <div
      className={cn(
        'rounded-md border border-zinc-200 bg-white shadow-sm',
        accentColor && `border-l-[3px] ${accentColor}`,
        className,
      )}
    >
      <div className="p-4">
        {/* Primary value */}
        <div className="text-display text-zinc-900">{value}</div>

        {/* Label */}
        <div className="text-caption mt-1 text-zinc-500">{label}</div>

        {/* Trend indicator */}
        {trend != null && (
          <div
            className={cn(
              'mt-2 inline-flex items-center gap-1',
              trend >= 0 ? 'text-green-600' : 'text-red-600',
            )}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">{formatTrend(trend)}</span>
          </div>
        )}
      </div>

      {/* Status breakdown mini-bar */}
      {breakdown && breakdown.length > 0 && (
        <div
          className="flex h-1 w-full overflow-hidden rounded-b-md"
          role="img"
          aria-label={`Status breakdown: ${breakdown
            .map((seg, i) => `${seg.status} ${String(widths[i] ?? 0)}%`)
            .join(', ')}`}
        >
          {breakdown.map((segment, index) => (
            <div
              key={segment.status}
              className={cn(segment.color)}
              style={{ width: `${String(widths[index] ?? 0)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
