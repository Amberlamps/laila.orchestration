/**
 * Integration tests for the withAuth higher-order function.
 *
 * Validates session auth, API key auth, type enforcement, and rejection
 * scenarios. Mocks Better Auth's `auth.api.getSession()` and the
 * `validateApiKey()` function to control authentication outcomes without
 * requiring a real database or session store.
 *
 * Test groups:
 * - human auth (session cookie): session succeeds, API key rejected (403),
 *   no credentials (401), expired session (401)
 * - agent auth (API key): API key succeeds, session rejected (403),
 *   invalid key (401)
 * - both auth types: session accepted, API key accepted, session preferred
 *   when both credentials are present
 *
 * Note: Types are defined locally to avoid importing from modules with
 * unresolvable transitive dependencies (drizzle-orm). The locally defined
 * types mirror the production types from with-auth.ts and api-key-validator.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Local type definitions
//
// These mirror the production types to avoid importing from modules whose
// transitive dependencies (drizzle-orm) cannot be resolved in the test
// environment. The acceptance criteria require no `any` types.
// ---------------------------------------------------------------------------

/** Mirrors HumanAuthContext from with-auth.ts */
interface HumanAuthContext {
  type: 'human';
  userId: string;
  email: string;
  name: string;
  image: string | null;
  tenantId: string;
}

/** Mirrors WorkerAuthContext from api-key-validator.ts */
interface WorkerAuthContext {
  type: 'agent';
  workerId: string;
  workerName: string;
  tenantId: string;
  projectAccess: string[];
}

/** Union of auth context types. */
type AuthContext = HumanAuthContext | WorkerAuthContext;

/** Mirrors AuthenticatedRequest from with-auth.ts */
interface AuthenticatedRequest extends NextApiRequest {
  auth: AuthContext;
}

/** Shape of a Better Auth session object returned by auth.api.getSession. */
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

/** Tracking object for NextApiResponse mock. */
interface MockResponseTracker {
  statusCode: number | null;
  jsonBody: unknown;
  statusFn: ReturnType<typeof vi.fn<(code: number) => void>>;
  jsonFn: ReturnType<typeof vi.fn<(body: unknown) => void>>;
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

/** Handler function signature matching AuthenticatedHandler from with-auth.ts */
type HandlerFn = (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void;

/** Mock for auth.api.getSession -- controls session resolution. */
const mockGetSession =
  vi.fn<(params: { headers: Record<string, string> }) => Promise<MockSession | null>>();

/** Mock for validateApiKey -- controls API key resolution. */
const mockValidateApiKey = vi.fn<(req: NextApiRequest) => Promise<WorkerAuthContext | null>>();

// Mock Better Auth so withAuth uses our controlled getSession.
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: [{ headers: Record<string, string> }]) => mockGetSession(...args),
    },
  },
}));

