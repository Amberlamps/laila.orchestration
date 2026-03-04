// Page object for the Audit Log page with chronological entries
// and export functionality.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class AuditLogPage extends BasePage {
  readonly heading: Locator;
  readonly entriesTable: Locator;
  readonly exportJsonButton: Locator;
  readonly exportCsvButton: Locator;
  readonly filterByAction: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /audit log/i });
    this.entriesTable = page.getByTestId('audit-log-table');
    this.exportJsonButton = page.getByRole('button', { name: /export json/i });
    this.exportCsvButton = page.getByRole('button', { name: /export csv/i });
    this.filterByAction = page.getByTestId('action-filter');
  }

  async goto(): Promise<this> {
    await this.page.goto('/audit-log');
    await this.waitForPageLoad();
    return this;
  }

  /** Assert an audit log entry exists with the given action and entity. */
  async expectEntry(action: string, entityName: string): Promise<void> {
    const row = this.entriesTable
      .getByRole('row')
      .filter({
        hasText: action,
      })
      .filter({
        hasText: entityName,
      });
    await expect(row.first()).toBeVisible();
  }

  /** Get the total number of visible audit log entries. */
  async getEntryCount(): Promise<number> {
    const rows = this.entriesTable.getByRole('row');
    // Subtract 1 for the header row.
    return (await rows.count()) - 1;
  }

  /** Export audit log as JSON. Returns the download path. */
  async exportJson(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportJsonButton.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }

  /** Export audit log as CSV. Returns the download path. */
  async exportCsv(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsvButton.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }
}
