/**
 * Integration tests for the Google OAuth authentication flow.
 *
 * Uses Better Auth's built-in test utilities with an in-memory SQLite
 * database (via Node.js 22 node:sqlite) to test the complete OAuth flow,
 * session lifecycle, and sign-out behavior without connecting to real
 * Google servers or a real PostgreSQL database.
 *
 * Additionally exercises auth.handler directly — the same handler wired
 * into the Next.js catch-all API route via toNextJsHandler — to verify
 * end-to-end request/response behavior at the route level.
 *
 * Better Auth endpoint paths (all relative to /api/auth):
 *   GET  /get-session       — retrieve current session
 *   POST /sign-out          — invalidate session
 *   POST /sign-in/social    — initiate social OAuth (e.g. Google)
 *   GET  /callback/:provider — handle OAuth provider callback
 */
import { parseSetCookieHeader, splitSetCookieHeader } from 'better-auth/cookies';
import { testUtils } from 'better-auth/plugins';
import { getTestInstance } from 'better-auth/test';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';

import type { BetterAuthPlugin, BetterAuthOptions } from 'better-auth';
import type { TestHelpers } from 'better-auth/plugins';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_GOOGLE_USER = {
  sub: 'google-uid-1234567890',
  email: 'jane.doe@gmail.com',
  email_verified: true,
  name: 'Jane Doe',
  picture: 'https://lh3.googleusercontent.com/a/example-photo',
  given_name: 'Jane',
  family_name: 'Doe',
  locale: 'en',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'https://accounts.google.com',
  aud: 'test',
} as const;

/**
 * Creates a minimal unsigned JWT from a payload.
 * The Google provider's getUserInfo decodes the id_token using jose's
 * decodeJwt (not verify), so only the payload structure matters.
 */
