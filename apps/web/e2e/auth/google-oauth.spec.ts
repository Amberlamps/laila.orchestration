// E2E tests for the Google OAuth sign-in flow.
// Uses mocked OAuth provider (MSW) to bypass real Google authentication.
import { test, expect, TEST_USER } from '../fixtures';
import { SignInPage, DashboardPage } from '../page-objects';

// Override the global storageState so these tests start without
// an authenticated session cookie. The OAuth flow itself creates
// the session during the test.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Google OAuth Sign-In', () => {
  test('unauthenticated user is redirected to sign-in page', async ({ page }) => {
    // Navigate to the dashboard without authentication.
    // The auth middleware should redirect to /sign-in.
    await page.goto('/dashboard');

    const signInPage = new SignInPage(page);
    await signInPage.expectSignInPageVisible();
    await signInPage.expectUrl('/sign-in');
  });

  test('successful Google OAuth sign-in redirects to dashboard', async ({ page }) => {
    const signInPage = new SignInPage(page);
    await signInPage.goto();

    // Verify the sign-in page renders correctly.
    await signInPage.expectSignInPageVisible();

    // Click "Sign in with Google" — the mocked OAuth flow
    // intercepts the redirect chain and creates a test session.
    await signInPage.signInWithGoogle();

    // Verify redirect to dashboard after successful OAuth.
    const dashboardPage = new DashboardPage(page);
    await expect(dashboardPage.heading).toBeVisible();
    await dashboardPage.expectUrl('/dashboard');
  });

  test('session persists across page navigations after sign-in', async ({ page }) => {
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await signInPage.signInWithGoogle();

    // Navigate to different pages and verify session remains active.
    // The user should not be redirected back to sign-in.
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects/);

    await page.goto('/workers');
    await expect(page).toHaveURL(/\/workers/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify the user's name/email is displayed in the header.
    const userMenu = page.getByTestId('user-menu');
    await expect(userMenu).toContainText(TEST_USER.name);
  });

  test('OAuth failure displays error message on sign-in page', async ({ page }) => {
    // Override the OAuth callback handler to simulate failure.
    // Better Auth's errorCallbackURL uses ?error=OAuthCallback (see sign-in.tsx line 179).
    await page.route('**/api/auth/callback/google*', (route) => {
      void route.fulfill({
        status: 302,
        headers: {
          Location: '/sign-in?error=OAuthCallback',
        },
      });
    });

    const signInPage = new SignInPage(page);
    await signInPage.goto();

    // Click Google sign-in — the mocked failure redirects back with ?error=OAuthCallback.
    await signInPage.googleSignInButton.click();

    // The ?error= query param triggers a full-page ErrorPage render (not the in-form alert).
    // Verify the authentication error page is displayed with the mapped error message.
    await signInPage.expectUrl('/sign-in');
    await expect(page.getByRole('heading', { name: /authentication error/i })).toBeVisible();
    await expect(page.getByText('Authentication failed. Please try again.')).toBeVisible();
  });
});
