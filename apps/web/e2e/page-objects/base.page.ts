// Base page object providing common navigation, waiting, and assertion
// methods. All page-specific POMs extend this class.
import { type Page, expect } from '@playwright/test';

export abstract class BasePage {
  /** The Playwright Page instance this POM wraps. */
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to this page's canonical URL. Subclasses set the path. */
  abstract goto(...args: string[]): Promise<this>;

  /** Wait for the page to be fully loaded (network idle + main content visible). */
  async waitForPageLoad(): Promise<this> {
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  /** Assert that a success toast notification appears with the given message. */
  async expectSuccessToast(message: string): Promise<void> {
    const toast = this.page.getByRole('alert').filter({ hasText: message });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  }

  /** Assert that an error toast notification appears with the given message. */
  async expectErrorToast(message: string): Promise<void> {
    const toast = this.page.getByRole('alert').filter({ hasText: message });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  }

  /** Assert the page URL matches the expected path pattern. */
  async expectUrl(pathPattern: string | RegExp): Promise<void> {
    if (typeof pathPattern === 'string') {
      await expect(this.page).toHaveURL(new RegExp(pathPattern));
    } else {
      await expect(this.page).toHaveURL(pathPattern);
    }
  }

  /** Click a navigation link in the sidebar and wait for navigation. */
  async navigateTo(linkName: string): Promise<this> {
    await this.page.getByRole('navigation').getByRole('link', { name: linkName }).click();
    await this.waitForPageLoad();
    return this;
  }

  /** Wait for TanStack Query polling to refresh data (up to 15s cycle). */
  async waitForPollingRefresh(): Promise<this> {
    // TanStack Query polls every 15 seconds. Wait for the next
    // network request matching the API pattern to complete.
    await this.page.waitForResponse(
      (response) => response.url().includes('/api/v1/') && response.status() === 200,
      { timeout: 20_000 },
    );
    return this;
  }
}