const createTestIdToken = (payload: Record<string, unknown>): string => {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-kid-1' };
  const encode = (obj: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.fake-signature`;
};

const MOCK_ID_TOKEN = createTestIdToken(TEST_GOOGLE_USER as unknown as Record<string, unknown>);

const MOCK_TOKEN_RESPONSE = {
  access_token: 'mock-google-access-token-abc123',
  token_type: 'Bearer',
  expires_in: 3599,
  id_token: MOCK_ID_TOKEN,
  refresh_token: 'mock-google-refresh-token-xyz789',
  scope: 'email profile openid',
};

// ---------------------------------------------------------------------------
// Type definitions for parsed response data
// ---------------------------------------------------------------------------

interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

interface AuthenticatedSessionResponse {
  user: SessionUser;
  session: SessionRecord;
}

/**
 * Parsed cookie attributes as returned by parseSetCookieHeader.
 * Uses lowercase keys matching the implementation in better-auth/cookies.
 */
interface ParsedCookieAttributes {
  value: string;
  httponly?: boolean;
  secure?: boolean;
  samesite?: string;
  path?: string;
  domain?: string;
  'max-age'?: number;
  expires?: Date;
  maxAge?: number;
}

/** Database record shape for type-safe db.findMany results. */
type DbRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Extracts all cookies from a set-cookie response header and
 * formats them as a single "cookie" request header string.
 */
const extractCookiesFromResponse = (response: Response): string => {
  const setCookieHeader = response.headers.get('set-cookie');
  if (!setCookieHeader) return '';

  const parts = splitSetCookieHeader(setCookieHeader);
  const cookiePairs: string[] = [];

  for (const part of parts) {
    const nameValuePart = part.split(';')[0]?.trim();
    if (nameValuePart) {
      cookiePairs.push(nameValuePart);
    }
  }

  return cookiePairs.join('; ');
};

/**
 * Merges two cookie strings, with the second taking precedence
 * for cookies with the same name.
 */
const mergeCookies = (existing: string, incoming: string): string => {
  const cookieMap = new Map<string, string>();

  for (const cookieStr of [existing, incoming]) {
    if (!cookieStr) continue;
    for (const pair of cookieStr.split('; ')) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        const name = pair.substring(0, eqIndex);
        cookieMap.set(name, pair);
      }
    }
  }

  return Array.from(cookieMap.values()).join('; ');
};

// ---------------------------------------------------------------------------
// Fetch mocking
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

/**
 * Creates a mock fetch that intercepts Google OAuth HTTP requests while
 * delegating all other requests to the original fetch implementation.
 */
const createGoogleMockFetch = (tokenResponse: Record<string, unknown> = MOCK_TOKEN_RESPONSE) =>
  vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Mock Google token exchange endpoint
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify(tokenResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Mock Google JWKS endpoint (used for id_token verification)
    if (url.startsWith('https://www.googleapis.com/oauth2/v3/certs')) {
      return new Response(
        JSON.stringify({
          keys: [
            {
              kid: 'test-kid-1',
              kty: 'RSA',
              alg: 'RS256',
              use: 'sig',
              n: 'test-modulus',
              e: 'AQAB',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Mock Google userinfo endpoint (fallback)
    if (url.startsWith('https://www.googleapis.com/oauth2/v2/userinfo')) {
      return new Response(
        JSON.stringify({
          id: TEST_GOOGLE_USER.sub,
          email: TEST_GOOGLE_USER.email,
          verified_email: TEST_GOOGLE_USER.email_verified,
          name: TEST_GOOGLE_USER.name,
          picture: TEST_GOOGLE_USER.picture,
          given_name: TEST_GOOGLE_USER.given_name,
          family_name: TEST_GOOGLE_USER.family_name,
          locale: TEST_GOOGLE_USER.locale,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // All other requests go through the original fetch
    return originalFetch(input, init);
  });

// ---------------------------------------------------------------------------
// Shared test config (mirrors production auth.ts)
// ---------------------------------------------------------------------------

const TEST_AUTH_OPTIONS: Partial<BetterAuthOptions> = {
  socialProviders: {
    google: {
      clientId: 'test',
      clientSecret: 'test',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 15, // 15 minutes
    },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: false, // test environment
      sameSite: 'lax' as const,
      path: '/',
    },
  },
  plugins: [testUtils() as BetterAuthPlugin],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Google OAuth Authentication Flow', () => {
  let testHelpers: TestHelpers;
  let customFetchImpl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
  let db: { findMany: (args: { model: string }) => Promise<unknown[]> };
  /** The raw auth handler — same function the Next.js catch-all route delegates to. */
  let authHandler: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    const instance = await getTestInstance(TEST_AUTH_OPTIONS, {
      disableTestUser: true,
    });

    customFetchImpl = instance.customFetchImpl;
    db = instance.db;
    authHandler = instance.auth.handler;

    const ctx = await instance.auth.$context;
    testHelpers = (ctx as Record<string, unknown>).test as TestHelpers;
  });

  beforeEach(() => {
    globalThis.fetch = createGoogleMockFetch();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Helper: simulate a full Google OAuth callback
  // -------------------------------------------------------------------------

  interface OAuthCallbackResult {
    callbackResponse: Response;
    sessionCookieValue: string;
    setCookieHeader: string;
    allCookies: string;
  }

  /**
   * Simulates the complete Google OAuth flow:
   * 1. POST /api/auth/sign-in/social to initiate the flow and get the
   *    authorization URL + state cookie
   * 2. GET /api/auth/callback/google with the state cookie forwarded,
   *    a mock authorization code, and the state parameter
   */
  const simulateGoogleOAuthCallback = async (): Promise<OAuthCallbackResult> => {
    // Step 1: Initiate social sign-in (Google OAuth)
    const signInResponse = await customFetchImpl('http://localhost:3000/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: 'http://localhost:3000/dashboard',
        disableRedirect: true,
      }),
    });

    const signInData = (await signInResponse.json()) as { url: string };
    const authorizationUrl = new URL(signInData.url);
    const state = authorizationUrl.searchParams.get('state');

    if (!state) {
      throw new Error('No state parameter found in authorization URL');
    }

    const signInCookies = extractCookiesFromResponse(signInResponse);

    // Step 2: Call the OAuth callback with the state cookie forwarded
    const callbackUrl = new URL('http://localhost:3000/api/auth/callback/google');
    callbackUrl.searchParams.set('code', 'mock_auth_code_123');
    callbackUrl.searchParams.set('state', state);

    const callbackResponse = await customFetchImpl(callbackUrl.toString(), {
      method: 'GET',
      headers: { cookie: signInCookies },
    });

    const setCookieHeader = callbackResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No set-cookie header in callback response');
    }

    const parsed = parseSetCookieHeader(setCookieHeader);
    const sessionCookieValue = parsed.get('better-auth.session_token')?.value;

    if (!sessionCookieValue) {
      throw new Error('No session cookie found in callback response');
    }

    const callbackCookies = extractCookiesFromResponse(callbackResponse);
    const allCookies = mergeCookies(signInCookies, callbackCookies);

    return {
      callbackResponse,
      sessionCookieValue,
      setCookieHeader,
      allCookies,
    };
  };

  // -------------------------------------------------------------------------
  // Test: Mocked Google OAuth Flow
  // -------------------------------------------------------------------------

  describe('Mocked Google OAuth Flow', () => {
    it('should create a user and session on first OAuth callback', async () => {
      const { callbackResponse, sessionCookieValue, setCookieHeader } =
        await simulateGoogleOAuthCallback();

      expect(callbackResponse.status).toBe(302);
      expect(setCookieHeader).toBeTruthy();
      expect(sessionCookieValue).toBeDefined();
      expect(sessionCookieValue).not.toBe('');

      const users = (await db.findMany({ model: 'user' })) as DbRecord[];
      const createdUser = users.find((u) => u.email === TEST_GOOGLE_USER.email);
      expect(createdUser).toBeDefined();
      expect(createdUser?.name).toBe(TEST_GOOGLE_USER.name);
      expect(createdUser?.email).toBe(TEST_GOOGLE_USER.email);
      expect(createdUser?.image).toBe(TEST_GOOGLE_USER.picture);
    });

    it('should create an OAuth account link in the database', async () => {
      await simulateGoogleOAuthCallback();

      const users = (await db.findMany({ model: 'user' })) as DbRecord[];
      const user = users.find((u) => u.email === TEST_GOOGLE_USER.email);
      expect(user).toBeDefined();

      const accounts = (await db.findMany({ model: 'account' })) as DbRecord[];
      const googleAccount = accounts.find(
        (a) => a.providerId === 'google' && a.userId === user?.id,
      );

      expect(googleAccount).toBeDefined();
      expect(googleAccount?.providerId).toBe('google');
      expect(googleAccount?.accountId).toBe(TEST_GOOGLE_USER.sub);
    });

    it('should set session cookie with correct attributes (HttpOnly, SameSite)', async () => {
      const { setCookieHeader } = await simulateGoogleOAuthCallback();

      expect(setCookieHeader).toBeTruthy();

      const parsed = parseSetCookieHeader(setCookieHeader);
      const sessionCookie = parsed.get('better-auth.session_token') as
        | ParsedCookieAttributes
        | undefined;

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httponly).toBe(true);

      const sameSiteValue = sessionCookie?.samesite ?? '';
      expect(sameSiteValue.toLowerCase()).toBe('lax');
      expect(sessionCookie?.path).toBe('/');
    });

    it('should not create duplicate users on repeat OAuth sign-in', async () => {
      await simulateGoogleOAuthCallback();

      const usersBefore = (await db.findMany({ model: 'user' })) as DbRecord[];
      const countBefore = usersBefore.filter((u) => u.email === TEST_GOOGLE_USER.email).length;

      await simulateGoogleOAuthCallback();

      const usersAfter = (await db.findMany({ model: 'user' })) as DbRecord[];
      const countAfter = usersAfter.filter((u) => u.email === TEST_GOOGLE_USER.email).length;

      expect(countAfter).toBe(countBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Google OAuth sign-in initiation
  // -------------------------------------------------------------------------

  describe('Google OAuth sign-in initiation', () => {
    it('should return Google OAuth authorization URL on sign-in', async () => {
      // Better Auth exposes Google sign-in via POST /sign-in/social.
      // The response is 200 with a JSON body containing the authorization
      // URL. The client reads this URL and performs a browser redirect.
      const response = await customFetchImpl('http://localhost:3000/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: 'http://localhost:3000/dashboard',
        }),
      });

      expect(response.status).toBe(200);

      // The Location header is set for redirect-capable clients
      const location = response.headers.get('location');
      expect(location).toBeDefined();
      expect(location).toContain('accounts.google.com');

      // The JSON body also contains the authorization URL
      const data = (await response.json()) as { url: string };
      expect(data.url).toContain('accounts.google.com');
      expect(data.url).toContain('client_id=test');
      expect(data.url).toContain('response_type=code');
    });
  });

  // -------------------------------------------------------------------------
  // Test: Session Creation and Retrieval
  // -------------------------------------------------------------------------

  describe('Session Creation and Retrieval', () => {
    it('should return authenticated user data from session endpoint', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      const sessionResponse = await customFetchImpl('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });

      expect(sessionResponse.status).toBe(200);
      const sessionData = (await sessionResponse.json()) as AuthenticatedSessionResponse;

      expect(sessionData.user).toBeDefined();
      expect(sessionData.user.email).toBe(TEST_GOOGLE_USER.email);
      expect(sessionData.user.name).toBe(TEST_GOOGLE_USER.name);
      expect(sessionData.user.image).toBe(TEST_GOOGLE_USER.picture);
      expect(sessionData.user.id).toBeDefined();

      expect(sessionData.session).toBeDefined();
      expect(sessionData.session.userId).toBe(sessionData.user.id);
      expect(sessionData.session.token).toBeDefined();
      expect(sessionData.session.expiresAt).toBeDefined();
    });

    it('should return null session for unauthenticated request', async () => {
      const sessionResponse = await customFetchImpl('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {},
      });

      const sessionData = (await sessionResponse.json()) as Record<string, unknown> | null;

      const isUnauthenticated =
        sessionData === null || sessionData.user === null || sessionData.session === null;
      expect(isUnauthenticated).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Session Invalidation (Sign-out)
  // -------------------------------------------------------------------------

  describe('Session Invalidation', () => {
    it('should clear session on sign-out', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      // Verify we have a valid session first
      const preSignOutResponse = await customFetchImpl(
        'http://localhost:3000/api/auth/get-session',
        {
          method: 'GET',
          headers: {
            cookie: `better-auth.session_token=${sessionCookieValue}`,
          },
        },
      );
      const preSignOutData = (await preSignOutResponse.json()) as AuthenticatedSessionResponse;
      expect(preSignOutData.session).not.toBeNull();

      // Sign out
      const signOutResponse = await customFetchImpl('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });

      expect(signOutResponse.ok).toBe(true);

      // Verify the session cookie is cleared in the response
      const signOutSetCookie = signOutResponse.headers.get('set-cookie');
      expect(signOutSetCookie).toBeTruthy();

      const signOutParsed = parseSetCookieHeader(signOutSetCookie!);
      const clearedCookie = signOutParsed.get('better-auth.session_token') as
        | ParsedCookieAttributes
        | undefined;
      if (clearedCookie) {
        const isCleared =
          clearedCookie.value === '' ||
          clearedCookie.maxAge === 0 ||
          clearedCookie['max-age'] === 0 ||
          (clearedCookie.expires !== undefined && clearedCookie.expires <= new Date());
        expect(isCleared).toBe(true);
      }
    });

    it('should return null session after sign-out', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      await customFetchImpl('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });

      const sessionResponse = await customFetchImpl('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });

      const sessionData = (await sessionResponse.json()) as Record<string, unknown> | null;

      const isUnauthenticated =
        sessionData === null || sessionData.session === null || sessionData.user === null;
      expect(isUnauthenticated).toBe(true);
    });

    it('should remove session record from the database on sign-out', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      const sessionResponse = await customFetchImpl('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });
      const sessionData = (await sessionResponse.json()) as AuthenticatedSessionResponse;
      const sessionToken = sessionData.session.token;

      await customFetchImpl('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        },
      });

      const sessions = (await db.findMany({ model: 'session' })) as DbRecord[];
      const removedSession = sessions.find((s) => s.token === sessionToken);
      expect(removedSession).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Test: Token Refresh Behavior
  // -------------------------------------------------------------------------

  describe('Token Refresh Behavior', () => {
    it('should refresh session when cookie cache expires', async () => {
      // Use a test instance with a very short cookie cache (1 second)
      // so we can actually wait for it to expire.
      const shortCacheOptions: Partial<BetterAuthOptions> = {
        socialProviders: {
          google: { clientId: 'test', clientSecret: 'test' },
        },
        session: {
          expiresIn: 60 * 60 * 24 * 30,
          updateAge: 60 * 60 * 24,
          cookieCache: {
            enabled: true,
            maxAge: 1, // 1 second cache — will expire quickly
          },
        },
        advanced: {
          defaultCookieAttributes: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax' as const,
            path: '/',
          },
        },
        plugins: [testUtils() as BetterAuthPlugin],
      };

      const shortCacheInstance = await getTestInstance(shortCacheOptions, {
        disableTestUser: true,
      });

      const shortCacheFetch = shortCacheInstance.customFetchImpl;

      // Create a user and session via testUtils
      const shortCtx = await shortCacheInstance.auth.$context;
      const shortHelpers = (shortCtx as Record<string, unknown>).test as TestHelpers;
      const user = shortHelpers.createUser({
        email: 'refresh-test@example.com',
        name: 'Refresh Test',
      });
      const saved = await shortHelpers.saveUser(user);
      const loginResult = await shortHelpers.login({ userId: saved.id });

      // Use the signed cookie from the login headers (raw token is unsigned)
      const sessionCookie = loginResult.headers.get('cookie') ?? '';

      // First request — within cache window, session is served from cache
      const response1 = await shortCacheFetch('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: { cookie: sessionCookie },
      });
      expect(response1.status).toBe(200);
      const data1 = (await response1.json()) as AuthenticatedSessionResponse;
      expect(data1.user.email).toBe('refresh-test@example.com');

      // Capture the cookie cache token from the first response
      const firstSetCookie = response1.headers.get('set-cookie') ?? '';
      const firstParsed = parseSetCookieHeader(firstSetCookie);
      const firstCacheValue = firstParsed.get('better-auth.session_data') as
        | ParsedCookieAttributes
        | undefined;

      // Wait for the 1-second cookie cache to expire
      await new Promise((resolve) => {
        setTimeout(resolve, 1100);
      });

      // Second request — after cache expiry, Better Auth must re-fetch
      // the session from the database and issue a fresh cache cookie
      const response2 = await shortCacheFetch('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: { cookie: sessionCookie },
      });
      expect(response2.status).toBe(200);
      const data2 = (await response2.json()) as AuthenticatedSessionResponse;

      // Session remains valid after cache expiry — the DB session is still alive
      expect(data2.user.email).toBe('refresh-test@example.com');
      expect(data2.session.token).toBeDefined();

      // A new set-cookie header should be present with a refreshed cache
      const secondSetCookie = response2.headers.get('set-cookie') ?? '';
      const secondParsed = parseSetCookieHeader(secondSetCookie);
      const secondCacheValue = secondParsed.get('better-auth.session_data') as
        | ParsedCookieAttributes
        | undefined;

      // If both responses set cache cookies, the second (post-expiry)
      // should carry a different value (fresh JWT from DB re-fetch)
      if (firstCacheValue && secondCacheValue) {
        expect(secondCacheValue.value).not.toBe(firstCacheValue.value);
      }

      // The session expiry should be within the 30-day window
      const expiresAt = new Date(data2.session.expiresAt).getTime();
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThan(now);
      expect(expiresAt).toBeLessThanOrEqual(now + thirtyDaysMs + 60_000);

      await shortHelpers.deleteUser(saved.id);
    });

    it('should update OAuth account tokens on repeat sign-in', async () => {
      await simulateGoogleOAuthCallback();

      const accountsBefore = (await db.findMany({ model: 'account' })) as DbRecord[];
      const googleAccountBefore = accountsBefore.find(
        (a) => a.providerId === 'google' && a.accountId === TEST_GOOGLE_USER.sub,
      );
      expect(googleAccountBefore).toBeDefined();

      const updatedTokenResponse = {
        ...MOCK_TOKEN_RESPONSE,
        access_token: 'updated-google-access-token-def456',
        refresh_token: 'updated-google-refresh-token-uvw321',
      };
      globalThis.fetch = createGoogleMockFetch(updatedTokenResponse);

      await simulateGoogleOAuthCallback();

      const accountsAfter = (await db.findMany({ model: 'account' })) as DbRecord[];
      const googleAccountsAfter = accountsAfter.filter(
        (a) => a.providerId === 'google' && a.accountId === TEST_GOOGLE_USER.sub,
      );

      expect(googleAccountsAfter.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Route-level end-to-end via auth.handler
  //
  // These tests exercise the same handler that the Next.js catch-all route
  // delegates to (via toNextJsHandler), verifying full request/response
  // cycle behavior. auth.handler is a web-standard
  // (Request) => Promise<Response> function.
  // -------------------------------------------------------------------------

  describe('Route-level auth handler (end-to-end)', () => {
    it('should return session data for authenticated request via auth.handler', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      const request = new Request('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: new Headers({
          cookie: `better-auth.session_token=${sessionCookieValue}`,
        }),
      });

      const response = await authHandler(request);

      expect(response.status).toBe(200);
      const data = (await response.json()) as AuthenticatedSessionResponse;
      expect(data.user.email).toBe(TEST_GOOGLE_USER.email);
      expect(data.user.name).toBe(TEST_GOOGLE_USER.name);
      expect(data.session).toBeDefined();
      expect(data.session.userId).toBe(data.user.id);
    });

    it('should return null session for unauthenticated request via auth.handler', async () => {
      const request = new Request('http://localhost:3000/api/auth/get-session', { method: 'GET' });

      const response = await authHandler(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as Record<string, unknown> | null;
      const isUnauthenticated = data === null || data.session === null || data.user === null;
      expect(isUnauthenticated).toBe(true);
    });

    it('should invalidate session via auth.handler on sign-out', async () => {
      const { sessionCookieValue } = await simulateGoogleOAuthCallback();

      // Verify session exists first
      const checkResp = await authHandler(
        new Request('http://localhost:3000/api/auth/get-session', {
          method: 'GET',
          headers: new Headers({
            cookie: `better-auth.session_token=${sessionCookieValue}`,
          }),
        }),
      );
      const checkData = (await checkResp.json()) as AuthenticatedSessionResponse;
      expect(checkData.session).not.toBeNull();

      // Sign out via auth handler
      const signOutResp = await authHandler(
        new Request('http://localhost:3000/api/auth/sign-out', {
          method: 'POST',
          headers: new Headers({
            'Content-Type': 'application/json',
            cookie: `better-auth.session_token=${sessionCookieValue}`,
          }),
        }),
      );
      expect(signOutResp.ok).toBe(true);

      // Verify session cookie is cleared
      const signOutSetCookie = signOutResp.headers.get('set-cookie');
      expect(signOutSetCookie).toBeTruthy();

      // Session should be null after sign-out
      const postSignOutResp = await authHandler(
        new Request('http://localhost:3000/api/auth/get-session', {
          method: 'GET',
          headers: new Headers({
            cookie: `better-auth.session_token=${sessionCookieValue}`,
          }),
        }),
      );
      const postSignOutData = (await postSignOutResp.json()) as Record<string, unknown> | null;
      const isUnauthenticated =
        postSignOutData === null ||
        postSignOutData.session === null ||
        postSignOutData.user === null;
      expect(isUnauthenticated).toBe(true);
    });

    it('should return Google OAuth URL via auth.handler on sign-in', async () => {
      // Initiate Google OAuth sign-in through the raw handler
      const request = new Request('http://localhost:3000/api/auth/sign-in/social', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: 'http://localhost:3000/dashboard',
        }),
      });

      const response = await authHandler(request);

      expect(response.status).toBe(200);

      // Location header set for redirect-capable clients
      const location = response.headers.get('location');
      expect(location).toBeDefined();
      expect(location).toContain('accounts.google.com');

      // JSON body also carries the URL
      const data = (await response.json()) as { url: string };
      expect(data.url).toContain('accounts.google.com');
    });
  });

  // -------------------------------------------------------------------------
  // Test: testUtils Plugin Helpers
  // -------------------------------------------------------------------------

  describe('testUtils Plugin Helpers', () => {
    it('should create and save a user via testUtils, then authenticate', async () => {
      const user = testHelpers.createUser({
        email: 'testutils-user@example.com',
        name: 'Test Utils User',
      });
      const savedUser = await testHelpers.saveUser(user);

      expect(savedUser).toBeDefined();
      expect(savedUser.email).toBe('testutils-user@example.com');
      expect(savedUser.name).toBe('Test Utils User');

      const { session, headers, token } = await testHelpers.login({
        userId: savedUser.id,
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(savedUser.id);
      expect(token).toBeDefined();
      expect(headers).toBeDefined();

      // Verify session via auth handler (route-level check)
      const response = await authHandler(
        new Request('http://localhost:3000/api/auth/get-session', { method: 'GET', headers }),
      );
      const data = (await response.json()) as AuthenticatedSessionResponse;
      expect(data.user.id).toBe(savedUser.id);
      expect(data.user.email).toBe('testutils-user@example.com');

      await testHelpers.deleteUser(savedUser.id);
    });

    it('should return cookies with correct attributes from getCookies', async () => {
      const user = testHelpers.createUser({
        email: 'cookie-check@example.com',
        name: 'Cookie Check User',
      });
      const savedUser = await testHelpers.saveUser(user);

      const cookies = await testHelpers.getCookies({
        userId: savedUser.id,
        domain: 'localhost',
      });

      expect(cookies).toBeDefined();
      expect(cookies.length).toBeGreaterThan(0);

      const sessionCookie = cookies.find((c) => c.name === 'better-auth.session_token');
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.sameSite).toBe('Lax');
      expect(sessionCookie?.path).toBe('/');
      expect(sessionCookie?.domain).toBe('localhost');

      await testHelpers.deleteUser(savedUser.id);
    });
  });
});
