# Test Responsive Layout Tablet

## Task Details

- **Title:** Test Responsive Layout Tablet
- **Status:** Complete
- **Assigned Agent:** accessibility-tester
- **Parent User Story:** [Implement DAG Graph & Responsive Layout E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the tablet responsive layout at 768px viewport width. Verify the sidebar navigation is collapsed or toggle-able, the page uses an 8-column grid layout, project cards render in a 2-column grid, and data tables adapt by hiding less important columns or enabling horizontal scrolling.

### Test: Tablet Responsive Layout (768px)

```typescript
// apps/web/e2e/graph-and-responsive/responsive-tablet.spec.ts
// E2E tests for the tablet layout at 768px viewport.
// Verifies collapsed sidebar, 8-column grid, 2-column card grid,
// and adaptive table behavior.
import { test, expect } from '../fixtures';
import { DashboardPage, ProjectListPage } from '../page-objects';

// Configure this test file to use a tablet viewport.
test.use({
  viewport: { width: 768, height: 1024 },
});

test.describe('Responsive Layout — Tablet (768px)', () => {
  test('sidebar is collapsed or has a toggle button', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    // At tablet width, the sidebar should be collapsed (icon-only)
    // or hidden behind a toggle button.
    const sidebar = page.getByRole('navigation', { name: /main/i });

    // Option A: Sidebar is collapsed (narrow width, icon-only).
    const sidebarVisible = await sidebar.isVisible();

    if (sidebarVisible) {
      // Collapsed sidebar should be narrow (< 80px).
      const sidebarWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
      expect(sidebarWidth).toBeLessThan(80);
    } else {
      // Option B: Sidebar is hidden behind a hamburger/toggle button.
      const toggleButton = page.getByRole('button', { name: /menu|toggle/i });
      await expect(toggleButton).toBeVisible();

      // Click toggle to open the sidebar.
      await toggleButton.click();
      await expect(sidebar).toBeVisible();

      // Close the sidebar.
      await toggleButton.click();
      await expect(sidebar).not.toBeVisible();
    }
  });

  test('project cards render in 2-column grid', async ({ authenticatedPage: page, seedData }) => {
    seedData({});

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    const cardGrid = page.getByTestId('project-card-grid');
    await expect(cardGrid).toBeVisible();

    // Verify the grid has 2 columns at tablet width.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );
    const columnCount = gridColumns.split(' ').length;
    expect(columnCount).toBe(2);
  });

  test('tables adapt by hiding secondary columns or enabling scroll', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    const headerRow = projectList.projectsTable.getByRole('row').first();

    // Primary columns (Name, Status) should always be visible.
    await expect(headerRow.getByRole('columnheader', { name: /name/i })).toBeVisible();
    await expect(headerRow.getByRole('columnheader', { name: /status/i })).toBeVisible();

    // Secondary columns may be hidden or the table may scroll.
    // Check if the "Updated" column is hidden at tablet width.
    const updatedColumn = headerRow.getByRole('columnheader', {
      name: /updated/i,
    });

    const isVisible = await updatedColumn.isVisible();
    if (!isVisible) {
      // Column is hidden at tablet width (responsive column hiding).
      // This is the expected behavior for secondary columns.
    } else {
      // If the column is visible, verify horizontal scrolling is available.
      const tableContainer = page.getByTestId('table-container');
      const hasScroll = await tableContainer.evaluate((el) => el.scrollWidth > el.clientWidth);
      // At tablet width, some overflow is acceptable if scrollable.
      expect(hasScroll).toBe(true);
    }
  });

  test('8-column grid layout on dashboard', async ({ authenticatedPage: page, seedData }) => {
    seedData({});

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Verify the main content area adapts to an 8-column grid.
    const mainContent = page.getByRole('main');
    const gridColumns = await mainContent.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );

    const columnCount = gridColumns.split(' ').length;
    // At tablet width, the grid should have 8 columns
    // (or a responsive equivalent like 4+4).
    expect(columnCount).toBeLessThanOrEqual(8);
    expect(columnCount).toBeGreaterThanOrEqual(4);
  });

  test('modals render within viewport bounds', async ({ authenticatedPage: page }) => {
    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // Open the create project modal.
    await projectList.createProjectButton.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Verify the modal fits within the 768px viewport.
    const modalBox = await modal.boundingBox();
    expect(modalBox).toBeTruthy();
    expect(modalBox!.width).toBeLessThanOrEqual(768);

    // Verify the modal is not clipped (fully visible).
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.y).toBeGreaterThanOrEqual(0);
  });
});
```

## Acceptance Criteria

- [ ] Test verifies the sidebar is collapsed (< 80px width) or hidden behind a toggle button at 768px
- [ ] Test verifies the sidebar toggle opens and closes the navigation when clicked
- [ ] Test verifies project cards render in a 2-column CSS grid at 768px
- [ ] Test verifies primary table columns (Name, Status) remain visible at 768px
- [ ] Test verifies secondary table columns are either hidden or the table enables horizontal scrolling
- [ ] Test verifies the dashboard grid adapts to 4-8 columns at tablet width
- [ ] Test verifies modals render within the 768px viewport bounds (not clipped)
- [ ] All tests use the 768px x 1024px viewport configuration
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Tailwind CSS v4 responsive breakpoints: `md` (768px) triggers tablet layout rules. The sidebar collapse/toggle is typically controlled by a `md:` prefix class.
- The sidebar test handles both collapsed (icon-only) and hidden (toggle) implementations because the exact design may vary. The test adapts its assertions based on which pattern is detected.
- Table column hiding uses Tailwind's responsive display utilities (e.g., `hidden md:table-cell`). The test checks both hidden-column and scrollable-table patterns.
- Modal viewport bounds checking ensures modals are not rendered wider than the viewport, which would cause horizontal scrolling. shadcn/ui modals typically have `max-width` constraints.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — responsive layout verification: tablet)
- **Design Specification:** Tablet layout wireframes, sidebar collapse behavior, table responsive patterns
- **Functional Requirements:** FR-UI-001 (responsive layout), FR-UI-003 (tablet breakpoint behavior)

## Estimated Complexity

Medium — Tablet layout testing requires handling two possible sidebar patterns (collapsed vs. toggle), adaptive table behavior (hidden columns vs. scroll), and viewport-aware modal assertions. The flexibility adds test complexity.
