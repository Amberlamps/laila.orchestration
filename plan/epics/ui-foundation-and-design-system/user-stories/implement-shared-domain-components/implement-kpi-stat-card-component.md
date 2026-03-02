# Implement KPI Stat Card Component

## Task Details

- **Title:** Implement KPI Stat Card Component
- **Status:** Not Started
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a `KPICard` (also referred to as `StatCard`) component for displaying key performance indicators on the dashboard and entity detail pages. Each card prominently displays a single numeric metric with a label, optional trend indicator, and optional status breakdown mini-bar.

### Visual Specification

- **Container:** Card with white bg, zinc-200 border, 8px radius, shadow-sm
- **Left Border:** 3px colored left border (color determined by card context)
- **Layout:** Vertical stack — number on top, label below
- **Number:** Display typography (30px, bold) or H1 (24px, semibold) depending on context
- **Label:** Caption typography (12px, medium, zinc-500)
- **Trend Indicator (optional):** Small arrow icon (Lucide `TrendingUp`/`TrendingDown`) + percentage text in green (positive) or red (negative)
- **Status Breakdown Mini-Bar (optional):** Thin horizontal bar (4px height) showing proportional segments of status colors (e.g., 60% green, 20% blue, 20% amber)

```tsx
// apps/web/src/components/ui/kpi-card.tsx
// KPI/Stat card for dashboard metrics and entity detail summaries.
// Displays a large number with label, optional trend, and optional status breakdown.
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatusSegment {
  status: string;      // Status key for color lookup
  value: number;       // Count or proportion for this segment
  color: string;       // Tailwind bg color class (e.g., "bg-green-500")
}

interface KPICardProps {
  /** The primary metric value displayed prominently */
  value: string | number;
  /** Descriptive label shown below the value */
  label: string;
  /** Color of the left border accent (Tailwind border color class) */
  accentColor?: string;
  /** Trend percentage — positive shows green up arrow, negative shows red down arrow */
  trend?: number;
  /** Optional status breakdown bar showing proportional segments */
  breakdown?: StatusSegment[];
  className?: string;
}

// Usage on the dashboard:
// <KPICard value={47} label="Active Tasks" accentColor="border-blue-500" trend={12.5} />
// <KPICard value="$142.30" label="Total Cost" accentColor="border-green-500" />
// <KPICard value={85} label="Progress %" accentColor="border-indigo-500"
//   breakdown={[
//     { status: "complete", value: 85, color: "bg-green-500" },
//     { status: "in_progress", value: 10, color: "bg-blue-500" },
//     { status: "blocked", value: 5, color: "bg-amber-500" },
//   ]}
// />
```

## Acceptance Criteria

- [ ] KPICard renders a card with white bg, zinc-200 border, 8px radius, and shadow-sm
- [ ] Left 3px accent border is configurable via `accentColor` prop
- [ ] Primary value is displayed in Display typography (30px, bold)
- [ ] Label is displayed below the value in Caption typography (12px, medium, zinc-500)
- [ ] When `trend` is provided and positive, a green upward arrow icon and percentage are shown
- [ ] When `trend` is provided and negative, a red downward arrow icon and percentage are shown
- [ ] When `breakdown` is provided, a 4px horizontal bar shows proportional colored segments
- [ ] Breakdown bar segments are proportional to their `value` fields (percentage of total)
- [ ] Component accepts a `className` prop for layout customization (e.g., grid column span)
- [ ] Card is responsive and works within grid layouts (desktop 3-4 columns, mobile 1-2 columns)
- [ ] Values that are strings (e.g., "$142.30") render correctly alongside numeric values
- [ ] Component does not render trend or breakdown sections when those props are omitted

## Technical Notes

- The breakdown bar segments should use `flex` layout with each segment's width calculated as a percentage of the total. Use `Math.round` for segment widths to avoid sub-pixel rendering issues.
- The accent border can use Tailwind's `border-l-3` utility (or `border-l-[3px]` for exact sizing) combined with the dynamic color class.
- For trend arrows, use Lucide's `TrendingUp` and `TrendingDown` icons at 14px size. Display trend as `+12.5%` or `-3.2%` format.
- The component should work in both grid and flex container contexts. Avoid setting fixed widths; let the parent container control sizing.
- Consider adding a loading/skeleton variant that can be used while data is being fetched.

## References

- **Design Specification:** Section 3.5 (KPI Cards), Section 4.2 (Dashboard Layout)
- **Functional Requirements:** FR-DASH-002 (KPI metrics display), FR-DASH-003 (trend indicators)
- **Lucide Icons Docs:** TrendingUp, TrendingDown icons

## Estimated Complexity

Medium — The card itself is straightforward, but the optional trend indicator and proportional breakdown bar add visual complexity that requires careful layout and responsive behavior.
