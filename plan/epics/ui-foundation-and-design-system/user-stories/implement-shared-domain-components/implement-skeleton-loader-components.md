# Implement Skeleton Loader Components

## Task Details

- **Title:** Implement Skeleton Loader Components
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build skeleton loader components that provide visual placeholders while content is being fetched. Skeletons match the approximate dimensions of the content they replace, creating a smooth perceived loading experience rather than a jarring flash of empty space followed by content.

### Visual Specification

- **Background Color:** zinc-100 (#F4F4F5)
- **Shimmer Animation:** Left-to-right gradient sweep (zinc-100 -> zinc-200 -> zinc-100), 1.5s duration, infinite loop
- **Shape:** Rounded corners matching the content shape (e.g., 8px for cards, 4px for text lines)
- **Accessibility:** `aria-hidden="true"` on skeleton elements, `aria-live="polite"` on parent region with "Loading..." announcement

### Skeleton Variants

1. **SkeletonText:** Horizontal bar mimicking a line of text. Width varies (60%-80% for body, 40% for labels, 30% for captions). Height 14px.

2. **SkeletonTable:** 5 skeleton rows matching the `EntityTable` layout. Header row with 4-5 column placeholders, then 5 data rows with matching column widths.

3. **SkeletonCard:** Card-shaped skeleton matching entity cards (project cards, persona cards). Shows placeholder areas for title, description (2 lines), status badge, and metadata.

4. **SkeletonAvatar:** Circular skeleton (32px or 40px) for user/worker avatars.

5. **SkeletonKPICard:** Matches KPICard dimensions with placeholders for the number, label, and optional breakdown bar.

```tsx
// apps/web/src/components/ui/skeleton.tsx
// Skeleton loading placeholders with shimmer animation.
// Each variant matches the dimensions of the content it replaces
// to minimize layout shift when data loads.

// Base skeleton element — renders a shimmer-animated rectangle.
// All skeleton variants compose this base element.
interface SkeletonProps {
  className?: string;
  /** Width as CSS value (e.g., "80%", "200px"). Defaults to "100%". */
  width?: string;
  /** Height as CSS value (e.g., "14px", "40px"). Defaults to "14px". */
  height?: string;
  /** Border radius (e.g., "rounded-sm", "rounded-full"). Defaults to "rounded". */
  rounded?: string;
}

export function Skeleton({ className, width, height, rounded }: SkeletonProps) {
  // The shimmer animation is a CSS gradient that sweeps from left to right.
  // aria-hidden prevents screen readers from announcing placeholder content.
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100",
        "bg-[length:200%_100%]",
        rounded ?? "rounded",
        className,
      )}
      style={{ width: width ?? "100%", height: height ?? "14px" }}
    />
  );
}

// SkeletonTable — renders 5 placeholder rows matching EntityTable layout.
export function SkeletonTable({ columns = 4 }: { columns?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading table data">
      {/* Header row */}
      <div className="flex gap-4 px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} width={i === 0 ? "30%" : "15%"} height="11px" />
        ))}
      </div>
      {/* 5 data rows */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-200">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={col}
              width={col === 0 ? "30%" : "15%"}
              height="14px"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### Shimmer Animation CSS

```css
/* apps/web/src/app/globals.css */
/* Shimmer animation keyframes for skeleton loading states. */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@layer utilities {
  .animate-shimmer {
    animation: shimmer 1.5s infinite linear;
  }
}
```

## Acceptance Criteria

- [ ] Base `Skeleton` component renders a zinc-100 rectangle with shimmer animation
- [ ] Shimmer animation sweeps left-to-right with 1.5s duration and infinite loop
- [ ] `SkeletonText` renders bars at 60-80% width with 14px height for body text placeholders
- [ ] `SkeletonTable` renders a header row + 5 data rows matching EntityTable dimensions
- [ ] `SkeletonCard` matches entity card layout with placeholders for title, description, badge, metadata
- [ ] `SkeletonAvatar` renders a 32px or 40px circle placeholder
- [ ] `SkeletonKPICard` matches KPICard dimensions with number and label placeholders
- [ ] All skeleton elements have `aria-hidden="true"`
- [ ] Parent containers have `role="status"` and `aria-live="polite"` with "Loading..." accessible label
- [ ] Skeleton dimensions closely match the actual content dimensions to minimize layout shift
- [ ] Shimmer animation is smooth and not janky (uses `background-position` animation, GPU-accelerated)
- [ ] Skeleton components accept `className` for layout customization
- [ ] Width and height are configurable via props

## Technical Notes

- The shimmer animation uses a CSS gradient background that is wider than the element (200% width) and animates `background-position` from right to left. This approach is GPU-accelerated and performs better than animating `transform` on pseudo-elements.
- Use `aria-hidden="true"` on individual skeleton elements so screen readers do not announce placeholder content. Use `aria-live="polite"` on the wrapping container to announce when loading completes (content replaces skeletons).
- Skeleton dimensions should approximately match the final content dimensions. Exact pixel-perfect matching is not required, but the height and width should be close enough to prevent visible layout shift (CLS < 0.1).
- The `SkeletonTable` column count should be configurable to match the specific table being loaded.
- Consider creating a `Suspense`-like wrapper component that automatically shows the appropriate skeleton while data is loading.

## References

- **Design Specification:** Section 3.11 (Loading States), Section 3.11.1 (Skeleton Loaders)
- **Functional Requirements:** NFR-PERF-003 (perceived loading performance), NFR-UI-005 (loading indicators)
- **WCAG 2.1:** Success Criterion 4.1.3 (Status Messages)
- **Web Vitals:** CLS (Cumulative Layout Shift) optimization

## Estimated Complexity

Medium — Individual skeleton shapes are simple, but creating accurate dimensional matches for multiple content types (tables, cards, text) and implementing the shimmer animation with proper accessibility requires attention.
