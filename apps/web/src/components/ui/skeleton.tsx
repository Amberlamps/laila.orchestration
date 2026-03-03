/**
 * Skeleton loading placeholders with shimmer animation.
 *
 * Each variant matches the dimensions of the content it replaces
 * to minimize layout shift (CLS) when data loads.
 *
 * Visual spec:
 *   Background: zinc-100 (#F4F4F5)
 *   Shimmer via-color: zinc-200 (#E4E4E7)
 *   Animation: left-to-right gradient sweep, 1.5s, infinite, linear
 *
 * Accessibility:
 *   - Individual skeleton elements: aria-hidden="true"
 *   - Wrapper containers: role="status", aria-live="polite", aria-label="Loading..."
 */

import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Base Skeleton
 * Renders a shimmer-animated rectangle. All skeleton variants compose this.
 * --------------------------------------------------------------------------- */

interface SkeletonProps {
  /** Additional CSS classes for layout customization */
  className?: string;
  /** Width as CSS value (e.g., "80%", "200px"). Defaults to "100%". */
  width?: string;
  /** Height as CSS value (e.g., "14px", "40px"). Defaults to "14px". */
  height?: string;
  /** Tailwind border-radius class (e.g., "rounded-sm", "rounded-full"). Defaults to "rounded". */
  rounded?: string;
}

const Skeleton = ({ className, width, height, rounded }: SkeletonProps) => (
  <div
    aria-hidden="true"
    className={cn(
      'animate-shimmer bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100',
      'bg-[length:200%_100%]',
      rounded ?? 'rounded',
      className,
    )}
    style={{ width: width ?? '100%', height: height ?? '14px' }}
  />
);

/* ---------------------------------------------------------------------------
 * SkeletonText
 * Renders multiple horizontal bars mimicking lines of text.
 * Width varies per line to look natural. Default height is 14px.
 * --------------------------------------------------------------------------- */

interface SkeletonTextProps {
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Number of text lines to render. Defaults to 3. */
  lines?: number;
  /** Height of each text line in CSS units. Defaults to "14px". */
  lineHeight?: string;
  /** Gap between lines in CSS units. Defaults to "12px". */
  gap?: string;
}

/** Predefined width pattern for natural-looking text placeholders */
const LINE_WIDTHS = ['80%', '70%', '60%', '75%', '65%'] as const;

const SkeletonText = ({
  className,
  lines = 3,
  lineHeight = '14px',
  gap = '12px',
}: SkeletonTextProps) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading text"
    className={cn('flex flex-col', className)}
    style={{ gap }}
  >
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        width={LINE_WIDTHS[i % LINE_WIDTHS.length] ?? '80%'}
        height={lineHeight}
        rounded="rounded-sm"
      />
    ))}
  </div>
);

/* ---------------------------------------------------------------------------
 * SkeletonTable
 * Renders a header row + 5 data rows matching EntityTable layout.
 * Column count is configurable.
 * --------------------------------------------------------------------------- */

interface SkeletonTableProps {
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Number of columns. Defaults to 4. */
  columns?: number;
  /** Number of data rows (excluding header). Defaults to 5. */
  rows?: number;
}

const DEFAULT_COLUMNS = 4;
const DEFAULT_ROWS = 5;

const SkeletonTable = ({
  className,
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
}: SkeletonTableProps) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading table data"
    className={cn('w-full overflow-hidden rounded-md border border-zinc-200', className)}
  >
    {/* Header row */}
    <div className="flex gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === 0 ? '30%' : `${String(Math.floor(70 / (columns - 1)))}%`}
          height="11px"
          rounded="rounded-sm"
        />
      ))}
    </div>
    {/* Data rows */}
    {Array.from({ length: rows }).map((_, row) => (
      <div
        key={row}
        className={cn('flex gap-4 px-4 py-3', row < rows - 1 && 'border-b border-zinc-200')}
      >
        {Array.from({ length: columns }).map((_, col) => (
          <Skeleton
            key={col}
            width={col === 0 ? '30%' : `${String(Math.floor(70 / (columns - 1)))}%`}
            height="14px"
            rounded="rounded-sm"
          />
        ))}
      </div>
    ))}
  </div>
);

