# Test Google OAuth Sign-In Flow

## Task Details

- **Title:** Test Google OAuth Sign-In Flow
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Authentication E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the complete Google OAuth sign-in flow using the mocked OAuth provider. Tests verify the full journey: navigating to the app as an unauthenticated user, being redirected to the sign-in page, clicking "Sign in with Google", completing the mocked OAuth flow, being redirected to the Dashboard, and maintaining the session across page navigations. Also tests the error state when OAuth fails.

### Test: Successful Google OAuth Sign-In

```typescript
// apps/web/e2e/auth/google-oauth.spec.ts
// E2E tests for the Google OAuth sign-in flow.
// Uses mocked OAuth provider (MSW) to bypass real Google authentication.
import { test, expect, TEST_USER } from '../fixtures';
import { SignInPage, DashboardPage } from '../page-objects';

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
    // The oauthFailureHandler redirects to /sign-in?error=OAuthCallbackError.
    await page.route('**/api/auth/callback/google*', (route) => {
      route.fulfill({
        status: 302,
        headers: {
          Location: '/sign-in?error=OAuthCallbackError&error_description=Authentication+failed',
        },
      });
    });

    const signInPage = new SignInPage(page);
    await signInPage.goto();

    // Click Google sign-in — the mocked failure redirects back with error.
    await signInPage.googleSignInButton.click();

    // Verify the error message is displayed on the sign-in page.
    await signInPage.expectUrl('/sign-in');
    await signInPage.expectOAuthError();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies unauthenticated users are redirected from protected routes (`/dashboard`) to `/sign-in`
- [ ] Test verifies clicking "Sign in with Google" triggers the mocked OAuth flow and redirects to `/dashboard`
- [ ] Test verifies the Dashboard page renders correctly after successful sign-in (heading visible)
- [ ] Test verifies the authenticated session persists across navigation to `/projects`, `/workers`, and back to `/dashboard`
- [ ] Test verifies the user's name is displayed in the user menu after sign-in
- [ ] Test verifies OAuth failure displays an error message on the sign-in page
- [ ] Test verifies the sign-in page remains displayed (not redirected) after OAuth failure
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The mocked OAuth flow uses MSW to intercept Better Auth's `/api/auth/signin/google` and `/api/auth/callback/google` endpoints. The mock returns a valid session cookie without hitting real Google servers.
- The OAuth failure test overrides the callback handler using Playwright's `page.route()` to simulate a specific failure scenario independently of the MSW global handlers.
- Session persistence is verified by navigating to multiple protected routes after sign-in. If the session is not maintained, the auth middleware would redirect back to `/sign-in`.
- The user menu assertion (`getByTestId("user-menu")`) verifies the session data is available client-side and rendered in the header component.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Google OAuth sign-in flow with mocked OAuth provider)
- **Functional Requirements:** FR-AUTH-001 (Google OAuth authentication), FR-AUTH-003 (protected route redirect)
- **Design Specification:** Sign-in page layout, Dashboard page layout, user menu component

## Estimated Complexity

Medium — The happy path is straightforward with MSW mocking in place, but testing the error state requires overriding the default mock handler and verifying the error message display. Cross-browser compatibility may reveal differences in redirect handling.
