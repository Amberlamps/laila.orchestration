# Test Session Persistence and Sign-Out

## Task Details

- **Title:** Test Session Persistence and Sign-Out
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Authentication E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for session persistence across browser restarts (via refresh token), sign-out flow with redirect to sign-in and protected route enforcement, and expired session handling with automatic redirect.

### Test: Session Persistence and Sign-Out

```typescript
// apps/web/e2e/auth/session-persistence.spec.ts
// E2E tests for session persistence, sign-out, and expired session handling.
// Tests verify that refresh tokens keep sessions alive across tab closes,
// sign-out properly clears session state, and expired sessions trigger redirects.
import { test, expect, TEST_SESSION } from '../fixtures';
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

  test('expired session redirects to sign-in page', async ({ page }) => {
    // Set up an expired session by overriding the session endpoint
    // to return 401 (unauthorized).
    await page.route('**/api/auth/get-session', (route) => {
      route.fulfill({
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
```

## Acceptance Criteria

- [ ] Test verifies the session persists after a full page reload (simulating tab close/reopen)
- [ ] Test verifies the user remains on the dashboard after reload (not redirected to sign-in)
- [ ] Test verifies clicking "Sign Out" in the user menu clears the session and redirects to `/sign-in`
- [ ] Test verifies all protected routes (`/dashboard`, `/projects`, `/workers`, `/personas`, `/audit-log`) redirect to `/sign-in` after sign-out
- [ ] Test verifies an expired session (401 from session endpoint) triggers redirect to `/sign-in`
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Session persistence relies on Better Auth's refresh token mechanism. The mock session endpoint returns a valid session on every call (simulating a successful refresh). The page reload test verifies that the client-side auth state is rehydrated from cookies.
- The sign-out flow clears the session cookie via the mocked `/api/auth/sign-out` endpoint, which sets `Max-Age=0` on the session cookie.
- Protected route enforcement is tested by iterating over all known protected routes after sign-out. This ensures the auth middleware consistently redirects unauthenticated users.
- The expired session test overrides the MSW handler using Playwright's `page.route()` to return a 401, simulating token expiration.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — session persistence, sign-out)
- **Functional Requirements:** FR-AUTH-002 (session management with refresh tokens), FR-AUTH-004 (sign-out clears session)
- **Design Specification:** User menu component, sign-out flow, protected route middleware

## Estimated Complexity

Medium — Session persistence and sign-out are core auth flows, but the expired session scenario requires precise mock override timing. Cross-browser cookie handling may also vary slightly.
