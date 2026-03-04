// apps/web/e2e/work-execution/timeout-reclamation.spec.ts
// E2E tests for timeout reclamation.
// Verifies that timed-out stories are reclaimed automatically,
// the timeout banner appears, and the attempt is logged.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockWorker,
  createMockAttempt,
} from '../fixtures/entity-factories';
import { StoryDetailPage } from '../page-objects';
import { triggerQueryRefetch } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data for a story that is currently in-progress with a worker
 * assigned. The story uses workStatus='in_progress' so the page component
 * renders the correct status badge.
 */
function buildInProgressStorySeed() {
  const project = createMockProject({
    id: 'timeout-project-id',
    name: 'Timeout Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'timeout-epic-id',
    projectId: project.id,
    title: 'Timeout Test Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'worker-1-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'Story Under Test',
    status: 'in-progress',
    assignedWorkerId: worker.id,
  });

  // Add workStatus field for the page component (story detail page reads
  // workStatus, not status, to determine the display).
  const storyWithWorkStatus: Record<string, unknown> = {
    ...story,
    workStatus: 'in_progress',
    priority: 'medium',
    version: 1,
    tenantId: 'test-tenant',
    assignedAt: story.updatedAt,
    attempts: 1,
    maxAttempts: 3,
  };

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [[story.id, storyWithWorkStatus]] as Array<[string, Record<string, unknown>]>,
    workers: [toEntry(worker)],
  };
}

/**
 * Builds seed data for a story that already has a timed-out attempt in
 * its history. The story itself is back to not-started status.
 */
function buildStoryWithTimeoutHistorySeed() {
  const project = createMockProject({
    id: 'history-project-id',
    name: 'History Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'history-epic-id',
    projectId: project.id,
    title: 'History Test Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'history-worker-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'story-with-timeout-history-id',
    epicId: epic.id,
    title: 'Story With Timeout History',
    status: 'not-started',
    assignedWorkerId: null,
  });

  // Add workStatus for the page component.
  const storyWithWorkStatus: Record<string, unknown> = {
    ...story,
    workStatus: 'pending',
    priority: 'medium',
    version: 2,
    tenantId: 'test-tenant',
    assignedAt: null,
    attempts: 1,
    maxAttempts: 3,
  };

  // Create a timed-out attempt entry.
  const timedOutAttempt = createMockAttempt({
    id: 'attempt-timeout-1',
    storyId: story.id,
    workerId: worker.id,
    workerName: worker.name,
    status: 'timed-out',
    errorMessage: null,
    startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    endedAt: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [[story.id, storyWithWorkStatus]] as Array<[string, Record<string, unknown>]>,
    workers: [toEntry(worker)],
    attempts: [{ ...timedOutAttempt }],
  };
}

/**
 * Builds seed data for a reclaimed story that is back to not-started
 * status and ready to be picked up by another worker. Also includes
 * the second worker that will request work.
 */
function buildReclaimedStorySeed() {
  const project = createMockProject({
    id: 'reclaim-project-id',
    name: 'Reclaim Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'reclaim-epic-id',
    projectId: project.id,
    title: 'Reclaim Test Epic',
    status: 'ready',
  });

  const worker2 = createMockWorker({
    id: 'worker-2-id',
    name: 'Worker 2',
    status: 'active',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'reclaimed-story-id',
    epicId: epic.id,
    title: 'Reclaimed Story',
    status: 'not-started',
    assignedWorkerId: null,
  });

  // Add workStatus for the page component.
  const storyWithWorkStatus: Record<string, unknown> = {
    ...story,
    workStatus: 'pending',
    priority: 'medium',
    version: 2,
    tenantId: 'test-tenant',
    assignedAt: null,
    attempts: 1,
    maxAttempts: 3,
  };

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [[story.id, storyWithWorkStatus]] as Array<[string, Record<string, unknown>]>,
    workers: [toEntry(worker2)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Timeout Reclamation', () => {
  test('timed-out story shows reclamation banner and resets', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that is in-progress with an assigned worker.
    await seedData(buildInProgressStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('timeout-project-id', 'in-progress-story-id');
    await storyDetail.expectStatus('In Progress');

    // Simulate the timeout reclamation background job running.
    // In E2E tests we call the reclamation endpoint directly via MSW.
    await page.evaluate(async () => {
      await fetch('/api/v1/admin/reclaim-timed-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // Wait for the UI to reflect the reclamation.
    await triggerQueryRefetch(page);
    await storyDetail.goto('timeout-project-id', 'in-progress-story-id');

    // Verify the timeout reclamation banner is displayed.
    await expect(storyDetail.timeoutBanner).toBeVisible();
    await expect(storyDetail.timeoutBanner).toContainText(/timed out/i);

    // Verify the story status is reset to Not Started.
    await storyDetail.expectStatus('Not Started');

    // Verify the worker assignment is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test('timed-out attempt is logged in Attempt History', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story with a timed-out attempt already in history.
    await seedData(buildStoryWithTimeoutHistorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('history-project-id', 'story-with-timeout-history-id');

    // Open the Attempt History tab.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify the timed-out attempt is logged with the correct outcome.
    await expect(attemptRows.first()).toBeVisible();
    await expect(attemptRows.first()).toContainText(/timed out/i);

    // Verify the attempt includes the worker name.
    await expect(attemptRows.first()).toContainText('Test Worker');
  });

  test('reclaimed story can be picked up by another worker', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that was reclaimed after timeout (now not-started).
    await seedData(buildReclaimedStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('reclaim-project-id', 'reclaimed-story-id');
    await storyDetail.expectStatus('Not Started');

    // Simulate a different worker requesting work.
    await page.evaluate(async () => {
      await fetch('/api/v1/work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'worker-2-id' }),
      });
    });

    await triggerQueryRefetch(page);
    await storyDetail.goto('reclaim-project-id', 'reclaimed-story-id');

    // Verify the story is re-assigned to the new worker.
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Worker 2');
  });
});