/* ---------------------------------------------------------------------------
 * SkeletonCard
 * Matches entity card layout (project cards, persona cards) with placeholders
 * for title, description (2 lines), status badge, and metadata.
 * --------------------------------------------------------------------------- */

interface SkeletonCardProps {
  /** Additional CSS classes for the card wrapper */
  className?: string;
}

const SkeletonCard = ({ className }: SkeletonCardProps) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading card"
    className={cn('rounded-md border border-zinc-200 bg-white p-6 shadow-sm', className)}
  >
    {/* Title placeholder */}
    <Skeleton width="60%" height="20px" rounded="rounded-sm" />

    {/* Description placeholder — 2 lines */}
    <div className="mt-3 flex flex-col gap-2">
      <Skeleton width="100%" height="14px" rounded="rounded-sm" />
      <Skeleton width="75%" height="14px" rounded="rounded-sm" />
    </div>

    {/* Badge placeholder */}
    <div className="mt-4">
      <Skeleton width="72px" height="22px" rounded="rounded-sm" />
    </div>

    {/* Metadata row placeholder */}
    <div className="mt-4 flex items-center gap-3">
      <Skeleton width="80px" height="12px" rounded="rounded-sm" />
      <Skeleton width="60px" height="12px" rounded="rounded-sm" />
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
 * SkeletonAvatar
 * Circular skeleton for user/worker avatar placeholders.
 * --------------------------------------------------------------------------- */

interface SkeletonAvatarProps {
  /** Additional CSS classes */
  className?: string;
  /** Diameter in pixels. Defaults to 40. */
  size?: 32 | 40;
}

const DEFAULT_AVATAR_SIZE = 40;

const SkeletonAvatar = ({ className, size = DEFAULT_AVATAR_SIZE }: SkeletonAvatarProps) => (
  <Skeleton
    {...(className != null ? { className } : {})}
    width={`${String(size)}px`}
    height={`${String(size)}px`}
    rounded="rounded-full"
  />
);

/* ---------------------------------------------------------------------------
 * SkeletonKPICard
 * Matches KPICard dimensions with placeholders for a large number value,
 * a label, and an optional breakdown bar.
 * --------------------------------------------------------------------------- */

interface SkeletonKPICardProps {
  /** Additional CSS classes for the KPI card wrapper */
  className?: string;
  /** Whether to show the breakdown bar placeholder. Defaults to false. */
  showBreakdown?: boolean;
}

const SkeletonKPICard = ({ className, showBreakdown = false }: SkeletonKPICardProps) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading KPI"
    className={cn('rounded-md border border-zinc-200 bg-white p-6 shadow-sm', className)}
  >
    {/* Label placeholder */}
    <Skeleton width="60%" height="12px" rounded="rounded-sm" />

    {/* Large number placeholder */}
    <div className="mt-3">
      <Skeleton width="40%" height="32px" rounded="rounded-sm" />
    </div>

    {/* Optional breakdown bar placeholder */}
    {showBreakdown && (
      <div className="mt-4">
        <Skeleton width="100%" height="8px" rounded="rounded-full" />
      </div>
    )}
  </div>
);

/* ---------------------------------------------------------------------------
 * Exports
 * --------------------------------------------------------------------------- */
export { Skeleton, SkeletonText, SkeletonTable, SkeletonCard, SkeletonAvatar, SkeletonKPICard };

export type {
  SkeletonProps,
  SkeletonTextProps,
  SkeletonTableProps,
  SkeletonCardProps,
  SkeletonAvatarProps,
  SkeletonKPICardProps,
};
