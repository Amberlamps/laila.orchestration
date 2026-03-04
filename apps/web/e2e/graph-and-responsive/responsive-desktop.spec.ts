// apps/web/e2e/graph-and-responsive/responsive-desktop.spec.ts
// E2E tests for the desktop layout at 1440px viewport.
// Verifies sidebar navigation, grid layout, project card content, and full graph controls.
// Tests ensure WCAG-aligned structure: landmark navigation, semantic roles,
// and visible text labels for assistive technology compatibility.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
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
 * Builds seed data with 6 projects to fill two rows of a 3-column grid,
 * plus a project with an epic, story, and tasks for graph testing.
 */
function buildDesktopLayoutSeed() {
  const graphProject = createMockProject({
    id: 'graph-project-id',
    name: 'Graph Test Project',
    description: 'Project for graph control testing',
    status: 'ready',
  });

  const projects = [
    graphProject,
    createMockProject({
      id: 'project-2',
      name: 'Alpha Project',
      description: 'Second project',
      status: 'draft',
    }),
    createMockProject({
      id: 'project-3',
      name: 'Beta Project',
      description: 'Third project',
      status: 'in-progress',
    }),
    createMockProject({
      id: 'project-4',
      name: 'Gamma Project',
      description: 'Fourth project',
      status: 'completed',
    }),
    createMockProject({
      id: 'project-5',
      name: 'Delta Project',
      description: 'Fifth project',
      status: 'draft',
    }),
    createMockProject({
      id: 'project-6',
      name: 'Epsilon Project',
      description: 'Sixth project',
      status: 'draft',
    }),
  ];

  const epic = createMockEpic({
    id: 'graph-epic-id',
    projectId: graphProject.id,
    title: 'Graph Epic',
    description: 'Epic for graph testing',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'graph-story-id',
    epicId: epic.id,
    title: 'Graph Story',
    description: 'Story for graph testing',
    status: 'not-started',
  });

  const task1 = createMockTask({
    id: 'graph-task-1',
    storyId: story.id,
    title: 'First Task',
    description: 'First task for graph',
    status: 'not-started',
    dependsOn: [],
  });

  const task2 = createMockTask({
    id: 'graph-task-2',
    storyId: story.id,
    title: 'Second Task',
    description: 'Second task for graph',
    status: 'blocked',
    dependsOn: [task1.id],
  });

  return {
    projects: projects.map((p) => toEntry(p)),
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(task1), toEntry(task2)],
  };
}

// ---------------------------------------------------------------------------
// Configure this test file to use a desktop viewport.
// ---------------------------------------------------------------------------

test.use({
  viewport: { width: 1440, height: 900 },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Responsive Layout — Desktop (1440px)', () => {
  test('sidebar navigation is visible and expanded', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');

    // Verify the sidebar landmark navigation is visible.
    // SidebarNavigation renders <aside role="navigation" aria-label="Main navigation">
    const sidebar = page.getByRole('navigation', { name: /main navigation/i });
    await expect(sidebar).toBeVisible();

    // Verify navigation link text is visible (not hidden behind icons).
    // Expanded sidebar shows full text labels for accessibility.
    const dashboardLink = sidebar.getByRole('link', { name: /dashboard/i });
    await expect(dashboardLink).toBeVisible();

    const projectsLink = sidebar.getByRole('link', { name: /projects/i });
    await expect(projectsLink).toBeVisible();

    const workersLink = sidebar.getByRole('link', { name: /workers/i });
    await expect(workersLink).toBeVisible();

    // Verify sidebar is expanded (> 200px) rather than collapsed icon-only mode (~64px).
    const sidebarWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThan(200);
  });

  test('project cards render in multi-column grid', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed 6 projects to fill the grid.
    await seedData(buildDesktopLayoutSeed());

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // The projects page renders cards in a div with inline grid-template-columns.
    // style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
    const cardGrid = page.locator('main div[style*="grid-template-columns"]');
    await expect(cardGrid).toBeVisible();

    // Verify the grid has at least 3 columns at 1440px desktop width.
    // At 1440px minus sidebar (240px) minus padding, ~3 columns of 340px+ fit.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );
    const columnCount = gridColumns.split(' ').length;
    expect(columnCount).toBeGreaterThanOrEqual(3);
  });

  test('project cards display full metadata at desktop width', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildDesktopLayoutSeed());

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // The projects page uses a card grid, not a table.
    // Verify cards are visible and show essential project metadata.
    const cardGrid = page.locator('main div[style*="grid-template-columns"]');
    const firstCard = cardGrid.locator('> *').first();
    await expect(firstCard).toBeVisible();

    // Each ProjectCard renders: project name as a link, StatusBadge, and progress bar.
    // Verify the card contains a link (project name).
    const projectLink = firstCard.getByRole('link');
    await expect(projectLink).toBeVisible();

    // Verify the card contains a progress bar (completion percentage).
    const progressBar = firstCard.getByRole('progressbar');
    await expect(progressBar).toBeVisible();
  });

  test('DAG graph shows full controls at desktop viewport', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildDesktopLayoutSeed());

    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Verify all graph controls are visible at desktop width.
    // Each control must be keyboard-accessible and labeled.
    await expect(graph.zoomInButton).toBeVisible();
    await expect(graph.zoomOutButton).toBeVisible();
    await expect(graph.fitViewButton).toBeVisible();
    await expect(graph.minimap).toBeVisible();
    await expect(graph.viewLevelToggle).toBeVisible();
    await expect(graph.statusFilters).toBeVisible();
  });

  test('dashboard KPI row renders in 5-column grid', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildDesktopLayoutSeed());

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // The dashboard KPI summary row has data-testid="dashboard-kpi-summary-row"
    // and uses grid-cols-1 md:grid-cols-3 lg:grid-cols-5 responsive classes.
    const kpiRow = page.getByTestId('dashboard-kpi-summary-row');
    await expect(kpiRow).toBeVisible();

    const gridColumns = await kpiRow.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    );

    // At desktop width (>= 1024px), the KPI row should have 5 columns.
    const columnCount = gridColumns.split(' ').length;
    expect(columnCount).toBe(5);
  });
});
