// Page object for the Workers list page.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class WorkerListPage extends BasePage {
  readonly heading: Locator;
  readonly createWorkerButton: Locator;
  readonly workersTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /workers/i });
    this.createWorkerButton = page.getByRole('button', {
      name: /create worker/i,
    });
    this.workersTable = page.getByRole('table');
  }

  async goto(): Promise<this> {
    await this.page.goto('/workers');
    await this.waitForPageLoad();
    return this;
  }

  /** Create a worker and capture the displayed API key. */
  async createWorker(name: string): Promise<string> {
    await this.createWorkerButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/name/i).fill(name);
    await modal.getByRole('button', { name: /create/i }).click();

    // After creation, the API key is displayed in a monospace field.
    // Capture it before the user closes the modal.
    const apiKeyField = modal.getByTestId('api-key-display');
    const apiKey = await apiKeyField.textContent();
    if (!apiKey) throw new Error('API key was not displayed after worker creation');

    return apiKey;
  }

  /** Close the API key reveal modal after capturing the key. */
  async closeApiKeyModal(): Promise<this> {
    const modal = this.page.getByRole('dialog');
    await modal.getByRole('button', { name: /done/i }).click();
    await expect(modal).not.toBeVisible();
    return this;
  }

  async openWorker(name: string): Promise<this> {
    await this.workersTable.getByRole('link', { name }).click();
    await this.waitForPageLoad();
    return this;
  }
}
