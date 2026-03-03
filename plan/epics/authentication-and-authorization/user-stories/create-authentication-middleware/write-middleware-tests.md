# Write Middleware Tests

## Task Details

- **Title:** Write Middleware Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Create Authentication Middleware](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement withAuth Higher-Order Function, Implement Authorization Model, Implement Protected Route HOC

## Description

Write comprehensive integration tests for the entire authentication middleware stack: the `withAuth` HOF, authorization helpers, and the protected page HOC. These tests validate that the correct auth type is enforced, authorization scoping works correctly, and all rejection scenarios return proper error responses.

### Test Groups

#### 1. withAuth HOF Tests

```typescript
// packages/web/src/tests/auth/with-auth.test.ts
// Integration tests for the withAuth higher-order function.
// Validates session auth, API key auth, type enforcement, and rejection.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, type AuthenticatedRequest } from '@/lib/middleware/with-auth';
import { createMockRequest, createMockResponse } from '@/tests/helpers/mock-http';

describe('withAuth', () => {
  describe('human auth (session cookie)', () => {
    it('should resolve session and inject HumanAuthContext', async () => {
      // Mock Better Auth session resolution to return a valid session.
      // Send request with valid session cookie to a human-only route.
      // Assert: handler receives req.auth with type "human" and correct user data.
    });

    it('should reject API key on a human-only route with 403', async () => {
      // Send request with valid API key to withAuth("human", handler).
      // Assert: 403 response with FORBIDDEN error code.
      // Assert: handler is never called.
    });

    it('should return 401 for request with no credentials', async () => {
      // Send request with no cookies and no Authorization header.
      // Assert: 401 response with UNAUTHORIZED error code.
    });

    it('should return 401 for expired session cookie', async () => {
      // Mock Better Auth to return null for an expired session.
      // Assert: 401 response.
    });
  });

  describe('agent auth (API key)', () => {
    it('should validate API key and inject WorkerAuthContext', async () => {
      // Seed valid API key in test database.
      // Send request with Authorization: Bearer lw_... header.
      // Assert: handler receives req.auth with type "agent" and correct worker data.
    });

    it('should reject session cookie on an agent-only route with 403', async () => {
      // Send request with valid session cookie to withAuth("agent", handler).
      // Assert: 403 response with FORBIDDEN error code.
    });

    it('should return 401 for invalid API key', async () => {
      // Send request with malformed API key.
      // Assert: 401 response.
    });
  });

  describe('both auth types', () => {
    it('should accept session cookie auth', async () => {
      // Assert: withAuth("both", handler) allows session auth.
    });

    it('should accept API key auth', async () => {
      // Assert: withAuth("both", handler) allows API key auth.
    });

    it('should prefer session auth when both credentials are present', async () => {
      // Send request with both session cookie and API key header.
      // Assert: handler receives HumanAuthContext (session takes priority).
    });
  });
});
```

#### 2. Authorization Model Tests

```typescript
// packages/web/src/tests/auth/authorization.test.ts
// Unit tests for authorization helpers: project access, tenant scoping.
import { describe, it, expect } from 'vitest';
import {
  authorizeProjectAccess,
  authorizeTenantAccess,
  buildQueryScope,
  assertHumanAuth,
  assertAgentAuth,
  AuthorizationError,
} from '@/lib/middleware/authorization';
import type { HumanAuthContext, WorkerAuthContext } from '@/lib/middleware/with-auth';

describe('authorizeProjectAccess', () => {
  it('should grant human access to own tenant project', () => {
    // Human with tenantId "user-1" accessing project with tenantId "user-1"
    // Assert: authorized is true
  });

  it("should deny human access to another tenant's project", () => {
    // Human with tenantId "user-1" accessing project with tenantId "user-2"
    // Assert: authorized is false
  });

  it('should grant worker access to authorized project', () => {
    // Worker with projectAccess ["proj-1", "proj-2"] accessing "proj-1"
    // Assert: authorized is true
  });

  it('should deny worker access to unauthorized project', () => {
    // Worker with projectAccess ["proj-1"] accessing "proj-3"
    // Assert: authorized is false
  });

  it('should deny worker access to project in different tenant', () => {
    // Worker with tenantId "user-1" accessing project with tenantId "user-2"
    // Assert: authorized is false (even if projectId is in access list)
  });
});

describe('assertHumanAuth / assertAgentAuth', () => {
  it('should not throw for correct auth type', () => {
    // assertHumanAuth with human context — no error
    // assertAgentAuth with agent context — no error
  });

  it('should throw AuthorizationError for wrong auth type', () => {
    // assertHumanAuth with agent context — throws AuthorizationError
    // assertAgentAuth with human context — throws AuthorizationError
  });
});
```

#### 3. Protected Page HOC Tests

```typescript
// packages/web/src/tests/auth/protected-page.test.ts
// Tests for the withProtectedPage HOC: redirect, return URL, props.
import { describe, it, expect, vi } from 'vitest';
import { withProtectedPage } from '@/lib/middleware/with-protected-page';

describe('withProtectedPage', () => {
  it('should redirect unauthenticated users to /sign-in with returnUrl', async () => {
    // Mock auth.api.getSession to return null.
    // Call the wrapped getServerSideProps.
    // Assert: result is a redirect to /sign-in?returnUrl=<encoded-path>
  });

  it('should pass user data in props for authenticated users', async () => {
    // Mock auth.api.getSession to return a valid session.
    // Assert: props include user object with id, email, name, image
  });

  it('should URL-encode the return URL', async () => {
    // Set resolvedUrl to a path with query parameters: "/projects?page=2"
    // Assert: returnUrl is properly encoded in the redirect destination
  });

  it('should merge additional props from the callback function', async () => {
    // Use withProtectedPage with a callback that returns { props: { extra: "data" } }
    // Assert: final props include both user and extra
  });

  it('should pass through redirects from the callback function', async () => {
    // Use withProtectedPage with a callback that returns a redirect
    // Assert: the redirect is returned as-is
  });

  it('should pass through notFound from the callback function', async () => {
    // Use withProtectedPage with a callback that returns notFound
    // Assert: notFound is returned as-is
  });
});
```

## Acceptance Criteria

- [ ] Tests for `withAuth("human")`: session auth succeeds, API key rejected (403), no credentials (401), expired session (401)
- [ ] Tests for `withAuth("agent")`: API key auth succeeds, session cookie rejected (403), invalid key (401)
- [ ] Tests for `withAuth("both")`: session accepted, API key accepted, session preferred when both present
- [ ] Tests for `authorizeProjectAccess`: human own-tenant granted, cross-tenant denied, worker authorized project granted, unauthorized project denied, cross-tenant worker denied
- [ ] Tests for `authorizeTenantAccess`: matching tenant granted, different tenant denied
- [ ] Tests for `assertHumanAuth`/`assertAgentAuth`: correct type passes, wrong type throws `AuthorizationError`
- [ ] Tests for `withProtectedPage`: unauthenticated redirects to /sign-in, return URL preserved and encoded, user props injected, additional props merged, redirect/notFound passthrough
- [ ] All error responses use the standard JSON error format with `code` and `message`
- [ ] No `any` types used in test code — all mock data and assertions use specific types
- [ ] Tests are isolated and do not share state between test cases
- [ ] All tests pass in CI

## Technical Notes

- For `withAuth` integration tests, mock Better Auth's `auth.api.getSession()` using `vi.mock()`. Create typed mock factories that return realistic session objects.
- For API key validation in tests, either mock the database layer or use a test database with seeded key records.
- Use `createMockRequest()` and `createMockResponse()` helpers to create typed mock Next.js request/response objects. These should match the `NextApiRequest`/`NextApiResponse` interfaces without using `any`.
- The protected page HOC tests can use a mock `GetServerSidePropsContext` — create a typed factory function that produces realistic context objects.
- Consider testing error response bodies with Zod schemas to ensure they match the expected format.
- The "both credentials present" test case validates the priority order: session auth should be attempted before API key auth.

## References

- **Functional Requirements:** FR-AUTH-050 (middleware test coverage), FR-TEST-001 (integration test standards)
- **Design Specification:** Section 4.3.5 (Middleware Testing Strategy), Section 8.1 (Test Infrastructure)
- **Project Setup:** Vitest configuration, mock factories, test database setup

## Estimated Complexity

Large — This task tests the entire middleware stack across multiple auth types, authorization models, and the page HOC. The number of test scenarios is high (15+ distinct test cases) and mocking both Better Auth sessions and API key validation requires careful setup. Each test must use specific types (no `any`).
