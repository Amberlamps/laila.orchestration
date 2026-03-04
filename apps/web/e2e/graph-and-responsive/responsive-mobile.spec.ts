// apps/web/e2e/graph-and-responsive/responsive-mobile.spec.ts
// E2E tests for the mobile layout at 375px viewport.
// Verifies bottom tab bar, single-column cards, full-width modals,
// and fullscreen graph encouragement.
//
// Accessibility focus: WCAG 2.5.5 touch target sizing (44x44px minimum),
// responsive navigation paradigm shift (sidebar -> bottom tab bar),
// and mobile-friendly modal rendering.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockPersona,
} from '../fixtures/entity-factories';
import { DashboardPage, ProjectListPage, GraphPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data for a project with graph-viewable entities.
 * Includes a project, epic, story, tasks with dependencies, and a persona
 * so the graph page has nodes and edges to render.
 */
function buildGraphSeed() {
  const persona = createMockPersona({
    id: 'mobile-persona-id',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'seeded-project-id',
    name: 'Mobile Test Project',
    description: 'Project for mobile responsive tests',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'mobile-epic-id',
    projectId: project.id,
    title: 'Mobile Test Epic',
    description: 'Epic for mobile responsive tests',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'mobile-story-id',
    epicId: epic.id,
    title: 'Mobile Test Story',
    description: 'Story for mobile responsive tests',
    status: 'not-started',
  });

  const task1 = createMockTask({
    id: 'mobile-task-1-id',
    storyId: story.id,
    title: 'First Mobile Task',
    personaId: persona.id,
    status: 'not-started',
    dependsOn: [],
  });

  const task2 = createMockTask({
    id: 'mobile-task-2-id',
    storyId: story.id,
    title: 'Second Mobile Task',
    personaId: persona.id,
    status: 'blocked',
    dependsOn: [task1.id],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2)],
    personas: [toEntry(persona)],
  };
}

/**
 * Builds seed data with multiple projects so the project list page
 * has cards to verify single-column rendering.
 */
function buildProjectListSeed() {
  const project1 = createMockProject({
    id: 'project-list-1-id',
    name: 'Alpha Project',
    description: 'First project for list test',
    status: 'draft',
  });

  const project2 = createMockProject({
    id: 'project-list-2-id',
    name: 'Beta Project',
    description: 'Second project for list test',
    status: 'ready',
  });

  const project3 = createMockProject({
    id: 'project-list-3-id',
    name: 'Gamma Project',
    description: 'Third project for list test',
    status: 'in-progress',
  });

  return {
    projects: [toEntry(project1), toEntry(project2), toEntry(project3)],
  };
}

// ---------------------------------------------------------------------------
// Configure mobile viewport (iPhone X dimensions)
// ---------------------------------------------------------------------------

