/**
 * Reusable SVG-based circular progress ring component.
 *
 * Renders a circular track with an animated progress arc. The arc starts
 * from the 12 o'clock position and fills clockwise using SVG
 * stroke-dasharray / stroke-dashoffset techniques.
 *
 * Visual spec:
 *   - Track: configurable background color (default zinc-100)
 *   - Progress arc: configurable color with smooth stroke-linecap
 *   - Center label: optional percentage text + sublabel
 *   - Animation: CSS transition on stroke-dashoffset (0.5s ease-in-out)
 *
 * @example
 * ```tsx
 * <ProgressRing value={73} />
 * <ProgressRing value={100} progressColor="#10b981" sublabel="done" />
 * <ProgressRing value={50} size={120} strokeWidth={8} showLabel={false} />
 * ```
 */

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProgressRingProps {
  /** Progress value from 0 to 100 (percentage). */
  value: number;
  /** Diameter of the ring in pixels. Defaults to 160. */
  size?: number;
  /** Width of the ring stroke in pixels. Defaults to 12. */
  strokeWidth?: number;
  /** CSS color for the background track. Defaults to zinc-100. */
  trackColor?: string;
  /** CSS color for the progress arc. When omitted, computed from value thresholds. */
  progressColor?: string;
  /** Whether to display the center label (percentage + sublabel). Defaults to true. */
  showLabel?: boolean;
  /** Primary label text shown in the center. Defaults to "{value}%". */
  label?: string;
  /** Secondary label below the primary. Defaults to "complete". */
  sublabel?: string;
  /** Additional CSS classes for the wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SIZE = 160;
const DEFAULT_STROKE_WIDTH = 12;
const DEFAULT_TRACK_COLOR = '#f4f4f5'; // zinc-100
const DEFAULT_SUBLABEL = 'complete';

// ---------------------------------------------------------------------------
// Color threshold helper
// ---------------------------------------------------------------------------

/**
 * Returns a hex color for the progress arc based on percentage thresholds.
 *
 * Thresholds:
 *   0-25%:  zinc-400  (#a1a1aa)
 *   25-50%: amber-500 (#f59e0b)
 *   50-75%: indigo-500 (#6366f1)
 *   75-99%: blue-500  (#3b82f6)
 *   100%:   emerald-500 (#10b981)
 */
function getProgressColor(value: number): string {
  if (value >= 100) return '#10b981'; // emerald-500
  if (value >= 75) return '#3b82f6'; // blue-500
  if (value >= 50) return '#6366f1'; // indigo-500
  if (value >= 25) return '#f59e0b'; // amber-500
  return '#a1a1aa'; // zinc-400
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProgressRing({
  value,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  trackColor = DEFAULT_TRACK_COLOR,
  progressColor,
  showLabel = true,
  label,
  sublabel = DEFAULT_SUBLABEL,
  className,
}: ProgressRingProps) {
  // Clamp value to [0, 100]
  const clampedValue = Math.min(100, Math.max(0, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedValue / 100);
  const resolvedColor = progressColor ?? getProgressColor(clampedValue);
  const displayLabel = label ?? `${String(Math.round(clampedValue))}%`;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.5s ease-in-out',
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
          }}
        />
      </svg>

      {/* Center label */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold text-zinc-900">{displayLabel}</span>
          <span className="text-sm text-zinc-500">{sublabel}</span>
        </div>
      )}
    </div>
  );
}

export { ProgressRing };
export type { ProgressRingProps };
