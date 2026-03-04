# Implement Global Dashboard — Tasks

## User Story Summary

- **Title:** Implement Global Dashboard
- **Description:** Build the main dashboard page that provides a cross-project overview of the orchestration platform. Includes KPI summary stat cards (total projects, active workers, failures, blocked items, aggregate cost), a project card grid with compact summaries, a recent activity snapshot showing the last 20 audit events, an active workers summary table, and an empty state for new users with no projects.
- **Status:** Complete
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** None

## Tasks

| Task                                                                                  | Description                                                                                                  | Status   | Assigned Agent     | Dependencies |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------------------ | ------------ |
| [Implement Dashboard KPI Summary Row](./implement-dashboard-kpi-summary-row.md)       | Cross-project KPI stat cards: Total Projects, Active Workers, Total Failures, Total Blocked, Aggregate Cost  | Complete | frontend-developer | None         |
| [Implement Projects-at-a-Glance Grid](./implement-projects-at-a-glance-grid.md)       | Responsive project card grid with name, status badge, progress bar, failure/blocked counts, and worker count | Complete | frontend-developer | None         |
| [Implement Recent Activity Snapshot](./implement-recent-activity-snapshot.md)         | Last 20 audit events across all projects with actor, action, and entity links                                | Complete | frontend-developer | None         |
| [Implement Active Workers Summary Table](./implement-active-workers-summary-table.md) | Table of currently assigned workers with project, story links, and time elapsed                              | Complete | frontend-developer | None         |
| [Implement Dashboard Empty State](./implement-dashboard-empty-state.md)               | Empty state for zero projects with welcome message, description, and create project CTA                      | Complete | ui-designer        | None         |

## Dependency Graph

```
Implement Dashboard KPI Summary Row        (independent)
Implement Projects-at-a-Glance Grid        (independent)
Implement Recent Activity Snapshot          (independent)
Implement Active Workers Summary Table      (independent)
Implement Dashboard Empty State             (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All five tasks are independent and can be developed simultaneously. They all compose the global dashboard page and depend only on shared design system components from Epic 8 (KPICard, EntityTable, StatusBadge, etc.).
2. **Priority ordering:** Task 1 (KPI Summary Row) and Task 2 (Projects Grid) are highest priority as they provide the primary dashboard value. Task 5 (Empty State) is lowest priority.
