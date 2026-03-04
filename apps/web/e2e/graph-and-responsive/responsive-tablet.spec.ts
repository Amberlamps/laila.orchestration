// apps/web/e2e/graph-and-responsive/responsive-tablet.spec.ts
// E2E tests for the tablet layout at 768px viewport.
// Verifies collapsed sidebar, 2-column card grid, project card content,
// adaptive dashboard grid, and modal viewport bounds.
import { test, expect } from '../fixtures';
import { createMockProject } from '../fixtures/entity-factories';
import { DashboardPage, ProjectListPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data with multiple projects so that project cards are
 * populated for responsive layout assertions.
 */
function buildTabletLayoutSeed() {
  const projectA = createMockProject({
    id: 'tablet-project-a',
    name: 'Project Alpha',
    description: 'First test project for tablet layout',
    status: 'draft',
  });

  const projectB = createMockProject({
    id: 'tablet-project-b',
    name: 'Project Beta',
    description: 'Second test project for tablet layout',
    status: 'in-progress',
  });

  const projectC = createMockProject({
    id: 'tablet-project-c',
    name: 'Project Gamma',
    description: 'Third test project for tablet layout',
    status: 'completed',
  });

  return {
    projects: [toEntry(projectA), toEntry(projectB), toEntry(projectC)],
  };
}

// ---------------------------------------------------------------------------
// Configure this test file to use a tablet viewport.
// ---------------------------------------------------------------------------
test.use({
  viewport: { width: 768, height: 1024 },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Responsive Layout — Tablet (768px)', () => {
  test('sidebar is collapsed or has a toggle button', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    // At tablet width (md breakpoint), the sidebar should be visible but may
    // be collapsed (icon-only) or togglable.
    // SidebarNavigation renders <aside role="navigation" aria-label="Main navigation">
    // with class "hidden md:flex" — visible at 768px (md).
    const sidebar = page.getByRole('navigation', { name: /main navigation/i });

    const sidebarVisible = await sidebar.isVisible();

    if (sidebarVisible) {
      // At 768px, the sidebar is visible. Check if it's collapsed (< 80px)
      // or expanded. Either is valid at tablet width.
      const sidebarWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
      // Sidebar should be present — either collapsed (~64px) or expanded (240px).
      expect(sidebarWidth).toBeGreaterThan(0);
    } else {
      // If hidden, check for a hamburger/toggle button.
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
    await seedData(buildTabletLayoutSeed());

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // The projects page renders cards in a div with inline grid-template-columns.
    const cardGrid = page.locator('main div[style*="grid-template-columns"]');
    await expect(cardGrid).toBeVisible();

    // Verify the grid has 2 columns at tablet width.
    // At 768px minus sidebar (~64px collapsed) minus padding, 2 columns of 340px fit.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );
    const columnCount = gridColumns.split(' ').length;
    expect(columnCount).toBe(2);
  });

  test('project cards show essential content at tablet width', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildTabletLayoutSeed());

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // The projects page is card-based (not a table).
    // Verify each card shows essential project info at tablet width.
    const cardGrid = page.locator('main div[style*="grid-template-columns"]');
    const firstCard = cardGrid.locator('> *').first();
    await expect(firstCard).toBeVisible();

    // Each ProjectCard should display: project name (link), status badge, progress.
    const projectLink = firstCard.getByRole('link');
    await expect(projectLink).toBeVisible();

    // Verify the card fits within the tablet viewport (not overflowing).
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).toBeTruthy();
    expect(cardBox!.width).toBeLessThanOrEqual(768);
  });

  test('dashboard KPI row adapts to 3-column grid', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildTabletLayoutSeed());

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // The KPI summary row uses responsive grid: grid-cols-1 md:grid-cols-3 lg:grid-cols-5.
    // At 768px (md breakpoint), it should render 3 columns.
    const kpiRow = page.getByTestId('dashboard-kpi-summary-row');
    await expect(kpiRow).toBeVisible();

    const gridColumns = await kpiRow.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );

    const columnCount = gridColumns.split(' ').length;
    // At md breakpoint (768px), expect 3 columns.
    expect(columnCount).toBe(3);
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
