// Mocked Google OAuth flow for E2E tests. Intercepts Better Auth's
// OAuth endpoints and creates a test session without hitting Google.
import { http, HttpResponse, type HttpHandler } from 'msw';

/** Test user profile used across all authenticated E2E tests. */
export const TEST_USER = {
  id: 'test-user-001',
  name: 'E2E Test User',
  email: 'e2e-test@laila.works',
  image: 'https://example.com/avatar.png',
} as const;

/** Test session returned by the mocked auth endpoints. */
export const TEST_SESSION = {
  user: TEST_USER,
  session: {
    id: 'test-session-001',
    userId: TEST_USER.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    token: 'mock-jwt-token-for-e2e-tests',
  },
} as const;

/**
 * MSW handlers that mock the Better Auth Google OAuth flow.
 * These handlers intercept:
 * 1. The OAuth initiation redirect (GET /api/auth/signin/google)
 * 2. The OAuth callback (GET /api/auth/callback/google)
 * 3. The session endpoint (GET /api/auth/get-session)
 * 4. The sign-out endpoint (POST /api/auth/sign-out)
 */
export const authHandlers: HttpHandler[] = [
  // Intercept the OAuth initiation. Instead of redirecting to Google,
  // immediately redirect to the callback with a mock code.
  http.get('/api/auth/signin/google', () => {
    return new HttpResponse(null, {
      status: 302,
      headers: {
        location: '/api/auth/callback/google?code=mock-auth-code&state=mock-state',
      },
    });
  }),

  // Intercept the OAuth callback. Instead of exchanging the code with
  // Google, create a test session directly and redirect to dashboard.
  http.get('/api/auth/callback/google', () => {
    return new HttpResponse(null, {
      status: 302,
      headers: {
        location: '/dashboard',
        'Set-Cookie': [
          `better-auth.session_token=${TEST_SESSION.session.token}; Path=/; HttpOnly; SameSite=Lax`,
          `better-auth.session_data=${encodeURIComponent(JSON.stringify(TEST_SESSION))}; Path=/; HttpOnly; SameSite=Lax`,
        ].join(', '),
      },
    });
  }),

  // Return the current test session for session checks.
  http.get('/api/auth/get-session', () => {
    return HttpResponse.json(TEST_SESSION);
  }),

  // Handle sign-out by clearing the session.
  http.post('/api/auth/sign-out', () => {
    return HttpResponse.json(
      { success: true },
      {
        headers: {
          'Set-Cookie': 'better-auth.session_token=; Path=/; HttpOnly; Max-Age=0',
        },
      },
    );
  }),
];

/** Handler that simulates an expired session (returns 401). */
export const expiredSessionHandler: HttpHandler = http.get('/api/auth/get-session', () => {
  return new HttpResponse(null, { status: 401 });
});

/** Handler that simulates an OAuth failure (error redirect). */
export const oauthFailureHandler: HttpHandler = http.get('/api/auth/callback/google', () => {
  return new HttpResponse(null, {
    status: 302,
    headers: {
      location: '/sign-in?error=OAuthCallbackError&error_description=Authentication+failed',
    },
  });
});
