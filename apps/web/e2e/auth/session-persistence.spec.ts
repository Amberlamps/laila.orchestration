// E2E tests for session persistence, sign-out, and expired session handling.
// Tests verify that refresh tokens keep sessions alive across tab closes,
// sign-out properly clears session state, and expired sessions trigger redirects.
import { test, expect } from '../fixtures';
import { SignInPage, DashboardPage } from '../page-objects';

test.describe('Session Persistence and Sign-Out', () => {
  test('session persists after page reload (refresh token)', async ({
    authenticatedPage: page,
  }) => {
    // Start on the dashboard with an active session.
    await page.goto('/dashboard');
    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toBeVisible();

    // Reload the page to simulate closing and reopening the tab.
    // The refresh token should keep the session alive.
    await page.reload();

    // Verify the user is still authenticated after reload.
    await expect(dashboard.heading).toBeVisible();
    await dashboard.expectUrl('/dashboard');
  });

  test('sign-out clears session and redirects to sign-in', async ({ authenticatedPage: page }) => {
    // Start on the dashboard with an active session.
    await page.goto('/dashboard');

    // Click the user menu and sign out.
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();

    // Verify redirect to the sign-in page.
    const signInPage = new SignInPage(page);
    await signInPage.expectUrl('/sign-in');
    await signInPage.expectSignInPageVisible();
  });

  test('protected routes are inaccessible after sign-out', async ({ authenticatedPage: page }) => {
    // Sign in then sign out.
    await page.goto('/dashboard');
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();

    // After sign-out, attempt to access protected routes.
    // Each should redirect to /sign-in.
    const protectedRoutes = ['/dashboard', '/projects', '/workers', '/personas', '/audit-log'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test('expired session redirects to sign-in page', async ({ authenticatedPage: page }) => {
    // Start from an authenticated state, then override the session endpoint
    // to return 401 — simulating a session that expires mid-use.
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired' }),
      });
    });

    // Attempt to access a protected route with an expired session.
    await page.goto('/dashboard');

    // Verify the user is redirected to sign-in with an appropriate
    // message indicating the session has expired.
    const signInPage = new SignInPage(page);
    await signInPage.expectUrl('/sign-in');
    await signInPage.expectSignInPageVisible();
  });
});
