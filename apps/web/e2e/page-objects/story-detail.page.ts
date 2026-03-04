// Page object for the Story Detail page with task management,
// assignment controls, failure recovery, and attempt history.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class StoryDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createTaskButton: Locator;
  readonly tasksTab: Locator;
  readonly tasksTable: Locator;
  readonly attemptHistoryTab: Locator;
  readonly assignedWorkerBadge: Locator;
  readonly unassignWorkerButton: Locator;
  readonly resetButton: Locator;
  readonly failedErrorMessage: Locator;
  readonly readOnlyBanner: Locator;
  readonly timeoutBanner: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('entity-heading');
    this.statusBadge = page.getByTestId('status-badge');
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.createTaskButton = page.getByRole('button', { name: /create task/i });
    this.tasksTab = page.getByRole('tab', { name: /tasks/i });
    this.tasksTable = page.getByTestId('tasks-table');
    this.attemptHistoryTab = page.getByRole('tab', { name: /attempt history/i });
    this.assignedWorkerBadge = page.getByTestId('assigned-worker');
    this.unassignWorkerButton = page.getByRole('button', { name: /unassign worker/i });
    this.resetButton = page.getByRole('button', { name: /reset/i });
    this.failedErrorMessage = page.getByTestId('failed-error-message');
    this.readOnlyBanner = page.getByTestId('read-only-banner');
    this.timeoutBanner = page.getByTestId('timeout-reclamation-banner');
  }

  async goto(projectId: string, storyId: string): Promise<this> {
    await this.page.goto(`/projects/${projectId}/stories/${storyId}`);
    await this.waitForPageLoad();
    return this;
  }

  /** Create a task within this story. */
  async createTask(title: string, description: string, personaName: string): Promise<this> {
    await this.tasksTab.click();
    await this.createTaskButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    // Select persona from dropdown.
    await modal.getByLabel(/persona/i).click();
    await modal.getByRole('option', { name: personaName }).click();
    await modal.getByRole('button', { name: /create/i }).click();
    await this.expectSuccessToast('Task created');
    return this;
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  async publish(): Promise<this> {
    await this.publishButton.click();
    // The publish flow dialog first validates, then shows a confirm step.
    // Wait for the "Publish Story" button to appear after validation passes.
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /publish story/i }).click();
    // After successful publish, a success dialog appears with a "Done" button.
    await dialog.getByRole('button', { name: /done/i }).click();
    await this.expectSuccessToast('published');
    return this;
  }

  /** Click the "Unassign Worker" button and confirm the dialog. */
  async unassignWorker(): Promise<this> {
    await this.unassignWorkerButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /confirm/i }).click();
    await this.expectSuccessToast('unassigned');
    return this;
  }

  /** Click the "Reset" button to reset a failed story. */
  async resetStory(): Promise<this> {
    await this.resetButton.click();
    await this.expectSuccessToast('reset');
    return this;
  }

  /** Assert the assigned worker name is displayed. */
  async expectAssignedWorker(workerName: string): Promise<void> {
    await expect(this.assignedWorkerBadge).toContainText(workerName);
  }

  /** Assert the read-only banner is visible. */
  async expectReadOnly(): Promise<void> {
    await expect(this.readOnlyBanner).toBeVisible();
  }

  /** Assert the failed error message is displayed. */
  async expectFailedWithError(errorMessage: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(/failed/i);
    await expect(this.failedErrorMessage).toContainText(errorMessage);
  }

  /** Open the Attempt History tab and return attempt rows. */
  async getAttemptHistoryRows(): Promise<Locator> {
    await this.attemptHistoryTab.click();
    return this.page.getByTestId('attempt-history-row');
  }

  async openTask(title: string): Promise<this> {
    await this.tasksTab.click();
    await this.tasksTable.getByRole('link', { name: title }).click();
    await this.waitForPageLoad();
    return this;
  }
}
