// apps/web/e2e/graph-and-responsive/dag-graph.spec.ts
// E2E tests for the DAG graph visualization powered by ReactFlow.
// Verifies node rendering, interaction controls (zoom, pan, fit),
// node click navigation, minimap, view level toggle, and status filters.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockPersona,
} from '../fixtures/entity-factories';
import { GraphPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data with a project, epic, story, and 5 tasks covering all
 * required status colors: not-started, in-progress, blocked, completed, failed.
 *
 * DAG chain: Task A -> Task B -> Task C (linear dependency).
 * Task D and Task E are independent (no dependencies).
 */
function buildGraphSeed() {
  const persona = createMockPersona({
    id: 'graph-persona-id',
    title: 'Backend Developer',
  });

  const project = createMockProject({
    id: 'graph-project-id',
    name: 'Graph Test Project',
    description: 'Project for DAG graph E2E tests',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'graph-epic-id',
    projectId: project.id,
    title: 'Core Feature Epic',
    description: 'Epic for graph tests',
    status: 'ready',
  });

  const story = createMockStory({
    id: 'graph-story-id',
    epicId: epic.id,
    title: 'Implement Feature',
    description: 'Story for graph tests',
    status: 'not-started',
  });

  const taskA = createMockTask({
    id: 'graph-task-a-id',
    storyId: story.id,
    title: 'Setup Database Schema',
    personaId: persona.id,
    status: 'not-started',
    acceptanceCriteria: ['Database schema is created'],
    dependsOn: [],
  });

  const taskB = createMockTask({
    id: 'graph-task-b-id',
    storyId: story.id,
    title: 'Build API Layer',
    personaId: persona.id,
    status: 'in-progress',
    acceptanceCriteria: ['API layer is functional'],
    dependsOn: [taskA.id],
  });

  const taskC = createMockTask({
    id: 'graph-task-c-id',
    storyId: story.id,
    title: 'Implement API Endpoint',
    personaId: persona.id,
    status: 'blocked',
    acceptanceCriteria: ['API endpoint responds correctly'],
    dependsOn: [taskB.id],
  });

  const taskD = createMockTask({
    id: 'graph-task-d-id',
    storyId: story.id,
    title: 'Write Unit Tests',
    personaId: persona.id,
    status: 'completed',
    acceptanceCriteria: ['Unit tests pass'],
    dependsOn: [],
  });

  const taskE = createMockTask({
    id: 'graph-task-e-id',
    storyId: story.id,
    title: 'Deploy Service',
    personaId: persona.id,
    status: 'failed',
    acceptanceCriteria: ['Service is deployed'],
    dependsOn: [],
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    tasks: [toEntry(taskA), toEntry(taskB), toEntry(taskC), toEntry(taskD), toEntry(taskE)],
    personas: [toEntry(persona)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('DAG Graph Interaction', () => {
  test.beforeEach(async ({ seedData }) => {
    // Seed a project with tasks and dependencies that form a DAG.
    // Project -> Epic -> Story -> 5 Tasks covering all statuses.
    // Chain: A(not-started) -> B(in-progress) -> C(blocked)
    // Independent: D(completed), E(failed)
    await seedData(buildGraphSeed());
  });

  test('graph renders nodes with correct status colors', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Verify the ReactFlow canvas is rendered.
    await expect(graph.canvas).toBeVisible();

    // Verify nodes are rendered for each task.
    const nodes = graph.getNodes();
    await expect(nodes).toHaveCount(5);

    // Verify status border colors on nodes using Tailwind border-left classes.
    // The graph MSW handler normalizes statuses to underscore format
    // which maps to statusBorderColors in status-colors.ts:
    //   not_started → border-l-zinc-400
    //   in_progress → border-l-blue-500
    //   blocked     → border-l-amber-500
    //   completed   → border-l-emerald-500
    //   failed      → border-l-red-500
    await graph.expectNodeStatus('Setup Database Schema', 'border-l-zinc-400');
    await graph.expectNodeStatus('Build API Layer', 'border-l-blue-500');
    await graph.expectNodeStatus('Implement API Endpoint', 'border-l-amber-500');
    await graph.expectNodeStatus('Write Unit Tests', 'border-l-emerald-500');
    await graph.expectNodeStatus('Deploy Service', 'border-l-red-500');
  });

  test('zoom in, zoom out, and fit-to-view controls', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Get the initial viewport transform for comparison.
    const initialTransform = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport?.getAttribute('style') ?? '';
    });

    // Zoom in twice.
    await graph.zoomIn(2);

    // Verify the viewport transform changed (zoom level increased).
    const zoomedInTransform = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport?.getAttribute('style') ?? '';
    });
    expect(zoomedInTransform).not.toBe(initialTransform);

    // Zoom out once.
    await graph.zoomOut(1);

    // Fit to view resets the viewport.
    await graph.fitView();

    // After fit-to-view, the viewport should encompass all nodes.
    // Verify at least one node is visible in the viewport.
    const nodes = graph.getNodes();
    await expect(nodes.first()).toBeVisible();
  });

  test('pan the graph canvas', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Get initial viewport position.
    const initialTransform = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport?.getAttribute('style') ?? '';
    });

    // Pan the canvas 100px to the right and 50px down.
    await graph.pan(100, 50);

    // Verify the viewport position changed.
    const pannedTransform = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport?.getAttribute('style') ?? '';
    });
    expect(pannedTransform).not.toBe(initialTransform);
  });

  test('click node navigates to entity detail page', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Click the "Setup Database Schema" node.
    await graph.clickNode('Setup Database Schema');

    // Verify navigation to the task detail page.
    await expect(page).toHaveURL(/\/tasks\//);

    // Verify the task detail page shows the correct title.
    const heading = page.getByTestId('entity-heading');
    await expect(heading).toContainText('Setup Database Schema');
  });

  test('minimap is visible and interactive', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Verify the minimap is rendered.
    await expect(graph.minimap).toBeVisible();

    // Verify the minimap contains node representations.
    const minimapNodes = graph.minimap.locator('rect');
    const count = await minimapNodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('view level toggle switches between Task, Story, and Epic views', async ({
    authenticatedPage: page,
  }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Default view should show Task-level nodes.
    await expect(graph.viewLevelToggle).toBeVisible();

    // Verify the Task view shows 5 nodes.
    let nodes = graph.getNodes();
    await expect(nodes).toHaveCount(5);

    // Switch to Story view.
    await graph.setViewLevel('stories');

    // Verify Story view shows 1 node (one story).
    nodes = graph.getNodes();
    await expect(nodes).toHaveCount(1);

    // Switch to Epic view.
    await graph.setViewLevel('epics');

    // Verify Epic view shows 1 node (one epic).
    nodes = graph.getNodes();
    await expect(nodes).toHaveCount(1);

    // Switch back to Task view.
    await graph.setViewLevel('tasks');
    nodes = graph.getNodes();
    await expect(nodes).toHaveCount(5);
  });

  test('status filter chips show and hide nodes by status', async ({ authenticatedPage: page }) => {
    const graph = new GraphPage(page);
    await graph.goto('graph-project-id');

    // Verify the status filter area is visible.
    await expect(graph.statusFilters).toBeVisible();

    // Initially, all statuses are shown (5 nodes).
    let nodes = graph.getNodes();
    await expect(nodes).toHaveCount(5);

    // Deselect "blocked" status filter.
    await graph.toggleStatusFilter('blocked');

    // Blocked node should be hidden (4 nodes remain).
    nodes = graph.getNodes();
    await expect(nodes).toHaveCount(4);

    // Re-enable "blocked" status filter.
    await graph.toggleStatusFilter('blocked');

    // All 5 nodes should be visible again.
    nodes = graph.getNodes();
    await expect(nodes).toHaveCount(5);
  });
});
