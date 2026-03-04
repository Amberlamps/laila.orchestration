# Dashboard & Monitoring UI — User Stories

## Epic Summary

- **Title:** Dashboard & Monitoring UI
- **Description:** Global dashboard with cross-project KPI summary, project overview tab with charts and activity feed, and auto-refresh polling using TanStack Query. Provides at-a-glance visibility into project health, worker activity, cost tracking, and recent audit events across the entire orchestration platform.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 3
- **Dependencies:** Epic 8 (UI Foundation & Design System), Epic 9 (Entity Management UI)

## User Stories

| User Story                                                                                     | Description                                                                                                                                                      | Status                      | Tasks   | Dependencies                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ---------------------------------------------------------- |
| [Implement Global Dashboard](./user-stories/implement-global-dashboard/tasks.md)               | Cross-project KPI stat cards, project card grid, recent activity snapshot, active workers table, and empty state for the main dashboard page                     | Complete                    | 5 tasks | None                                                       |
| [Implement Project Overview Tab](./user-stories/implement-project-overview-tab/tasks.md)       | Project detail overview tab with summary stat cards, active workers card, throughput and completion charts, cost tracking, progress indicator, and activity feed | In Progress (laila-agent-3) | 7 tasks | None                                                       |
| [Implement Auto-Refresh & Polling](./user-stories/implement-auto-refresh-and-polling/tasks.md) | TanStack Query polling configuration, last-updated indicator with manual refresh, and Page Visibility API integration for intelligent polling                    | Not Started                 | 3 tasks | Implement Global Dashboard, Implement Project Overview Tab |

## Dependency Graph

```
Implement Global Dashboard --------+
                                   |
                                   +--> Implement Auto-Refresh & Polling
                                   |
Implement Project Overview Tab ----+
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Global Dashboard + Implement Project Overview Tab — these are independent page/tab implementations that can be developed simultaneously by different agents
2. **Phase 2:** Implement Auto-Refresh & Polling — configures polling behavior across all dashboard and project detail queries built in Phase 1
