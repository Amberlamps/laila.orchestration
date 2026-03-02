# Test DAG Graph Interaction

## Task Details

- **Title:** Test DAG Graph Interaction
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement DAG Graph & Responsive Layout E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the DAG graph interaction. Create a project with tasks and dependencies, navigate to the Graph tab, verify nodes are rendered with correct status colors, test zoom in/out, pan, fit-to-view, click a node to navigate to its detail page, verify the minimap is visible, test the view level toggle (Task/Story/Epic), and test the status filter chips.

### Test: DAG Graph Interaction

```typescript
// apps/web/e2e/graph-and-responsive/dag-graph.spec.ts
// E2E tests for the DAG graph visualization powered by ReactFlow.
// Verifies node rendering, interaction controls (zoom, pan, fit),
// node click navigation, minimap, view level toggle, and status filters.
import { test, expect } from "../fixtures";
import { GraphPage, ProjectDetailPage } from "../page-objects";

test.describe("DAG Graph Interaction", () => {
  test.beforeEach(async ({ authenticatedPage: page, seedData }) => {
    // Seed a project with tasks and dependencies that form a DAG.
    // Project → Epic → Story → 3 Tasks (A→B→C linear chain).
    // Task A: not-started, Task B: blocked, Task C: blocked.
    seedData({});
  });

  test("graph renders nodes with correct status colors", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Verify the ReactFlow canvas is rendered.
    await expect(graph.canvas).toBeVisible();

    // Verify nodes are rendered for each task.
    const nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(3);

    // Verify status colors on nodes.
    // "not-started" nodes should have a specific CSS class/color.
    await graph.expectNodeStatus("Setup Database Schema", "status-not-started");
    // "blocked" nodes should have a different CSS class/color.
    await graph.expectNodeStatus("Implement API Endpoint", "status-blocked");
    await graph.expectNodeStatus("Write Integration Tests", "status-blocked");
  });

  test("zoom in, zoom out, and fit-to-view controls", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Get the initial viewport transform for comparison.
    const initialTransform = await page.evaluate(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      return viewport?.getAttribute("style") ?? "";
    });

    // Zoom in twice.
    await graph.zoomIn(2);

    // Verify the viewport transform changed (zoom level increased).
    const zoomedInTransform = await page.evaluate(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      return viewport?.getAttribute("style") ?? "";
    });
    expect(zoomedInTransform).not.toBe(initialTransform);

    // Zoom out once.
    await graph.zoomOut(1);

    // Fit to view resets the viewport.
    await graph.fitView();

    // After fit-to-view, the viewport should encompass all nodes.
    // Verify at least one node is visible in the viewport.
    const nodes = await graph.getNodes();
    await expect(nodes.first()).toBeVisible();
  });

  test("pan the graph canvas", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Get initial viewport position.
    const initialTransform = await page.evaluate(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      return viewport?.getAttribute("style") ?? "";
    });

    // Pan the canvas 100px to the right and 50px down.
    await graph.pan(100, 50);

    // Verify the viewport position changed.
    const pannedTransform = await page.evaluate(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      return viewport?.getAttribute("style") ?? "";
    });
    expect(pannedTransform).not.toBe(initialTransform);
  });

  test("click node navigates to entity detail page", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Click the "Setup Database Schema" node.
    await graph.clickNode("Setup Database Schema");

    // Verify navigation to the task detail page.
    await expect(page).toHaveURL(/\/tasks\//);

    // Verify the task detail page shows the correct title.
    const heading = page.getByTestId("entity-heading");
    await expect(heading).toContainText("Setup Database Schema");
  });

  test("minimap is visible and interactive", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Verify the minimap is rendered.
    await expect(graph.minimap).toBeVisible();

    // Verify the minimap contains node representations.
    const minimapNodes = graph.minimap.locator("rect");
    const count = await minimapNodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test("view level toggle switches between Task, Story, and Epic views", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Default view should show Task-level nodes.
    await expect(graph.viewLevelToggle).toBeVisible();

    // Verify the Task view shows 3 nodes.
    let nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(3);

    // Switch to Story view.
    await graph.setViewLevel("story");

    // Verify Story view shows 1 node (one story).
    nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(1);

    // Switch to Epic view.
    await graph.setViewLevel("epic");

    // Verify Epic view shows 1 node (one epic).
    nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(1);

    // Switch back to Task view.
    await graph.setViewLevel("task");
    nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(3);
  });

  test("status filter chips show and hide nodes by status", async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Verify all status filter chips are visible.
    await expect(graph.statusFilters).toBeVisible();

    // Initially, all statuses are shown (3 nodes).
    let nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(3);

    // Deselect "blocked" status filter.
    await graph.toggleStatusFilter("blocked");

    // Only "not-started" nodes should remain visible (1 node).
    nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(1);

    // Re-enable "blocked" status filter.
    await graph.toggleStatusFilter("blocked");

    // All 3 nodes should be visible again.
    nodes = await graph.getNodes();
    await expect(nodes).toHaveCount(3);
  });
});
```

## Acceptance Criteria

- [ ] Test verifies the ReactFlow canvas renders with the correct number of nodes
- [ ] Test verifies nodes display correct status color classes (not-started, blocked, in-progress, completed, failed)
- [ ] Test verifies zoom in/out changes the viewport transform
- [ ] Test verifies fit-to-view resets the viewport to encompass all nodes
- [ ] Test verifies pan (drag) changes the viewport position
- [ ] Test verifies clicking a node navigates to the entity detail page
- [ ] Test verifies the minimap is visible and contains node representations
- [ ] Test verifies the view level toggle switches between Task, Story, and Epic granularity
- [ ] Test verifies the node count changes appropriately with each view level
- [ ] Test verifies status filter chips hide and show nodes by status
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- ReactFlow renders nodes as `<div>` elements with class `.react-flow__node`. The graph canvas has class `.react-flow` and the viewport wrapper has class `.react-flow__viewport`.
- Zoom and pan are verified by comparing the CSS `transform` property on the viewport element. ReactFlow uses CSS transforms for viewport manipulation.
- Node click navigation is implemented via ReactFlow's `onNodeClick` handler, which programmatically navigates to the entity detail page using Next.js Router.
- The minimap is a ReactFlow built-in component (`.react-flow__minimap`) that shows a scaled overview of the graph. It uses SVG `<rect>` elements for node representations.
- View level toggle uses radio buttons (Task/Story/Epic) that filter the graph data and re-render with different node sets.
- Status filter chips use checkboxes that show/hide nodes by their current status. The graph re-renders when filters change.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — DAG graph interaction: zoom, pan, node click navigation)
- **Functional Requirements:** FR-GRAPH-001 (DAG rendering), FR-GRAPH-002 (zoom/pan/fit controls), FR-GRAPH-003 (node click navigation), FR-GRAPH-004 (view level toggle), FR-GRAPH-005 (status filters)
- **Design Specification:** Graph page layout, ReactFlow configuration, minimap placement

## Estimated Complexity

Large — ReactFlow interactions require careful Playwright automation (mouse events for pan, viewport transform comparisons for zoom). The view level toggle and status filter tests require verifying dynamic node count changes. Cross-browser compatibility with CSS transforms and mouse events adds complexity.
