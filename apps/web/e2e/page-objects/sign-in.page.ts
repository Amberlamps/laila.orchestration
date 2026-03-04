// Page object for the sign-in page with Google OAuth button interaction.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class SignInPage extends BasePage {
  /** Locator for the "Sign in with Google" OAuth button. */
  readonly googleSignInButton: Locator;

  /** Locator for the sign-in page heading. */
  readonly heading: Locator;

  /** Locator for an OAuth error message (displayed when OAuth fails). */
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.googleSignInButton = page.getByRole('button', {
      name: /sign in with google/i,
    });
    this.heading = page.getByRole('heading', { name: /sign in/i });
    this.errorMessage = page.getByRole('alert');
  }

  async goto(): Promise<this> {
    await this.page.goto('/sign-in');
    await this.waitForPageLoad();
    return this;
  }

  /** Click the Google OAuth sign-in button and wait for redirect. */
  async signInWithGoogle(): Promise<this> {
    await this.googleSignInButton.click();
    // After mocked OAuth, expect redirect to dashboard.
    await this.page.waitForURL('/dashboard', { timeout: 10_000 });
    return this;
  }

  /** Assert that the sign-in page is displayed correctly. */
  async expectSignInPageVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.googleSignInButton).toBeVisible();
    await expect(this.googleSignInButton).toBeEnabled();
  }

  /** Assert that an OAuth error message is displayed. */
  async expectOAuthError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toHaveText(message);
    }
  }
}
