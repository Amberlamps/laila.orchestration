# Write Auth Integration Tests

## Task Details

- **Title:** Write Auth Integration Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Configure Better Auth with Google OAuth](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement Auth API Route

## Description

Write comprehensive integration tests for the Google OAuth authentication flow, session lifecycle management, token refresh, and session invalidation. Since Google OAuth cannot be tested against the real provider in CI, the OAuth flow must be mocked while still testing the full request/response cycle through the Next.js API routes.

The tests should cover:

1. **Mocked Google OAuth Flow:**
   - Mock the Google OAuth token exchange endpoint to return a valid access token
   - Mock the Google userinfo endpoint to return a test user profile
   - Verify that the callback handler creates a user record in the database
   - Verify that the callback handler creates an OAuth account link
   - Verify that a session is created and returned as an HttpOnly cookie

2. **Session Creation and Retrieval:**
   - After successful OAuth callback, verify `GET /api/auth/session` returns the authenticated user
   - Verify the session response includes user ID, email, name, and image
   - Verify the session cookie has correct attributes (HttpOnly, Secure, SameSite)

3. **Token Refresh:**
   - Simulate an expired access token with a valid refresh token
   - Verify that the session endpoint automatically refreshes the token
   - Verify that the new access token is returned in the response

4. **Session Invalidation:**
   - Verify `POST /api/auth/signout` clears the session cookie
   - Verify subsequent `GET /api/auth/session` returns null/unauthenticated
   - Verify the session record is removed from the database

```typescript
// packages/web/src/tests/auth/oauth-flow.test.ts
// Integration tests for the complete Google OAuth authentication flow.
// Uses mocked Google endpoints to test the full request/response cycle.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestServer } from '@/tests/helpers/test-server';
import { createTestDatabase } from '@/tests/helpers/test-database';

describe('Google OAuth Flow', () => {
  // Set up a test database and HTTP server for each test.
  // The test server wraps the Next.js API routes with
  // the same middleware stack used in production.

  it('should create a user and session on first OAuth callback', async () => {
    // 1. Mock Google token exchange to return a valid access token
    // 2. Mock Google userinfo to return test user profile
    // 3. Call GET /api/auth/callback/google?code=mock_code
    // 4. Assert: user record created in database
    // 5. Assert: session cookie set in response headers
    // 6. Assert: GET /api/auth/session returns authenticated user
  });

  it('should link OAuth account to existing user on repeat sign-in', async () => {
    // Verify idempotent behavior when same Google user signs in again
  });

  it('should return null session for unauthenticated request', async () => {
    // GET /api/auth/session without cookies should return null
  });

  it('should invalidate session on sign-out', async () => {
    // 1. Sign in via mocked OAuth
    // 2. POST /api/auth/signout with session cookie
    // 3. Assert: session cookie cleared
    // 4. Assert: GET /api/auth/session returns null
  });
});
```

## Acceptance Criteria

- [ ] Test file exists at an appropriate location within the web package test directory
- [ ] Google OAuth token exchange endpoint is mocked (not hitting real Google servers)
- [ ] Google userinfo endpoint is mocked with a realistic test user profile
- [ ] Test verifies user creation in the database after first OAuth callback
- [ ] Test verifies OAuth account link creation in the database
- [ ] Test verifies session cookie is set with correct attributes (HttpOnly, SameSite)
- [ ] Test verifies `GET /api/auth/session` returns authenticated user data
- [ ] Test verifies idempotent behavior on repeat OAuth sign-in (no duplicate users)
- [ ] Test verifies `POST /api/auth/signout` clears session and cookie
- [ ] Test verifies session retrieval returns null after sign-out
- [ ] Test verifies token refresh behavior when access token is near expiry
- [ ] All tests pass in CI without requiring real Google OAuth credentials
- [ ] Tests use a dedicated test database (or transaction rollback) for isolation
- [ ] No use of `any` type in test code

## Technical Notes

- Use Vitest's `vi.mock()` or `msw` (Mock Service Worker) to intercept HTTP requests to Google's OAuth endpoints. MSW is preferred for integration tests because it intercepts at the network level, testing the full HTTP client stack.
- Better Auth makes HTTP requests to Google for token exchange (`https://oauth2.googleapis.com/token`) and user info (`https://www.googleapis.com/oauth2/v2/userinfo`). These are the endpoints to mock.
- Use `supertest` or a similar library to make HTTP requests to the Next.js API routes in the test environment.
- For database isolation, either use a separate test database or wrap each test in a transaction that rolls back. The database helpers from Epic 3 should provide this infrastructure.
- Session cookies in test responses can be inspected via response headers (`set-cookie`). Parse the cookie attributes to verify HttpOnly, Secure, and SameSite settings.
- Consider using Better Auth's test utilities if available — some auth libraries provide test helpers for simulating OAuth flows.
- Ensure all type assertions use specific types rather than `any` — use Zod schemas or TypeScript interfaces to type test data.

## References

- **Functional Requirements:** FR-AUTH-006 (auth flow testing), FR-TEST-001 (integration test coverage)
- **Design Specification:** Section 4.1.5 (Auth Testing Strategy), Section 8.1 (Test Infrastructure)
- **Project Setup:** Vitest configuration, test database setup, MSW configuration

## Estimated Complexity

Medium — Mocking the Google OAuth flow requires intercepting multiple HTTP requests and simulating the full callback sequence. Setting up the test database and API route test harness adds additional complexity. However, the test logic itself is straightforward once the infrastructure is in place.
