// Page object for the Task Detail page with dependency management,
// status display, and edit controls.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class TaskDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly personaBadge: Locator;
  readonly addDependencyButton: Locator;
  readonly dependenciesSection: Locator;
  readonly lockIcon: Locator;
  readonly cycleErrorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('entity-heading');
    this.statusBadge = page.getByTestId('status-badge');
    this.editButton = page.getByRole('button', { name: /edit/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.personaBadge = page.getByTestId('persona-badge');
    this.addDependencyButton = page.getByRole('button', { name: /add dependency/i });
    this.dependenciesSection = page.getByTestId('dependencies-section');
    this.lockIcon = page.getByTestId('lock-icon');
    this.cycleErrorMessage = page.getByTestId('cycle-error');
  }

  async goto(projectId: string, taskId: string): Promise<this> {
    await this.page.goto(`/projects/${projectId}/tasks/${taskId}`);
    await this.waitForPageLoad();
    return this;
  }

  /** Add a dependency on another task by selecting it from the dropdown. */
  async addDependency(taskTitle: string): Promise<this> {
    await this.addDependencyButton.click();
    const dropdown = this.page.getByRole('listbox');
    await dropdown.getByRole('option', { name: taskTitle }).click();
    return this;
  }

  /** Assert a dependency exists in the dependencies section. */
  async expectDependency(taskTitle: string): Promise<void> {
    const dep = this.dependenciesSection.getByText(taskTitle);
    await expect(dep).toBeVisible();
  }

  /** Assert that a cycle detection error is displayed. */
  async expectCycleError(): Promise<void> {
    await expect(this.cycleErrorMessage).toBeVisible();
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  /** Assert the task is in read-only mode (lock icon visible). */
  async expectReadOnly(): Promise<void> {
    await expect(this.lockIcon).toBeVisible();
    await expect(this.editButton).toBeDisabled();
    await expect(this.deleteButton).toBeDisabled();
  }
}
