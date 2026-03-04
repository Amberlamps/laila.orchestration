// Page object for the Epic Detail page with story management and publish.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class EpicDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createStoryButton: Locator;
  readonly storiesTab: Locator;
  readonly storiesTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('entity-heading');
    this.statusBadge = page.getByTestId('status-badge');
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.createStoryButton = page.getByRole('button', { name: /create (user )?story/i });
    this.storiesTab = page.getByRole('tab', { name: /stories/i });
    this.storiesTable = page.getByTestId('stories-table');
  }

  async goto(epicId?: string): Promise<this> {
    if (epicId) {
      await this.page.goto(`/epics/${epicId}`);
    }
    await this.waitForPageLoad();
    return this;
  }

  /** Create a user story within this epic. */
  async createStory(title: string, description: string): Promise<this> {
    await this.storiesTab.click();
    await this.createStoryButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole('button', { name: /create/i }).click();
    await this.expectSuccessToast('Story created');
    return this;
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  async publish(): Promise<this> {
    await this.publishButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /confirm/i }).click();
    await this.expectSuccessToast('published');
    return this;
  }

  async openStory(title: string): Promise<this> {
    await this.storiesTab.click();
    await this.storiesTable.getByRole('link', { name: title }).click();
    await this.waitForPageLoad();
    return this;
  }
}
