/**
 * Reusable SVG-based circular progress ring component.
 *
 * Renders a circular progress indicator using SVG stroke-dasharray and
 * stroke-dashoffset techniques. The arc starts from the 12 o'clock position
 * (via a -90deg rotation) and fills clockwise.
 *
 * Features:
 * - Configurable size, stroke width, and colors
 * - Animated transitions on value changes (0.5s ease-in-out)
 * - Rounded stroke line caps for smooth visual appearance
 * - Optional center label and sublabel
 * - JetBrains Mono font for percentage display via font-mono
 *
 * @example
 * ```tsx
 * <ProgressRing value={73} />
 * <ProgressRing value={100} size={120} strokeWidth={8} progressColor="#22c55e" />
 * <ProgressRing value={50} showLabel={false} />
 * ```
 */

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProgressRingProps {
  /** Progress value from 0 to 100. */
  value: number;
  /** Diameter of the ring in pixels. Defaults to 160. */
  size?: number;
  /** Width of the stroke in pixels. Defaults to 12. */
  strokeWidth?: number;
  /** CSS color value for the background track. Defaults to "var(--color-zinc-100)". */
  trackColor?: string;
  /** CSS color value for the progress arc. When not provided, uses the default track color. */
  progressColor?: string;
  /** Whether to display the center label. Defaults to true. */
  showLabel?: boolean;
  /** Primary label text in the center. Defaults to "{value}%". */
  label?: string;
  /** Secondary label text below the primary. Defaults to "complete". */
  sublabel?: string;
  /** Additional CSS class names for the SVG container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SIZE = 160;
const DEFAULT_STROKE_WIDTH = 12;
const DEFAULT_TRACK_COLOR = 'var(--color-zinc-100)';

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
  sublabel = 'complete',
  className,
}: ProgressRingProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));

  // SVG geometry calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clampedValue / 100);

  // Center coordinates
  const center = size / 2;

  // Display label
  const displayLabel = label ?? `${String(Math.round(clampedValue))}%`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={`Progress: ${String(Math.round(clampedValue))}% ${sublabel}`}
    >
      {/* Background track circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />

      {/* Progress arc circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={progressColor ?? trackColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{
          transition: 'stroke-dashoffset 0.5s ease-in-out',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        }}
      />

      {/* Center label */}
      {showLabel && (
        <>
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono text-3xl font-bold"
            fill="var(--color-zinc-900)"
            dy="-0.4em"
          >
            {displayLabel}
          </text>
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-sm"
            fill="var(--color-zinc-500)"
            dy="1.2em"
          >
            {sublabel}
          </text>
        </>
      )}
    </svg>
  );
}

export { ProgressRing };
export type { ProgressRingProps };
