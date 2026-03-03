'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Public API — Generic column definition typed to the row data shape.
 * --------------------------------------------------------------------------- */

export interface ColumnDef<T> {
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

export interface RowAction<T> {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: (row: T) => void;
  /** If true, renders in red text (for destructive actions like Delete) */
  destructive?: boolean;
  /** If provided, action is hidden when this returns false */
  visible?: (row: T) => boolean;
}

export interface EntityTableProps<T> {
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

/* ---------------------------------------------------------------------------
 * Internal: Alignment utility
 * --------------------------------------------------------------------------- */

const alignmentClass: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/* ---------------------------------------------------------------------------
 * Internal: Sort indicator for column headers
 * --------------------------------------------------------------------------- */

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | undefined }) {
  if (direction === 'asc') {
    return <ChevronUp className="ml-1 inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  if (direction === 'desc') {
    return <ChevronDown className="ml-1 inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  /* Sortable but not currently sorted — render a subtle placeholder to avoid layout shift */
  return (
    <ChevronUp
      className="ml-1 inline-block h-3.5 w-3.5 shrink-0 opacity-0 group-hover/sort:opacity-40"
      aria-hidden="true"
    />
  );
}

/* ---------------------------------------------------------------------------
 * Internal: Skeleton row for loading state
 * --------------------------------------------------------------------------- */

function SkeletonCell({ width }: { width?: string }) {
  return (
    <div
      aria-hidden="true"
      className="animate-shimmer h-4 rounded bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 bg-[length:200%_100%]"
      style={{ width: width ?? '75%' }}
    />
  );
}

function SkeletonRow<T>({ columns, hasActions }: { columns: ColumnDef<T>[]; hasActions: boolean }) {
  return (
    <TableRow className="h-10 border-b border-zinc-200 md:h-10">
      {columns.map((col) => (
        <TableCell
          key={col.key}
          className={cn('p-2 align-middle', alignmentClass[col.align ?? 'left'])}
          style={col.width ? { width: col.width } : undefined}
        >
          <SkeletonCell />
        </TableCell>
      ))}
      {hasActions && (
        <TableCell className="w-12 p-2 text-right">
          <div
            aria-hidden="true"
            className="animate-shimmer ml-auto h-4 w-4 rounded bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 bg-[length:200%_100%]"
          />
        </TableCell>
      )}
    </TableRow>
  );
}

/* ---------------------------------------------------------------------------
 * Internal: Row-level action menu (three-dot dropdown)
 * --------------------------------------------------------------------------- */

function RowActionMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  const visibleActions = actions.filter((action) => !action.visible || action.visible(row));

  if (visibleActions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 p-0"
          onClick={(e) => {
            /* Prevent triggering onRowClick when opening the menu */
            e.stopPropagation();
          }}
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              {...(action.destructive ? { destructive: true } : {})}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(row);
              }}
            >
              {Icon && <Icon className="mr-2 h-4 w-4" />}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------------------
 * Internal: Pagination bar
 * --------------------------------------------------------------------------- */

function PaginationBar({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange?: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = Math.min((page - 1) * pageSize + 1, totalCount);
  const end = Math.min(page * pageSize, totalCount);

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
      <span className="text-body-sm text-zinc-500">
        Showing {start}&ndash;{end} of {totalCount}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={isFirstPage}
          onClick={() => {
            onPageChange?.(page - 1);
          }}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isLastPage}
          onClick={() => {
            onPageChange?.(page + 1);
          }}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * EntityTable — Main component
 * --------------------------------------------------------------------------- */

export function EntityTable<T>({
  columns,
  data,
  getRowKey,
  actions,
  onRowClick,
  sortBy,
  sortDirection,
  onSort,
  page,
  pageSize,
  totalCount,
  onPageChange,
  loading = false,
  emptyState,
}: EntityTableProps<T>) {
  const hasActions = Boolean(actions && actions.length > 0);
  const totalColumns = columns.length + (hasActions ? 1 : 0);

  /* Determine aria-sort value for a given column */
  const getAriaSort = (col: ColumnDef<T>): 'ascending' | 'descending' | 'none' | undefined => {
    if (!col.sortable) return undefined;
    if (sortBy === col.key) {
      return sortDirection === 'asc' ? 'ascending' : 'descending';
    }
    return 'none';
  };

  /* Handle sort column header click */
  const handleSort = (col: ColumnDef<T>) => {
    if (col.sortable && onSort) {
      onSort(col.key);
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-200">
      {/* Horizontally scrollable container for mobile */}
      <div className="relative w-full overflow-x-auto">
        <Table>
          {/* ----- Header ----- */}
          <TableHeader className="sticky top-0 z-10 bg-zinc-50">
            <TableRow className="border-b border-zinc-200 hover:bg-transparent">
              {columns.map((col) => {
                const ariaSort = getAriaSort(col);
                const isSortable = col.sortable && Boolean(onSort);

                return (
                  <TableHead
                    key={col.key}
                    role="columnheader"
                    aria-sort={ariaSort}
                    className={cn(
                      'text-overline h-10 px-4 text-zinc-500',
                      alignmentClass[col.align ?? 'left'],
                      isSortable && 'group/sort cursor-pointer select-none',
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={
                      isSortable
                        ? () => {
                            handleSort(col);
                          }
                        : undefined
                    }
                    onKeyDown={
                      isSortable
                        ? (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col);
                            }
                          }
                        : undefined
                    }
                    tabIndex={isSortable ? 0 : undefined}
                  >
                    <span className="inline-flex items-center">
                      {col.header}
                      {isSortable && (
                        <SortIndicator direction={sortBy === col.key ? sortDirection : undefined} />
                      )}
                    </span>
                  </TableHead>
                );
              })}
              {hasActions && (
                <TableHead
                  role="columnheader"
                  className="text-overline h-10 w-12 px-4 text-right text-zinc-500"
                >
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          {/* ----- Body ----- */}
          <TableBody>
            {/* Loading skeleton */}
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow
                  key={`skeleton-${String(i)}`}
                  columns={columns}
                  hasActions={hasActions}
                />
              ))}

            {/* Empty state */}
            {!loading && data.length === 0 && emptyState && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={totalColumns} className="h-48 text-center">
                  {emptyState}
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {!loading &&
              data.map((row) => {
                const rowKey = getRowKey(row);
                const isClickable = Boolean(onRowClick);

                const handleRowClick = onRowClick
                  ? () => {
                      onRowClick(row);
                    }
                  : undefined;

                const handleRowKeyDown = onRowClick
                  ? (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined;

                return (
                  <TableRow
                    key={rowKey}
                    className={cn(
                      'h-10 border-b border-zinc-200 bg-white transition-colors hover:bg-zinc-100 md:h-10',
                      /* Mobile: 48px height for larger touch targets */
                      'max-md:h-12',
                      isClickable && 'cursor-pointer',
                    )}
                    onClick={handleRowClick}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={handleRowKeyDown}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          'text-body px-4 py-2 align-middle',
                          alignmentClass[col.align ?? 'left'],
                        )}
                        style={col.width ? { width: col.width } : undefined}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    {hasActions && actions && (
                      <TableCell className="w-12 px-2 py-2 text-right align-middle">
                        <RowActionMenu row={row} actions={actions} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* ----- Pagination ----- */}
      {page !== undefined && pageSize !== undefined && totalCount !== undefined && !loading && (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          {...(onPageChange ? { onPageChange } : {})}
        />
      )}
    </div>
  );
}
