# Implement Overall Progress Indicator

## Task Details

- **Title:** Implement Overall Progress Indicator
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a large, visually prominent progress indicator on the project overview tab that displays the overall project completion percentage. This can be rendered as a large progress bar or a circular progress ring, providing an immediate visual cue about how far along the project is.

### Progress Indicator Component

```typescript
// apps/web/src/components/project/overview/overall-progress-indicator.tsx
// Large progress indicator showing project completion percentage.
// Can be rendered as a circular ring or a large horizontal bar.

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { PieChart } from 'lucide-react';
import type { ProjectProgress } from '@laila/shared';

/**
 * OverallProgressIndicator renders:
 *
 * 1. Card with header: "Overall Progress" with PieChart icon
 *
 * 2. Circular progress ring (SVG-based):
 *    - Diameter: 160px
 *    - Track (background): zinc-100, strokeWidth: 12
 *    - Progress arc: indigo-500 for < 100%, emerald-500 at 100%
 *    - StrokeLinecap: "round" for smooth ends
 *    - Animated transition on value change (CSS transition on stroke-dashoffset)
 *    - Center text: percentage in JetBrains Mono, text-3xl, font-bold
 *      (e.g., "73%")
 *    - Below center text: "complete" label in text-sm, text-zinc-500
 *
 * 3. Below the ring:
 *    - "X of Y tasks completed" text
 *    - Font: text-sm, text-zinc-600
 *
 * 4. Color thresholds:
 *    - 0-25%: zinc-400 (early stage)
 *    - 25-50%: amber-500 (getting started)
 *    - 50-75%: indigo-500 (progressing)
 *    - 75-99%: blue-500 (nearly done)
 *    - 100%: emerald-500 (complete)
 */
```

### SVG Progress Ring

```typescript
// apps/web/src/components/ui/progress-ring.tsx
// Reusable SVG-based circular progress ring component.

/**
 * Props:
 * - value: number (0-100, percentage)
 * - size: number (diameter in px, default 160)
 * - strokeWidth: number (default 12)
 * - trackColor: string (default "var(--color-zinc-100)")
 * - progressColor: string (computed from value or passed explicitly)
 * - showLabel: boolean (default true)
 * - label: string (default "{value}%")
 * - sublabel: string (default "complete")
 *
 * SVG implementation:
 * - viewBox: "0 0 {size} {size}"
 * - Circle radius: (size - strokeWidth) / 2
 * - Circumference: 2 * PI * radius
 * - Dash offset: circumference * (1 - value / 100)
 * - Transform: rotate(-90deg) on the progress circle to start from top
 * - CSS transition: stroke-dashoffset 0.5s ease-in-out
 */
```

## Acceptance Criteria

- [ ] Overview tab displays an "Overall Progress" card with PieChart icon
- [ ] A circular SVG progress ring is rendered with 160px diameter and 12px stroke width
- [ ] The progress arc color changes based on completion percentage thresholds
- [ ] The center of the ring displays the percentage in JetBrains Mono text-3xl font-bold
- [ ] The word "complete" is displayed below the percentage in text-sm text-zinc-500
- [ ] Below the ring, "X of Y tasks completed" is displayed in text-sm text-zinc-600
- [ ] The progress arc animates smoothly when the value changes (CSS transition on stroke-dashoffset)
- [ ] The progress ring starts from the top (12 o'clock position) and fills clockwise
- [ ] Ring uses rounded stroke line caps for smooth visual appearance
- [ ] At 100% completion, the ring color changes to emerald-500
- [ ] The ProgressRing component is reusable and placed in `components/ui/`
- [ ] Loading state displays a Skeleton circular placeholder
- [ ] No `any` types are used in the implementation

## Technical Notes

- The SVG progress ring uses `stroke-dasharray` and `stroke-dashoffset` CSS properties for the arc rendering. The circumference is `2 * Math.PI * radius`, and the offset is `circumference * (1 - percentage / 100)`.
- A CSS `transform: rotate(-90deg)` on the progress circle element ensures the arc starts from the top rather than the right side.
- The animation uses `transition: stroke-dashoffset 0.5s ease-in-out` for smooth updates when data refreshes via polling.
- JetBrains Mono font is applied via the `font-mono` Tailwind class (configured to JetBrains Mono in Epic 8).
- The `ProgressRing` component should accept generic props so it can be reused in other contexts (e.g., individual story progress).

## References

- **SVG Techniques:** SVG circle stroke-dasharray/stroke-dashoffset for progress arcs
- **Design System:** Card components from shadcn/ui
- **Fonts:** JetBrains Mono for percentage display
- **Icons:** Lucide React — PieChart
- **API:** `GET /api/v1/projects/:id/overview` (progress percentage and task counts)

## Estimated Complexity

Medium — SVG progress ring implementation with dynamic colors, animated transitions, and responsive sizing.