// Mock the api-key-validator module so withAuth uses our controlled validateApiKey.
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: (...args: [NextApiRequest]) => mockValidateApiKey(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a typed mock NextApiRequest with optional headers. */
const createMockRequest = (
  headers: Record<string, string | string[] | undefined> = {},
): NextApiRequest => {
  return {
    headers,
  } as unknown as NextApiRequest;
};

/** Create a tracked mock NextApiResponse for assertion. */
const createMockResponse = (): { res: NextApiResponse; tracker: MockResponseTracker } => {
  const tracker: MockResponseTracker = {
    statusCode: null,
    jsonBody: undefined,
    statusFn: vi.fn<(code: number) => void>(),
    jsonFn: vi.fn<(body: unknown) => void>(),
  };

  const res = {
    status: (code: number) => {
      tracker.statusCode = code;
      tracker.statusFn(code);
      return res;
    },
    json: (body: unknown) => {
      tracker.jsonBody = body;
      tracker.jsonFn(body);
      return res;
    },
  } as unknown as NextApiResponse;

  return { res, tracker };
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

/** Factory for a valid WorkerAuthContext. */
const createMockWorkerContext = (
  overrides: Partial<WorkerAuthContext> = {},
): WorkerAuthContext => ({
  type: 'agent',
  workerId: 'worker-uuid-001',
  workerName: 'Test Worker',
  tenantId: 'tenant-uuid-001',
  projectAccess: ['project-uuid-001', 'project-uuid-002'],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import withAuth AFTER mocks are set up (vitest hoists vi.mock calls).
const { withAuth } = await import('@/lib/middleware/with-auth');

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no session, no API key
    mockGetSession.mockResolvedValue(null);
    mockValidateApiKey.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // human auth (session cookie)
  // -------------------------------------------------------------------------

  describe('human auth (session cookie)', () => {
    it('should resolve session and inject HumanAuthContext', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ cookie: 'better-auth.session_token=valid-token' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledTimes(1);

      const receivedReq = handler.mock.calls[0]![0];
      const authContext = receivedReq.auth as HumanAuthContext;

      expect(authContext.type).toBe('human');
      expect(authContext.userId).toBe('user-uuid-001');
      expect(authContext.email).toBe('jane@example.com');
      expect(authContext.name).toBe('Jane Doe');
      expect(authContext.image).toBe('https://example.com/avatar.jpg');
      expect(authContext.tenantId).toBe('user-uuid-001');
    });

    it('should set tenantId equal to userId for human auth', async () => {
      const session = createMockSession({ id: 'custom-user-id' });
      mockGetSession.mockResolvedValue(session);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ cookie: 'session=abc' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      const receivedReq = handler.mock.calls[0]![0];
      const authContext = receivedReq.auth as HumanAuthContext;

      expect(authContext.tenantId).toBe(authContext.userId);
      expect(authContext.tenantId).toBe('custom-user-id');
    });

    it('should handle null image in session user', async () => {
      const session = createMockSession({ image: null });
      mockGetSession.mockResolvedValue(session);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ cookie: 'session=abc' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      const receivedReq = handler.mock.calls[0]![0];
      const authContext = receivedReq.auth as HumanAuthContext;

      expect(authContext.image).toBeNull();
    });

    it('should reject API key on a human-only route with 403', async () => {
      // Session auth fails, API key succeeds
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(createMockWorkerContext());

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ authorization: 'Bearer lw_valid_api_key' });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(403);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Invalid credential type for this endpoint');
    });

    it('should return 401 for request with no credentials', async () => {
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(null);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest();
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(401);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('should return 401 for expired session cookie', async () => {
      // Better Auth returns null for expired sessions
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(null);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ cookie: 'better-auth.session_token=expired-token' });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(401);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });
  });

  // -------------------------------------------------------------------------
  // agent auth (API key)
  // -------------------------------------------------------------------------

  describe('agent auth (API key)', () => {
    it('should validate API key and inject WorkerAuthContext', async () => {
      const workerContext = createMockWorkerContext();
      mockValidateApiKey.mockResolvedValue(workerContext);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('agent', handler);

      const req = createMockRequest({ authorization: 'Bearer lw_valid_api_key_hex' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledTimes(1);

      const receivedReq = handler.mock.calls[0]![0];
      const authContext = receivedReq.auth as WorkerAuthContext;

      expect(authContext.type).toBe('agent');
      expect(authContext.workerId).toBe('worker-uuid-001');
      expect(authContext.workerName).toBe('Test Worker');
      expect(authContext.tenantId).toBe('tenant-uuid-001');
      expect(authContext.projectAccess).toEqual(['project-uuid-001', 'project-uuid-002']);
    });

    it('should reject session cookie on an agent-only route with 403', async () => {
      // Session auth succeeds, no API key
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);
      mockValidateApiKey.mockResolvedValue(null);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('agent', handler);

      const req = createMockRequest({ cookie: 'better-auth.session_token=valid-token' });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(403);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Invalid credential type for this endpoint');
    });

    it('should return 401 for invalid API key', async () => {
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(null);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('agent', handler);

      const req = createMockRequest({ authorization: 'Bearer lw_invalid_key' });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(401);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });
  });

  // -------------------------------------------------------------------------
  // both auth types
  // -------------------------------------------------------------------------

  describe('both auth types', () => {
    it('should accept session cookie auth', async () => {
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('both', handler);

      const req = createMockRequest({ cookie: 'better-auth.session_token=valid-token' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledTimes(1);

      const receivedReq = handler.mock.calls[0]![0];
      expect(receivedReq.auth.type).toBe('human');
    });

    it('should accept API key auth', async () => {
      const workerContext = createMockWorkerContext();
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(workerContext);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('both', handler);

      const req = createMockRequest({ authorization: 'Bearer lw_valid_api_key_hex' });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledTimes(1);

      const receivedReq = handler.mock.calls[0]![0];
      expect(receivedReq.auth.type).toBe('agent');
    });

    it('should prefer session auth when both credentials are present', async () => {
      // Both session and API key are valid
      const session = createMockSession();
      mockGetSession.mockResolvedValue(session);
      const workerContext = createMockWorkerContext();
      mockValidateApiKey.mockResolvedValue(workerContext);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('both', handler);

      const req = createMockRequest({
        cookie: 'better-auth.session_token=valid-token',
        authorization: 'Bearer lw_valid_api_key_hex',
      });
      const { res } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledTimes(1);

      // Session takes priority -- auth context should be HumanAuthContext
      const receivedReq = handler.mock.calls[0]![0];
      const authContext = receivedReq.auth as HumanAuthContext;

      expect(authContext.type).toBe('human');
      expect(authContext.userId).toBe('user-uuid-001');
      expect(authContext.email).toBe('jane@example.com');

      // validateApiKey should NOT have been called because session succeeded first
      expect(mockValidateApiKey).not.toHaveBeenCalled();
    });

    it('should return 401 when both credentials are invalid', async () => {
      mockGetSession.mockResolvedValue(null);
      mockValidateApiKey.mockResolvedValue(null);

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('both', handler);

      const req = createMockRequest({
        cookie: 'better-auth.session_token=expired-token',
        authorization: 'Bearer lw_invalid_key',
      });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(tracker.statusCode).toBe(401);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // -------------------------------------------------------------------------
  // Error response format validation
  // -------------------------------------------------------------------------

  describe('error response format', () => {
    it('should return 401 with standard error format { error: { code, message } }', async () => {
      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest();
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    });

    it('should return 403 with standard error format { error: { code, message } }', async () => {
      mockValidateApiKey.mockResolvedValue(createMockWorkerContext());

      const handler = vi.fn<HandlerFn>();
      const wrappedHandler = withAuth('human', handler);

      const req = createMockRequest({ authorization: 'Bearer lw_valid' });
      const { res, tracker } = createMockResponse();

      await wrappedHandler(req, res);

      const body = tracker.jsonBody as { error: { code: string; message: string } };
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    });
  });
});
