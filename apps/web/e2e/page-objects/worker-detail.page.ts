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
    this.heading = page.getByRole('heading', { level: 1 });
    this.addProjectAccessButton = page.getByRole('button', {
      name: /add project/i,
    });
    // The project access table is a <Table> inside a Card with heading "Project Access".
    // Identify it by its "Project Name" column header to distinguish from other tables.
    this.projectAccessTable = page.getByRole('table').filter({
      has: page.getByRole('columnheader', { name: /project name/i }),
    });
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
    // The CMDK command palette opens in a popover with role="option" items.
    const option = this.page.getByRole('option', { name: new RegExp(projectName) });
    await option.click();
    await this.expectSuccessToast('access granted');
    return this;
  }

  /** Remove project access from this worker. */
  async removeProjectAccess(projectName: string): Promise<this> {
    // Each row has a remove button with aria-label "Remove project {name}".
    const removeButton = this.page.getByRole('button', {
      name: new RegExp(`remove project ${projectName}`, 'i'),
    });
    await removeButton.click();
    await this.expectSuccessToast('access revoked');
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
