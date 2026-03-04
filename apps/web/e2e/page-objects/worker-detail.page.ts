// Page object for the Worker Detail page with project access management.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class WorkerDetailPage extends BasePage {
  readonly heading: Locator;
  readonly addProjectAccessButton: Locator;
  readonly projectAccessTable: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('entity-heading');
    this.addProjectAccessButton = page.getByRole('button', {
      name: /add project access/i,
    });
    this.projectAccessTable = page.getByTestId('project-access-table');
    this.deleteButton = page.getByRole('button', { name: /delete/i });
  }

  async goto(workerId?: string): Promise<this> {
    if (workerId) {
      await this.page.goto(`/workers/${workerId}`);
    }
    await this.waitForPageLoad();
    return this;
  }

  /** Add project access for this worker. */
  async addProjectAccess(projectName: string): Promise<this> {
    await this.addProjectAccessButton.click();
    const dropdown = this.page.getByRole('listbox');
    await dropdown.getByRole('option', { name: projectName }).click();
    await this.expectSuccessToast('access granted');
    return this;
  }

  /** Remove project access from this worker. */
  async removeProjectAccess(projectName: string): Promise<this> {
    const row = this.projectAccessTable.getByRole('row', {
      name: new RegExp(projectName),
    });
    await row.getByRole('button', { name: /remove/i }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /confirm/i }).click();
    await this.expectSuccessToast('access removed');
    return this;
  }

  /** Assert a project appears in the access table. */
  async expectProjectAccess(projectName: string): Promise<void> {
    const row = this.projectAccessTable.getByRole('row', {
      name: new RegExp(projectName),
    });
    await expect(row).toBeVisible();
  }

  /** Assert a project does not appear in the access table. */
  async expectNoProjectAccess(projectName: string): Promise<void> {
    const row = this.projectAccessTable.getByRole('row', {
      name: new RegExp(projectName),
    });
    await expect(row).not.toBeVisible();
  }
}
