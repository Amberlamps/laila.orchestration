// apps/web/e2e/work-execution/manual-unassignment.spec.ts
// E2E tests for manual worker unassignment.
// Verifies the human-initiated unassignment flow, including
// confirmation dialog, status reset, and attempt logging.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockWorker,
  createMockAttempt,
} from '../fixtures/entity-factories';
import { StoryDetailPage } from '../page-objects';
import { handleConfirmationModal, triggerQueryRefetch } from '../utils';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/**
 * Builds seed data for an in-progress story assigned to a worker.
 * The MSW GET /api/v1/stories/:id handler enriches the story with
 * workStatus, priority, and other UI-required fields automatically.
 */
function buildInProgressStorySeed() {
  const project = createMockProject({
    id: 'unassign-project-id',
    name: 'Unassign Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'unassign-epic-id',
    projectId: project.id,
    title: 'Unassign Test Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  const story = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'In-Progress Story',
    status: 'in-progress',
    assignedWorkerId: worker.id,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    workers: [toEntry(worker)],
  };
}

/**
 * Builds seed data for an in-progress story plus a second not-started story.
 * Used by the freed-worker test to verify the worker can pick up new work.
 */
function buildTwoStoriesSeed() {
  const project = createMockProject({
    id: 'unassign-project-id',
    name: 'Unassign Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'unassign-epic-id',
    projectId: project.id,
    title: 'Unassign Test Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  // First story: in-progress, assigned to the worker.
  const inProgressStory = createMockStory({
    id: 'in-progress-story-id',
    epicId: epic.id,
    title: 'In-Progress Story',
    status: 'in-progress',
    assignedWorkerId: worker.id,
  });

  // Second story: not-started, available for assignment.
  const availableStory = createMockStory({
    id: 'available-story-id',
    epicId: epic.id,
    title: 'Available Story',
    status: 'not-started',
    assignedWorkerId: null,
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(inProgressStory), toEntry(availableStory)],
    workers: [toEntry(worker)],
  };
}

/**
 * Builds seed data for a story that was previously manually unassigned.
 * Includes the attempt-history entry with "manual" status so the
 * Attempt History tab shows the "Manually unassigned" reason badge.
 */
function buildUnassignedStoryWithAttemptHistorySeed() {
  const project = createMockProject({
    id: 'unassign-project-id',
    name: 'Unassign Test Project',
    status: 'ready',
  });

  const epic = createMockEpic({
    id: 'unassign-epic-id',
    projectId: project.id,
    title: 'Unassign Test Epic',
    status: 'ready',
  });

  const worker = createMockWorker({
    id: 'test-worker-id',
    name: 'Test Worker',
    status: 'active',
    projectIds: [project.id],
  });

  // Story is now not-started after being manually unassigned.
  const story = createMockStory({
    id: 'manually-unassigned-story-id',
    epicId: epic.id,
    title: 'Previously Assigned Story',
    status: 'not-started',
    assignedWorkerId: null,
  });

  // Pre-existing attempt record for the manual unassignment.
  const attempt = createMockAttempt({
    id: 'attempt-manual-1',
    storyId: story.id,
    workerId: worker.id,
    workerName: worker.name,
    status: 'manual',
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    endedAt: new Date().toISOString(),
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    stories: [toEntry(story)],
    workers: [toEntry(worker)],
    attempts: [{ ...attempt }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Manual Worker Unassignment', () => {
  test('unassign worker resets story and logs attempt', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed an in-progress story assigned to a worker.
    await seedData(buildInProgressStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('unassign-project-id', 'in-progress-story-id');

    // Verify the story is in-progress with an assigned worker.
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');

    // Click "Unassign" button.
    await storyDetail.unassignWorkerButton.click();

    // Verify the confirmation dialog appears with worker name.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/unassign/i);
    await expect(dialog).toContainText(/Test Worker/i);

    // Confirm the unassignment via the dialog's "Unassign Worker" button.
    await dialog.getByRole('button', { name: /unassign worker/i }).click();

    // Verify the success toast.
    await storyDetail.expectSuccessToast('Unassigned');

    // Trigger a refetch so the UI updates with the new story state.
    await triggerQueryRefetch(page);

    // Verify the story status resets to Not Started.
    await storyDetail.expectStatus('Not Started');

    // Verify the worker assignment badge is cleared.
    await expect(storyDetail.assignedWorkerBadge).not.toBeVisible();
  });

  test('cancel unassignment keeps story in-progress', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    await seedData(buildInProgressStorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('unassign-project-id', 'in-progress-story-id');
    await storyDetail.expectStatus('In Progress');

    // Click unassign then cancel.
    await storyDetail.unassignWorkerButton.click();
    await handleConfirmationModal(page, { action: 'cancel' });

    // Verify the story remains in-progress.
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');
  });

  test('unassigned attempt appears in Attempt History', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a story that was manually unassigned (now not-started,
    // with a previous "manual" attempt in history).
    await seedData(buildUnassignedStoryWithAttemptHistorySeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('unassign-project-id', 'manually-unassigned-story-id');

    // Open the Attempt History tab and get rows.
    const attemptRows = await storyDetail.getAttemptHistoryRows();

    // Verify the unassigned attempt is logged with the worker name
    // and "Manually unassigned" reason badge.
    await expect(attemptRows.first()).toBeVisible();
    await expect(attemptRows.first()).toContainText('Manually unassigned');
    await expect(attemptRows.first()).toContainText('Test Worker');
  });

  test('freed worker can pick up new work after unassignment', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed two stories: one in-progress (to be unassigned) and
    // one not-started (available for assignment).
    await seedData(buildTwoStoriesSeed());

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto('unassign-project-id', 'in-progress-story-id');

    // Unassign the worker from the first story.
    await storyDetail.unassignWorker();

    // Simulate the freed worker requesting new work.
    await page.evaluate(async () => {
      await fetch('/api/v1/work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'test-worker-id' }),
      });
    });

    await triggerQueryRefetch(page);

    // Navigate to the second story and verify it was assigned.
    await storyDetail.goto('unassign-project-id', 'available-story-id');
    await storyDetail.expectStatus('In Progress');
    await storyDetail.expectAssignedWorker('Test Worker');
  });
});
