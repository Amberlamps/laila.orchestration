# Implement Auto-Refresh & Polling — Tasks

## User Story Summary

- **Title:** Implement Auto-Refresh & Polling
- **Description:** Configure TanStack Query polling intervals for all dashboard and project detail queries, implement a "Last updated" indicator with manual refresh button, and integrate the Page Visibility API to pause polling when the tab is not visible and resume on focus.
- **Status:** Complete
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Implement Global Dashboard, Implement Project Overview Tab

## Tasks

| Task                                                                                | Description                                                                                 | Status   | Assigned Agent      | Dependencies                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- | ------------------- | ------------------------------------- |
| [Configure Polling for Dashboard Views](./configure-polling-for-dashboard-views.md) | Configure TanStack Query refetchInterval (15s) for all dashboard and project detail queries | Complete | fullstack-developer | None                                  |
| [Implement Last-Updated Indicator](./implement-last-updated-indicator.md)           | "Last updated: X seconds ago" indicator in page headers with manual refresh button          | Complete | frontend-developer  | Configure Polling for Dashboard Views |
| [Implement Page Visibility Integration](./implement-page-visibility-integration.md) | Pause polling when tab is not visible, resume on focus with immediate refresh               | Complete | fullstack-developer | Configure Polling for Dashboard Views |

## Dependency Graph

```
Configure Polling for Dashboard Views
    |
    +---> Implement Last-Updated Indicator
    |
    +---> Implement Page Visibility Integration
```

## Suggested Implementation Order

1. **Phase 1:** Configure Polling for Dashboard Views — establishes the polling foundation for all queries
2. **Phase 2 (parallel):** Implement Last-Updated Indicator + Implement Page Visibility Integration — both depend on polling configuration and can be developed simultaneously
