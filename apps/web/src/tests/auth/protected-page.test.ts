/**
 * Tests for the withProtectedPage higher-order component.
 *
 * Validates redirect behavior for unauthenticated users, return URL
 * preservation and encoding, user props injection, additional props
 * merging, and redirect/notFound passthrough from callback functions.
 *
 * Mocks Better Auth's `auth.api.getSession()` to control session
 * resolution without requiring a real database or session store.
 *
 * Test groups:
 * - Unauthenticated: redirects to /sign-in with returnUrl
 * - URL encoding: return URL is properly encoded
 * - Authenticated: user data injected in props
 * - Callback: additional props merged, redirect passthrough, notFound passthrough
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ProtectedPageProps } from '@/lib/middleware/with-protected-page';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a Better Auth session returned by auth.api.getSession. */
interface MockSession {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
  };
}

/** Redirect result from getServerSideProps. */
interface RedirectResult {
  redirect: {
    destination: string;
    permanent: boolean;
  };
}

/** NotFound result from getServerSideProps. */
interface NotFoundResult {
  notFound: true;
}

/** Props result from getServerSideProps. */
interface PropsResult<P> {
  props: P;
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

/** Mock for auth.api.getSession. */
const mockGetSession =
  vi.fn<(params: { headers: Record<string, string> }) => Promise<MockSession | null>>();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: [{ headers: Record<string, string> }]) => mockGetSession(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a typed mock GetServerSidePropsContext. */
const createMockContext = (
  overrides: {
    resolvedUrl?: string;
    headers?: Record<string, string | string[] | undefined>;
  } = {},
): GetServerSidePropsContext => {
  const headers = overrides.headers ?? {};
  return {
    req: {
      headers,
    },
    res: {},
    resolvedUrl: overrides.resolvedUrl ?? '/dashboard',
    query: {},
    params: {},
  } as unknown as GetServerSidePropsContext;
};

/** Factory for a valid mock session. */
const createMockSession = (overrides: Partial<MockSession['user']> = {}): MockSession => ({
  user: {
    id: 'user-uuid-001',
    email: 'jane@example.com',
    name: 'Jane Doe',
    image: 'https://example.com/avatar.jpg',
    ...overrides,
  },
  session: {
    id: 'session-uuid-001',
    userId: overrides.id ?? 'user-uuid-001',
    token: 'session-token-abc',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import withProtectedPage AFTER mocks are set up.
const { withProtectedPage } = await import('@/lib/middleware/with-protected-page');

describe('withProtectedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // Unauthenticated redirect
  // -------------------------------------------------------------------------

  describe('unauthenticated users', () => {
    it('should redirect unauthenticated users to /sign-in with returnUrl', async () => {
      mockGetSession.mockResolvedValue(null);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext({ resolvedUrl: '/dashboard' });

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty('redirect');
      const redirectResult = result as RedirectResult;
      expect(redirectResult.redirect.destination).toBe(
        `/sign-in?returnUrl=${encodeURIComponent('/dashboard')}`,
      );
      expect(redirectResult.redirect.permanent).toBe(false);
    });

    it('should URL-encode the return URL with query parameters', async () => {
      mockGetSession.mockResolvedValue(null);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext({ resolvedUrl: '/projects?page=2&sort=name' });

      const result = await getServerSideProps(ctx);

      const redirectResult = result as RedirectResult;
      expect(redirectResult.redirect.destination).toBe(
        `/sign-in?returnUrl=${encodeURIComponent('/projects?page=2&sort=name')}`,
      );
    });

    it('should URL-encode the return URL with special characters', async () => {
      mockGetSession.mockResolvedValue(null);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext({ resolvedUrl: '/search?q=hello world&filter=a+b' });

      const result = await getServerSideProps(ctx);

      const redirectResult = result as RedirectResult;
      const expectedEncoded = encodeURIComponent('/search?q=hello world&filter=a+b');
      expect(redirectResult.redirect.destination).toBe(`/sign-in?returnUrl=${expectedEncoded}`);
    });

    it('should use 302 temporary redirect (not 301)', async () => {
      mockGetSession.mockResolvedValue(null);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirectResult = result as RedirectResult;
      expect(redirectResult.redirect.permanent).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Authenticated user props
  // -------------------------------------------------------------------------

  describe('authenticated users', () => {
    it('should pass user data in props for authenticated users', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty('props');
      const propsResult = result as PropsResult<ProtectedPageProps>;
      expect(propsResult.props.user).toEqual({
        id: 'user-uuid-001',
        email: 'jane@example.com',
        name: 'Jane Doe',
        image: 'https://example.com/avatar.jpg',
      });
    });

    it('should handle null image in user props', async () => {
      const session = createMockSession({ image: null });
      mockGetSession.mockResolvedValue(session);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const propsResult = result as PropsResult<ProtectedPageProps>;
      expect(propsResult.props.user.image).toBeNull();
    });

    it('should handle undefined image (coerced to null) in user props', async () => {
      const session = createMockSession();
      // Simulate a user without image field set (undefined)
      session.user.image = undefined as unknown as string | null;
      mockGetSession.mockResolvedValue(session);

      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const propsResult = result as PropsResult<ProtectedPageProps>;
      // The HOC uses `?? null`, so undefined is coerced to null
      expect(propsResult.props.user.image).toBeNull();
    });

    it('should pass request headers to auth.api.getSession', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const headers: Record<string, string> = {
        cookie: 'better-auth.session_token=valid-token',
      };
      const getServerSideProps = withProtectedPage();
      const ctx = createMockContext({ headers });

      await getServerSideProps(ctx);

      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(mockGetSession).toHaveBeenCalledWith({ headers });
    });
  });

  // -------------------------------------------------------------------------
  // Callback function: additional props
  // -------------------------------------------------------------------------

  describe('callback function', () => {
    it('should merge additional props from the callback function', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      interface ExtraProps extends Record<string, unknown> {
        projectCount: number;
        recentActivity: string[];
      }

      const getServerSideProps = withProtectedPage<ExtraProps>(async () => {
        return {
          props: {
            projectCount: 42,
            recentActivity: ['created project', 'updated settings'],
          },
        };
      });
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty('props');
      const propsResult = result as PropsResult<ProtectedPageProps & ExtraProps>;

      // User props should be present
      expect(propsResult.props.user).toEqual({
        id: 'user-uuid-001',
        email: 'jane@example.com',
        name: 'Jane Doe',
        image: 'https://example.com/avatar.jpg',
      });

      // Additional props should be merged
      expect(propsResult.props.projectCount).toBe(42);
      expect(propsResult.props.recentActivity).toEqual(['created project', 'updated settings']);
    });

    it('should pass user data to the callback function', async () => {
      const session = createMockSession({
        id: 'callback-user-id',
        email: 'callback@example.com',
        name: 'Callback User',
      });
      mockGetSession.mockResolvedValue(session);

      const callbackSpy = vi
        .fn<
          (
            ctx: GetServerSidePropsContext,
            user: ProtectedPageProps['user'],
          ) => Promise<GetServerSidePropsResult<Record<string, never>>>
        >()
        .mockResolvedValue({ props: {} });

      const getServerSideProps = withProtectedPage(callbackSpy);
      const ctx = createMockContext();

      await getServerSideProps(ctx);

      expect(callbackSpy).toHaveBeenCalledTimes(1);
      const receivedUser = callbackSpy.mock.calls[0]![1];
      expect(receivedUser.id).toBe('callback-user-id');
      expect(receivedUser.email).toBe('callback@example.com');
      expect(receivedUser.name).toBe('Callback User');
    });

    it('should pass through redirect from the callback function', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const getServerSideProps = withProtectedPage(async () => {
        return {
          redirect: {
            destination: '/onboarding',
            permanent: false,
          },
        };
      });
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty('redirect');
      const redirectResult = result as RedirectResult;
      expect(redirectResult.redirect.destination).toBe('/onboarding');
      expect(redirectResult.redirect.permanent).toBe(false);
    });

    it('should pass through notFound from the callback function', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const getServerSideProps = withProtectedPage(async () => {
        return {
          notFound: true as const,
        };
      });
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty('notFound');
      const notFoundResult = result as NotFoundResult;
      expect(notFoundResult.notFound).toBe(true);
    });

    it('should not call callback when user is unauthenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const callbackSpy = vi.fn().mockResolvedValue({ props: {} });

      const getServerSideProps = withProtectedPage(callbackSpy);
      const ctx = createMockContext();

      await getServerSideProps(ctx);

      expect(callbackSpy).not.toHaveBeenCalled();
    });
  });
});
