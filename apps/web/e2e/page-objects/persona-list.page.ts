// Page object for the Personas list page with CRUD and deletion guard.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class PersonaListPage extends BasePage {
  readonly heading: Locator;
  readonly createPersonaButton: Locator;
  readonly personasTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /personas/i });
    this.createPersonaButton = page.getByRole('button', {
      name: /create persona/i,
    });
    this.personasTable = page.getByRole('table');
  }

  async goto(): Promise<this> {
    await this.page.goto('/personas');
    await this.waitForPageLoad();
    return this;
  }

  /** Create a new persona with title and description. */
  async createPersona(title: string, description: string): Promise<this> {
    await this.createPersonaButton.click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole('button', { name: /create/i }).click();
    await this.expectSuccessToast('Persona created');
    return this;
  }

  /** Edit an existing persona's title and description. */
  async editPersona(currentTitle: string, newTitle: string, newDescription: string): Promise<this> {
    const row = this.personasTable.getByRole('row', { name: currentTitle });
    await row.getByRole('button', { name: /edit/i }).click();
    const modal = this.page.getByRole('dialog');
    await modal.getByLabel(/title/i).clear();
    await modal.getByLabel(/title/i).fill(newTitle);
    await modal.getByLabel(/description/i).clear();
    await modal.getByLabel(/description/i).fill(newDescription);
    await modal.getByRole('button', { name: /save/i }).click();
    await this.expectSuccessToast('Persona updated');
    return this;
  }

  /** Attempt to delete a persona. Returns true if deletion succeeded. */
  async deletePersona(title: string): Promise<boolean> {
    const row = this.personasTable.getByRole('row', { name: title });
    await row.getByRole('button', { name: /delete/i }).click();

    // Check if a confirmation dialog or a blocked tooltip appears.
    const dialog = this.page.getByRole('dialog');
    const isDialogVisible = await dialog.isVisible().catch(() => false);

    if (isDialogVisible) {
      await dialog.getByRole('button', { name: /confirm/i }).click();
      return true;
    }
    return false;
  }

  /** Assert a persona exists in the table. */
  async expectPersonaInList(title: string): Promise<void> {
    const row = this.personasTable.getByRole('row', { name: title });
    await expect(row).toBeVisible();
  }

  /** Assert a persona does not exist in the table. */
  async expectPersonaNotInList(title: string): Promise<void> {
    const row = this.personasTable.getByRole('row', { name: title });
    await expect(row).not.toBeVisible();
  }

  /** Assert the deletion-blocked tooltip is visible for a persona row. */
  async expectDeletionBlocked(title: string): Promise<void> {
    const row = this.personasTable.getByRole('row', { name: title });
    const deleteButton = row.getByRole('button', { name: /delete/i });
    await deleteButton.hover();
    const tooltip = this.page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/referenced by/i);
  }
}
