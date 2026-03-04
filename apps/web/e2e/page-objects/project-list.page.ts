// Page object for the Projects list page with table, filters, and
// create project modal trigger.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class ProjectListPage extends BasePage {
  readonly heading: Locator;
  readonly createProjectButton: Locator;
  readonly projectsTable: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /projects/i });
    this.createProjectButton = page.getByRole('button', {
      name: /create project/i,
    });
    this.projectsTable = page.getByRole('table');
    this.searchInput = page.getByPlaceholder(/search projects/i);
    this.statusFilter = page.getByTestId('status-filter');
  }

  async goto(): Promise<this> {
    await this.page.goto('/projects');
    await this.waitForPageLoad();
    return this;
  }

  /** Click "Create Project" and fill the modal form. */
  async createProject(name: string, description: string): Promise<this> {
    await this.createProjectButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/name/i).fill(name);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole('button', { name: /create/i }).click();
    await this.expectSuccessToast('Project created');
    return this;
  }

  /** Assert a project row exists in the table by name. */
  async expectProjectInList(name: string): Promise<void> {
    const row = this.projectsTable.getByRole('row', { name });
    await expect(row).toBeVisible();
  }

  /** Click a project row to navigate to its detail page. */
  async openProject(name: string): Promise<this> {
    await this.projectsTable.getByRole('link', { name }).click();
    await this.waitForPageLoad();
    return this;
  }
}