test.use({
  viewport: { width: 375, height: 812 },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Responsive Layout — Mobile (375px)', () => {
  test('bottom tab bar navigation replaces sidebar', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    // Verify the desktop sidebar is NOT visible at mobile width.
    // SidebarNavigation uses class "hidden md:flex" — hidden below 768px.
    const sidebar = page.getByRole('navigation', { name: /main navigation/i });
    await expect(sidebar).not.toBeVisible();

    // Verify the mobile bottom tab bar is visible.
    // MobileTabBar renders <nav role="navigation" aria-label="Mobile navigation">
    const bottomNav = page.getByRole('navigation', { name: /mobile navigation/i });
    await expect(bottomNav).toBeVisible();

    // Verify the bottom tab bar is positioned at the bottom of the viewport.
    const navBox = await bottomNav.boundingBox();
    expect(navBox).toBeTruthy();
    // The bottom nav should be near the bottom of the 812px viewport.
    expect(navBox!.y + navBox!.height).toBeGreaterThan(750);

    // Verify the tab bar contains navigation items for key pages.
    const dashboardTab = bottomNav.getByRole('link', { name: /dashboard/i });
    const projectsTab = bottomNav.getByRole('link', { name: /projects/i });
    const workersTab = bottomNav.getByRole('link', { name: /workers/i });

    await expect(dashboardTab).toBeVisible();
    await expect(projectsTab).toBeVisible();
    await expect(workersTab).toBeVisible();
  });

  test('tab bar navigation works correctly', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    const bottomNav = page.getByRole('navigation', { name: /mobile navigation/i });

    // Navigate using the bottom tab bar.
    await bottomNav.getByRole('link', { name: /projects/i }).click();
    await expect(page).toHaveURL(/\/projects/);

    await bottomNav.getByRole('link', { name: /workers/i }).click();
    await expect(page).toHaveURL(/\/workers/);

    await bottomNav.getByRole('link', { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('project cards render in single column', async ({ authenticatedPage: page, seedData }) => {
    await seedData(buildProjectListSeed());

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // The projects page renders cards in a div with inline grid-template-columns.
    const cardGrid = page.locator('main div[style*="grid-template-columns"]');
    await expect(cardGrid).toBeVisible();

    // Verify the grid has 1 column at mobile width.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );
    const columnCount = gridColumns.split(' ').length;
    expect(columnCount).toBe(1);

    // Verify cards are full-width (spanning the viewport minus padding).
    const firstCard = cardGrid.locator('> *').first();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).toBeTruthy();
    // Card width should be close to viewport width (375px minus padding).
    expect(cardBox!.width).toBeGreaterThan(300);
  });

  test('modals render full-width on mobile', async ({ authenticatedPage: page }) => {
    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // Open the create project modal.
    await projectList.createProjectButton.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Verify the modal is full-width (or nearly full-width).
    const modalBox = await modal.boundingBox();
    expect(modalBox).toBeTruthy();
    // Modal width should be at least 90% of the 375px viewport.
    expect(modalBox!.width).toBeGreaterThan(337); // 375 * 0.9 = 337.5

    // Verify the modal is within the viewport (not clipped horizontally).
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(375 + 1); // +1 for rounding
  });

  test('dashboard KPI grid adapts to single column', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildGraphSeed());

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // The KPI summary row uses responsive grid: grid-cols-1 md:grid-cols-3 lg:grid-cols-5.
    // At 375px (below md breakpoint), it should render 1 column.
    const kpiRow = page.getByTestId('dashboard-kpi-summary-row');
    await expect(kpiRow).toBeVisible();

    const gridColumns = await kpiRow.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );

    const columnCount = gridColumns.split(' ').length;
    // At mobile width (< 768px), the KPI row should have 1 column.
    expect(columnCount).toBe(1);
  });

  test('DAG graph shows fullscreen toggle on mobile', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildGraphSeed());

    const graph = new GraphPage(page);
    await graph.goto('seeded-project-id');

    // On mobile, the graph canvas should still render.
    await expect(graph.canvas).toBeVisible();

    // The graph canvas controls include a fullscreen toggle button.
    // GraphFullscreenToggle renders <Button aria-label="Enter fullscreen">
    const fullscreenButton = page.getByRole('button', {
      name: /enter fullscreen/i,
    });
    await expect(fullscreenButton).toBeVisible();
  });

  test('graph renders correctly in mobile viewport', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildGraphSeed());

    const graph = new GraphPage(page);
    await graph.goto('seeded-project-id');

    // Verify the graph canvas is visible even on mobile.
    await expect(graph.canvas).toBeVisible();

    // Verify basic controls are accessible.
    // On mobile, some controls may be hidden behind a menu.
    const hasZoomIn = await graph.zoomInButton.isVisible().catch(() => false);
    const hasFitView = await graph.fitViewButton.isVisible().catch(() => false);

    // At minimum, fit-to-view should be accessible.
    expect(hasZoomIn || hasFitView).toBe(true);
  });

  test('touch-friendly interaction targets', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    // Verify interactive elements have adequate touch target sizes.
    // WCAG 2.5.5 recommends 44x44 CSS pixels minimum.
    // MobileTabBar renders <nav role="navigation" aria-label="Mobile navigation">
    const bottomNav = page.getByRole('navigation', { name: /mobile navigation/i });
    const navLinks = bottomNav.getByRole('link');

    const linkCount = await navLinks.count();
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i);
      const box = await link.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });
});
