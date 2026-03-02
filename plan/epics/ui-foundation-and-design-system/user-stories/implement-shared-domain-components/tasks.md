# Implement Shared Domain UI Components — Tasks

## User Story Summary

- **Title:** Implement Shared Domain UI Components
- **Description:** Build reusable domain-specific UI components used throughout the orchestration dashboard: StatusBadge, KPICard/StatCard, MarkdownRenderer, MarkdownEditor, EntityTable, ConfirmDialog, Toast notifications, Skeleton loaders, and EmptyState.
- **Status:** Not Started
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Total Tasks:** 9
- **Dependencies:** Configure Tailwind CSS & shadcn/ui

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement StatusBadge Component](./implement-status-badge-component.md) | Status badge with color-coded background, text, and filled circle dot for all work statuses and lifecycle states | Not Started | ui-designer | None |
| [Implement KPI Stat Card Component](./implement-kpi-stat-card-component.md) | KPI/Stat card with large number, label, optional trend indicator, and status breakdown mini-bar | Not Started | ui-designer | None |
| [Implement Markdown Renderer Component](./implement-markdown-renderer-component.md) | Markdown renderer using react-markdown with Tailwind Typography prose styling | Not Started | frontend-developer | None |
| [Implement Markdown Editor Component](./implement-markdown-editor-component.md) | Markdown editor with formatting toolbar and live preview toggle | Not Started | frontend-developer | Implement Markdown Renderer Component |
| [Implement Entity Table Component](./implement-entity-table-component.md) | Reusable data table with sticky header, sortable columns, pagination, and row actions | Not Started | frontend-developer | None |
| [Implement Confirm Dialog Component](./implement-confirm-dialog-component.md) | Confirmation dialog for destructive actions with consequence statement and affected entity count | Not Started | frontend-developer | None |
| [Implement Toast Notification System](./implement-toast-notification-system.md) | Toast notification system with stacking, auto-dismiss, and semantic color variants | Not Started | frontend-developer | None |
| [Implement Skeleton Loader Components](./implement-skeleton-loader-components.md) | Skeleton loading states for tables, cards, and text with shimmer animation | Not Started | frontend-developer | None |
| [Implement Empty State Component](./implement-empty-state-component.md) | Empty state display with icon, title, description, and CTA button | Not Started | frontend-developer | None |

## Dependency Graph

```
Implement StatusBadge Component (independent)
Implement KPI Stat Card Component (independent)
Implement Markdown Renderer Component ---> Implement Markdown Editor Component
Implement Entity Table Component (independent)
Implement Confirm Dialog Component (independent)
Implement Toast Notification System (independent)
Implement Skeleton Loader Components (independent)
Implement Empty State Component (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All components except Markdown Editor — StatusBadge, KPICard, MarkdownRenderer, EntityTable, ConfirmDialog, Toast, Skeleton, EmptyState can all be built independently
2. **Phase 2:** Implement Markdown Editor — depends on MarkdownRenderer for its preview mode
