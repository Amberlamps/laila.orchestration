# Implement DAG Graph & Responsive Layout E2E Tests — Tasks

## User Story Summary

- **Title:** Implement DAG Graph & Responsive Layout E2E Tests
- **Description:** E2E tests covering DAG graph interaction (zoom, pan, node click navigation, view level toggle, status filter chips, minimap), and responsive layout verification across desktop (1440px), tablet (768px), and mobile (375px) viewports with layout-specific assertions.
- **Status:** Not Started
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Set Up Playwright Infrastructure

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Test DAG Graph Interaction](./test-dag-graph-interaction.md) | E2E test: create project with tasks and dependencies, navigate to Graph tab, verify nodes with correct status colors, zoom/pan/fit-to-view, click node navigates to detail, verify minimap, test view level toggle and status filter chips | Not Started | qa-expert | None |
| [Test Responsive Layout Desktop](./test-responsive-layout-desktop.md) | E2E test (1440px viewport): verify sidebar visible and expanded, 12-column grid, project cards in 3-column grid, tables with all columns, DAG graph with full controls | Not Started | accessibility-tester | None |
| [Test Responsive Layout Tablet](./test-responsive-layout-tablet.md) | E2E test (768px viewport): verify sidebar collapsed or toggle-able, 8-column grid, project cards in 2-column grid, tables adapt with some columns hidden or scrollable | Not Started | accessibility-tester | None |
| [Test Responsive Layout Mobile](./test-responsive-layout-mobile.md) | E2E test (375px viewport): verify bottom tab bar navigation (no sidebar), 4-column grid, project cards single column, modals full-width, DAG graph fullscreen encouraged | Not Started | accessibility-tester | None |

## Dependency Graph

```
Test DAG Graph Interaction        (independent)
Test Responsive Layout Desktop    (independent)
Test Responsive Layout Tablet     (independent)
Test Responsive Layout Mobile     (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All four tasks are independent. The DAG graph interaction test can be implemented by the qa-expert while the three responsive layout tests can be implemented in parallel by the accessibility-tester.
