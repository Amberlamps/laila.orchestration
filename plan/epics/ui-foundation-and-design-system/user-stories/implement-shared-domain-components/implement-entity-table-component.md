# Implement Entity Table Component

## Task Details

- **Title:** Implement Entity Table Component
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a reusable `EntityTable` component for listing entities (projects, epics, stories, tasks, workers, personas) with consistent table styling, sortable columns, pagination, and row-level actions. This component is used on every list page in the application.

### Visual Specification

- **Header Row:** Sticky, zinc-50 (FAFAFA) background, Overline typography (11px, semibold, uppercase), zinc-500 text, zinc-200 bottom border
- **Data Rows:** 40px height on desktop, 48px on mobile (larger touch targets), white bg, zinc-100 hover bg, zinc-200 bottom border
- **Row Click:** Optional — when enabled, entire row is clickable and navigates to entity detail page
- **Actions Column:** Right-aligned, three-dot menu (Lucide `MoreHorizontal` icon) opening a DropdownMenu with actions (Edit, Delete, etc.)
- **Pagination:** Bottom bar: "Showing 1-20 of 147" text (left), page navigation buttons (right)
- **Sort Indicators:** Column header text + ascending/descending chevron icon

### Component API

```tsx
// apps/web/src/components/ui/entity-table.tsx
// Reusable data table for entity list pages.
// Supports sortable columns, pagination, row click navigation,
// and per-row action menus.
import { MoreHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Generic column definition — typed to the row data shape.
interface ColumnDef<T> {
  /** Unique column identifier, also used as the sort key */
  key: string;
  /** Column header label (rendered in Overline style) */
  header: string;
  /** Render function for cell content */
  cell: (row: T) => React.ReactNode;
  /** Whether this column is sortable (default: false) */
  sortable?: boolean;
  /** Column width — CSS width value (e.g., "200px", "1fr") */
  width?: string;
  /** Horizontal alignment (default: "left") */
  align?: 'left' | 'center' | 'right';
}

interface RowAction<T> {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: (row: T) => void;
  /** If true, renders in red text (for destructive actions like Delete) */
  destructive?: boolean;
  /** If provided, action is hidden when this returns false */
  visible?: (row: T) => boolean;
}

interface EntityTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Row key extractor */
  getRowKey: (row: T) => string;
  /** Actions shown in the per-row three-dot menu */
  actions?: RowAction<T>[];
  /** Called when a row is clicked (for navigation) */
  onRowClick?: (row: T) => void;
  /** Current sort state */
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  /** Pagination state */
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  /** Loading state — shows skeleton rows */
  loading?: boolean;
  /** Custom empty state component */
  emptyState?: React.ReactNode;
}
```

## Acceptance Criteria

- [ ] Table renders with sticky header row (zinc-50 bg, Overline typography, zinc-200 border)
- [ ] Data rows are 40px height on desktop, 48px on mobile
- [ ] Rows show zinc-100 hover background
- [ ] Row click navigation works when `onRowClick` is provided (cursor: pointer on hover)
- [ ] Columns are defined via a generic `ColumnDef<T>` API with key, header, cell renderer
- [ ] Sortable columns show sort direction indicator (ChevronUp/ChevronDown) in header
- [ ] Clicking a sortable column header calls `onSort` with the column key
- [ ] Actions column renders a three-dot menu (DropdownMenu) with configurable actions
- [ ] Destructive actions render in red text within the dropdown
- [ ] Actions can be conditionally hidden via the `visible` function
- [ ] Pagination bar shows "Showing X-Y of Z" text and page navigation buttons
- [ ] Page navigation includes Previous/Next buttons, disabled at bounds
- [ ] Loading state shows skeleton rows (5 rows with shimmer animation)
- [ ] Empty state renders custom content when data array is empty and not loading
- [ ] Table is horizontally scrollable on mobile if columns overflow
- [ ] Component is fully generic — works with projects, epics, stories, tasks, workers, personas
- [ ] Table headers use `role="columnheader"` and sortable headers indicate sort state via `aria-sort`

## Technical Notes

- Use the shadcn `Table` component as the base, extending it with the sortable header, pagination, and actions column features.
- For the sticky header, use `position: sticky; top: 0; z-index: 10;` on the `<thead>` element. Ensure the background color is opaque to prevent content showing through.
- The three-dot menu uses the shadcn `DropdownMenu` component. Position it relative to the row to avoid overflow issues.
- For horizontal scrolling on mobile, wrap the table in a `div` with `overflow-x: auto` and add a subtle shadow indicator to signal scrollable content.
- Pagination is controlled externally — the component does not manage page state internally. This allows the parent page to coordinate with TanStack Query's `keepPreviousData` option for smooth page transitions.
- Consider using `@tanstack/react-table` for advanced table features (virtualization, column resizing), but for the initial implementation the custom approach is sufficient.

## References

- **Design Specification:** Section 3.8 (Entity Tables), Section 3.8.1 (Table Headers), Section 3.8.2 (Pagination)
- **Functional Requirements:** FR-UI-006 (entity listing), FR-UI-007 (sortable columns), FR-UI-008 (pagination)
- **shadcn/ui Docs:** Table, DropdownMenu components
- **WAI-ARIA Authoring Practices:** Table, Grid patterns

## Estimated Complexity

High — Generic typed column definitions, sortable headers, pagination controls, row-level action menus, loading skeletons, empty states, and responsive horizontal scrolling make this a feature-rich component with significant complexity.
