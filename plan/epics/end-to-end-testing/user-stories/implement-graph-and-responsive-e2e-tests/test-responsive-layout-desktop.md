# Test Responsive Layout Desktop

## Task Details

- **Title:** Test Responsive Layout Desktop
- **Status:** Not Started
- **Assigned Agent:** accessibility-tester
- **Parent User Story:** [Implement DAG Graph & Responsive Layout E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the desktop responsive layout at 1440px viewport width. Verify the sidebar navigation is visible and expanded, the page uses a 12-column grid layout, project cards render in a 3-column grid, data tables display all columns without horizontal scrolling, and the DAG graph shows full controls (zoom, pan, fit, minimap, view toggle, filters).

### Test: Desktop Responsive Layout (1440px)

```typescript
// apps/web/e2e/graph-and-responsive/responsive-desktop.spec.ts
// E2E tests for the desktop layout at 1440px viewport.
// Verifies sidebar, grid layout, table columns, and full graph controls.
import { test, expect } from "../fixtures";
import { DashboardPage, ProjectListPage, GraphPage } from "../page-objects";

// Configure this test file to use a desktop viewport.
test.use({
  viewport: { width: 1440, height: 900 },
});

test.describe("Responsive Layout — Desktop (1440px)", () => {
  test("sidebar navigation is visible and expanded", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Verify the sidebar is visible.
    const sidebar = page.getByRole("navigation", { name: /main/i });
    await expect(sidebar).toBeVisible();

    // Verify the sidebar is expanded (shows text labels, not just icons).
    // Check that navigation link text is visible (not hidden behind icons).
    const dashboardLink = sidebar.getByRole("link", { name: /dashboard/i });
    await expect(dashboardLink).toBeVisible();

    const projectsLink = sidebar.getByRole("link", { name: /projects/i });
    await expect(projectsLink).toBeVisible();

    const workersLink = sidebar.getByRole("link", { name: /workers/i });
    await expect(workersLink).toBeVisible();

    // Verify sidebar text labels are rendered (not just icons).
    // In collapsed mode, only icons would be visible.
    const sidebarWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThan(200); // Expanded sidebar > 200px
  });

  test("project cards render in 3-column grid", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed 6 projects to fill two rows of the 3-column grid.
    seedData({});

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // Verify the project cards container uses a grid layout.
    const cardGrid = page.getByTestId("project-card-grid");
    await expect(cardGrid).toBeVisible();

    // Verify the grid has 3 columns by checking CSS grid-template-columns.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );
    // 3-column grid should have 3 column definitions.
    const columnCount = gridColumns.split(" ").length;
    expect(columnCount).toBe(3);
  });

  test("data tables display all columns without scrolling", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // Verify the projects table is visible.
    await expect(projectList.projectsTable).toBeVisible();

    // Verify key columns are visible: Name, Status, Epics, Stories, Updated.
    const headerRow = projectList.projectsTable.getByRole("row").first();
    await expect(headerRow.getByRole("columnheader", { name: /name/i })).toBeVisible();
    await expect(headerRow.getByRole("columnheader", { name: /status/i })).toBeVisible();
    await expect(headerRow.getByRole("columnheader", { name: /epics/i })).toBeVisible();
    await expect(headerRow.getByRole("columnheader", { name: /stories/i })).toBeVisible();
    await expect(headerRow.getByRole("columnheader", { name: /updated/i })).toBeVisible();

    // Verify the table does not have horizontal scroll.
    const tableContainer = page.getByTestId("table-container");
    const scrollWidth = await tableContainer.evaluate(
      (el) => el.scrollWidth > el.clientWidth
    );
    expect(scrollWidth).toBe(false);
  });

  test("DAG graph shows full controls at desktop viewport", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Verify all graph controls are visible at desktop width.
    await expect(graph.zoomInButton).toBeVisible();
    await expect(graph.zoomOutButton).toBeVisible();
    await expect(graph.fitViewButton).toBeVisible();
    await expect(graph.minimap).toBeVisible();
    await expect(graph.viewLevelToggle).toBeVisible();
    await expect(graph.statusFilters).toBeVisible();
  });

  test("12-column grid layout on dashboard", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Verify the main content area uses a 12-column grid.
    const mainContent = page.getByRole("main");
    const gridColumns = await mainContent.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );

    // 12-column grid should have 12 column definitions.
    // The exact values depend on the CSS grid implementation.
    const columnCount = gridColumns.split(" ").length;
    expect(columnCount).toBe(12);
  });
});
```

## Acceptance Criteria

- [ ] Test verifies the sidebar navigation is visible and expanded (> 200px width) at 1440px viewport
- [ ] Test verifies sidebar navigation links (Dashboard, Projects, Workers) show text labels
- [ ] Test verifies project cards render in a 3-column CSS grid layout
- [ ] Test verifies data tables display all expected columns (Name, Status, Epics, Stories, Updated)
- [ ] Test verifies tables do not have horizontal scrolling at 1440px
- [ ] Test verifies the DAG graph shows all controls (zoom in/out, fit view, minimap, view toggle, status filters)
- [ ] Test verifies the dashboard uses a 12-column grid layout
- [ ] All tests use the 1440px x 900px viewport configuration
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Playwright's `test.use({ viewport })` sets the viewport size for all tests in the file. This ensures consistent layout testing at exactly 1440px.
- CSS grid layout assertions use `window.getComputedStyle().gridTemplateColumns` which returns the resolved column track sizes. Counting the space-separated values gives the column count.
- Table horizontal scrolling is detected by comparing `scrollWidth` vs `clientWidth` on the table container. If `scrollWidth > clientWidth`, the table has horizontal overflow.
- The sidebar expansion check verifies the width is > 200px, which distinguishes the expanded state from the collapsed icon-only state (typically ~60px).
- Tailwind CSS v4 grid classes map to standard CSS grid properties. The 12-column grid uses `grid-template-columns: repeat(12, minmax(0, 1fr))`.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — responsive layout verification: desktop)
- **Design Specification:** Desktop layout wireframes, 12-column grid system, sidebar navigation
- **Functional Requirements:** FR-UI-001 (responsive layout), FR-UI-002 (sidebar navigation)

## Estimated Complexity

Medium — Desktop layout assertions require CSS property inspection via `evaluate()` and careful selector targeting for grid containers. Cross-browser CSS grid rendering may vary slightly.
