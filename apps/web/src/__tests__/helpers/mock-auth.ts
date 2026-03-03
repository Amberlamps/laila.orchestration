/**
 * @module mock-auth
 *
 * Test helper for mocking authentication in API route integration tests.
 *
 * Provides a controlled way to simulate authenticated and unauthenticated
 * requests by mocking the Better Auth session resolution and the API key
 * validator used by the `withAuth` middleware.
 *
 * Usage:
 *   1. Call `vi.mock('@/lib/auth', ...)` with the mock session factory
 *   2. Use `setMockSession()` to configure what session is returned
 *   3. Use `clearMockSession()` to simulate unauthenticated requests
 */

import type { HumanAuthContext } from '@/lib/middleware/with-auth';

// ---------------------------------------------------------------------------
// Mock session state
// ---------------------------------------------------------------------------

/**
 * The mock session that `auth.api.getSession()` will return.
 * When null, the auth middleware will reject with 401.
 */
let mockSession: {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  };
} | null = null;

/**
 * Sets the mock session to simulate an authenticated user.
 *
 * @param userId - The user's UUID (also used as tenantId)
 * @param email - The user's email
 * @param name - The user's display name
 */
export const setMockSession = (
  userId: string = 'test-user-uuid-001',
  email: string = 'test@example.com',
  name: string = 'Test User',
): void => {
  mockSession = {
    user: {
      id: userId,
      email,
      name,
      image: null,
    },
  };
};

/**
 * Clears the mock session to simulate an unauthenticated request.
 */
export const clearMockSession = (): void => {
  mockSession = null;
};

/**
 * Returns the current mock session. Used by the mock auth module.
 */
export const getMockSession = (): typeof mockSession => mockSession;

// ---------------------------------------------------------------------------
// Default test auth context
// ---------------------------------------------------------------------------

/**
 * Default test tenant ID used across tests.
 * This matches the userId set by `setMockSession()` since
 * tenantId === userId in this application.
 */
export const TEST_TENANT_ID = 'test-user-uuid-001';

/**
 * Returns a complete HumanAuthContext for the default test user.
 * Useful for direct comparison in assertions.
 */
export const getDefaultAuthContext = (): HumanAuthContext => ({
  type: 'human',
  userId: TEST_TENANT_ID,
  email: 'test@example.com',
  name: 'Test User',
  image: null,
  tenantId: TEST_TENANT_ID,
});
