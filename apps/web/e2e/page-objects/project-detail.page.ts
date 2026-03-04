// Page object for the Project Detail page with tabs (Overview, Epics,
// Graph, Activity) and publish/delete actions.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class ProjectDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createEpicButton: Locator;
  readonly epicsTab: Locator;
  readonly graphTab: Locator;
  readonly activityTab: Locator;
  readonly overviewTab: Locator;
  readonly epicsTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('entity-heading');
    this.statusBadge = page.getByTestId('status-badge');
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.createEpicButton = page.getByRole('button', { name: /create epic/i });
    this.epicsTab = page.getByRole('tab', { name: /epics/i });
    this.graphTab = page.getByRole('tab', { name: /graph/i });
    this.activityTab = page.getByRole('tab', { name: /activity/i });
    this.overviewTab = page.getByRole('tab', { name: /overview/i });
    this.epicsTable = page.getByTestId('epics-table');
  }

  async goto(projectId?: string): Promise<this> {
    if (projectId) {
      await this.page.goto(`/projects/${projectId}`);
    }
    await this.waitForPageLoad();
    return this;
  }

  /** Create an epic within this project. */
  async createEpic(title: string, description: string): Promise<this> {
    await this.epicsTab.click();
    await this.createEpicButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole('button', { name: /create/i }).click();
    await this.expectSuccessToast('Epic created');
    return this;
  }

  /** Assert the project status badge shows the expected status. */
  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  /** Publish the project and confirm the action. */
  async publish(): Promise<this> {
    await this.publishButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /confirm/i }).click();
    await this.expectSuccessToast('published');
    return this;
  }

  /** Delete the project via confirmation modal. */
  async deleteProject(): Promise<this> {
    await this.deleteButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /confirm/i }).click();
    return this;
  }

  /** Open an epic by clicking its row in the epics table. */
  async openEpic(title: string): Promise<this> {
    await this.epicsTab.click();
    await this.epicsTable.getByRole('link', { name: title }).click();
    await this.waitForPageLoad();
    return this;
  }
}
