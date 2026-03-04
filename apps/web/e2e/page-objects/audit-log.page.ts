// Page object for the Audit Log page with chronological entries
// and export functionality (JSON/CSV via dropdown menu).
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class AuditLogPage extends BasePage {
  readonly heading: Locator;
  readonly exportButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /audit log/i });
    // The export trigger is a button labelled "Export" that opens a dropdown menu.
    this.exportButton = page.getByRole('button', { name: /export/i });
  }

  async goto(): Promise<this> {
    await this.page.goto('/audit');
    await this.waitForPageLoad();
    return this;
  }

  /**
   * Returns a locator for the event list container.
   * The audit page renders events inside a bordered div (not a table).
   * Each event is an AuditEntry (div with flex layout).
   */
  private getEntriesContainer(): Locator {
    // The entries container is the bordered div below the heading.
    return this.page.locator('div.rounded-md.border.bg-white');
  }

  /** Assert an audit log entry exists with the given action and entity. */
  async expectEntry(action: string, entityName: string): Promise<void> {
    // Each AuditEntry renders action and entity name as text within a div.
    // Search the entries container for a child that contains both texts.
    const container = this.getEntriesContainer();
    const entry = container.locator('div').filter({ hasText: action }).filter({
      hasText: entityName,
    });
    await expect(entry.first()).toBeVisible();
  }

  /** Get the nth entry (0-indexed) from the event list. */
  getEntry(index: number): Locator {
    // Each AuditEntry is a direct child div of the container with flex layout.
    const container = this.getEntriesContainer();
    return container.locator('> div').nth(index);
  }

  /** Export audit log as JSON via the dropdown menu. Returns the download filename. */
  async exportJson(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    await this.page.getByRole('menuitem', { name: /export as json/i }).click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }

  /** Export audit log as CSV via the dropdown menu. Returns the download filename. */
  async exportCsv(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    await this.page.getByRole('menuitem', { name: /export as csv/i }).click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }
}
