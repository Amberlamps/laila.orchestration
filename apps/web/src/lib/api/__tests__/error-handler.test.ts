/**
 * @module error-handler.test
 *
 * Unit tests for the `withErrorHandler` global error handler HOF.
 *
 * Covers:
 *  - Successful handler passthrough (no interference)
 *  - Known AppError subclass mapping (ValidationError, NotFoundError, etc.)
 *  - Unknown error handling (500 with generic message)
 *  - Production vs development error message behavior
 *  - requestId generation (UUID v4) and inclusion in responses
 *  - requestId logging for server-side correlation
 *  - Retry-After header for RateLimitError (429)
 *  - Content-Type header on all error responses
 *  - console.error logging for unknown errors (not swallowed)
 *  - Non-Error thrown values (strings, objects)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock classes for AppError and its subclasses.
// Using vi.hoisted() so these are available in the vi.mock() factory.
// ---------------------------------------------------------------------------

const {
  MockAppError,
  MockValidationError,
  MockNotFoundError,
  MockConflictError,
  MockAuthenticationError,
  MockAuthorizationError,
  MockRateLimitError,
  MockDomainErrorCode,
} = vi.hoisted(() => {
  const MockDomainErrorCode = {
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
    ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  } as const;

  class MockAppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: Record<string, unknown> | undefined;

    constructor(
      statusCode: number,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockValidationError extends MockAppError {
    constructor(
      code: string = MockDomainErrorCode.VALIDATION_FAILED,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(400, code, message, details);
      this.name = 'ValidationError';
    }
  }

  class MockAuthenticationError extends MockAppError {
    constructor(
      code: string = MockDomainErrorCode.AUTH_FAILURE,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(401, code, message, details);
      this.name = 'AuthenticationError';
    }
  }

  class MockAuthorizationError extends MockAppError {
    constructor(
      code: string = MockDomainErrorCode.INSUFFICIENT_PERMISSIONS,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(403, code, message, details);
      this.name = 'AuthorizationError';
    }
  }

  class MockNotFoundError extends MockAppError {
    constructor(
      code: string = MockDomainErrorCode.RESOURCE_NOT_FOUND,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(404, code, message, details);
      this.name = 'NotFoundError';
    }
  }

  class MockConflictError extends MockAppError {
    constructor(
      code: string = MockDomainErrorCode.ASSIGNMENT_CONFLICT,
      message: string,
      details?: Record<string, unknown>,
    ) {
      super(409, code, message, details);
      this.name = 'ConflictError';
    }
  }

  class MockRateLimitError extends MockAppError {
    readonly retryAfterSeconds: number;

    constructor(message: string, retryAfterSeconds: number) {
      super(429, MockDomainErrorCode.RATE_LIMIT_EXCEEDED, message, { retryAfterSeconds });
      this.name = 'RateLimitError';
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  return {
    MockAppError,
    MockValidationError,
    MockNotFoundError,
    MockConflictError,
    MockAuthenticationError,
    MockAuthorizationError,
    MockRateLimitError,
    MockDomainErrorCode,
  };
});

vi.mock('@laila/shared', () => ({
  AppError: MockAppError,
  DomainErrorCode: MockDomainErrorCode,
  ValidationError: MockValidationError,
  AuthenticationError: MockAuthenticationError,
  AuthorizationError: MockAuthorizationError,
  NotFoundError: MockNotFoundError,
  ConflictError: MockConflictError,
  RateLimitError: MockRateLimitError,
}));

import { withErrorHandler } from '@/lib/api/error-handler';

import type { ErrorResponse } from '@/lib/api/error-handler';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UUID v4 regex pattern for validating requestId format. */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock NextApiRequest.
 */
const createMockReq = (
  overrides: {
    method?: string;
    url?: string;
    body?: unknown;
    query?: Record<string, string | string[]>;
  } = {},
): NextApiRequest =>
  ({
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/test',
    body: overrides.body ?? undefined,
    query: overrides.query ?? {},
  }) as unknown as NextApiRequest;

/**
 * Create a minimal mock NextApiResponse with chainable stubs.
 */
const createMockRes = (): NextApiResponse => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res as unknown as NextApiResponse;
};

/**
 * Extract the ErrorResponse from a mock response's json call.
 * Assumes at least one call to res.json() has been made.
 */
const getJsonArg = (res: NextApiResponse): ErrorResponse => {
  const calls = (res.json as ReturnType<typeof vi.fn>).mock.calls;
  return calls[0]![0] as ErrorResponse;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withErrorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // Successful handler passthrough
  // -----------------------------------------------------------------------

  describe('successful handler passthrough', () => {
    it('does not interfere with a successful response', async () => {
      const handler = vi.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.status(200).json({ data: 'ok' });
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: 'ok' });
    });

    it('does not set Content-Type header on successful responses', async () => {
      const handler = vi.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.status(200).json({ data: 'ok' });
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      // The error handler should not call setHeader on success
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('does not log anything on successful responses', async () => {
      const handler = vi.fn(async () => undefined);
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Known AppError subclass handling
  // -----------------------------------------------------------------------

  describe('known AppError handling', () => {
    it('maps ValidationError to 400 with correct envelope', async () => {
      const handler = vi.fn(async () => {
        throw new MockValidationError(MockDomainErrorCode.VALIDATION_FAILED, 'Name is required', {
          fieldErrors: { 'body.name': ['Required'] },
        });
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('VALIDATION_FAILED');
      expect(jsonArg.error.message).toBe('Name is required');
      expect(jsonArg.error.details).toEqual({ fieldErrors: { 'body.name': ['Required'] } });
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('maps AuthenticationError to 401', async () => {
      const handler = vi.fn(async () => {
        throw new MockAuthenticationError(MockDomainErrorCode.AUTH_FAILURE, 'Invalid credentials');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('AUTH_FAILURE');
      expect(jsonArg.error.message).toBe('Invalid credentials');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('maps AuthorizationError to 403', async () => {
      const handler = vi.fn(async () => {
        throw new MockAuthorizationError(
          MockDomainErrorCode.INSUFFICIENT_PERMISSIONS,
          'Not allowed',
        );
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(jsonArg.error.message).toBe('Not allowed');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('maps NotFoundError to 404 with specific domain code', async () => {
      const handler = vi.fn(async () => {
        throw new MockNotFoundError(MockDomainErrorCode.PROJECT_NOT_FOUND, 'Project not found');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('PROJECT_NOT_FOUND');
      expect(jsonArg.error.message).toBe('Project not found');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('maps ConflictError to 409', async () => {
      const handler = vi.fn(async () => {
        throw new MockConflictError(
          MockDomainErrorCode.ASSIGNMENT_CONFLICT,
          'Worker already assigned',
          { workerId: 'w-123' },
        );
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('ASSIGNMENT_CONFLICT');
      expect(jsonArg.error.message).toBe('Worker already assigned');
      expect(jsonArg.error.details).toEqual({ workerId: 'w-123' });
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('does not include details when AppError has no details', async () => {
      const handler = vi.fn(async () => {
        throw new MockNotFoundError(MockDomainErrorCode.RESOURCE_NOT_FOUND, 'Resource not found');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error).not.toHaveProperty('details');
    });

    it('does not log known AppError instances via console.error', async () => {
      const handler = vi.fn(async () => {
        throw new MockValidationError(MockDomainErrorCode.VALIDATION_FAILED, 'Invalid');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // RateLimitError and Retry-After header
  // -----------------------------------------------------------------------

  describe('RateLimitError handling', () => {
    it('maps RateLimitError to 429 with Retry-After header', async () => {
      const handler = vi.fn(async () => {
        throw new MockRateLimitError('Too many requests', 60);
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(jsonArg.error.message).toBe('Too many requests');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('sets Retry-After header with correct seconds value', async () => {
      const handler = vi.fn(async () => {
        throw new MockRateLimitError('Slow down', 120);
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    });
  });

  // -----------------------------------------------------------------------
  // Unknown error handling
  // -----------------------------------------------------------------------

  describe('unknown error handling', () => {
    it('returns 500 with INTERNAL_ERROR for plain Error', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Database connection failed');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('INTERNAL_ERROR');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 500 for a thrown string value', async () => {
      const handler = vi.fn(async () => {
        throw 'something went wrong'; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('INTERNAL_ERROR');
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 500 for a thrown object value', async () => {
      const handler = vi.fn(async () => {
        throw { weird: 'object' }; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('INTERNAL_ERROR');
    });

    it('logs unknown errors via console.error with structured context', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Unexpected failure');
      });
      const req = createMockReq({ method: 'POST', url: '/api/projects' });
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[API Error]',
        expect.objectContaining({
          requestId: expect.stringMatching(UUID_V4_REGEX),
          method: 'POST',
          url: '/api/projects',
          error: expect.stringContaining('Unexpected failure'),
        }),
      );
    });

    it('logs non-Error thrown values as stringified output', async () => {
      const handler = vi.fn(async () => {
        throw 'raw string error'; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[API Error]',
        expect.objectContaining({
          error: 'raw string error',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Production vs development behavior
  // -----------------------------------------------------------------------

  describe('production vs development error messages', () => {
    it('returns generic message in production for unknown errors', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const handler = vi.fn(async () => {
        throw new Error('Sensitive database info leaked');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.message).toBe('An internal server error occurred');
      expect(jsonArg.error.message).not.toContain('Sensitive');
    });

    it('includes original error message in development for unknown Error', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const handler = vi.fn(async () => {
        throw new Error('Database connection refused on port 5432');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.message).toBe('Database connection refused on port 5432');
    });

    it('returns generic message in development for non-Error thrown values', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const handler = vi.fn(async () => {
        throw 42; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.message).toBe('An internal server error occurred');
    });

    it('never includes stack traces in production AppError responses', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const handler = vi.fn(async () => {
        throw new MockValidationError(MockDomainErrorCode.VALIDATION_FAILED, 'Invalid input');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      const jsonString = JSON.stringify(jsonArg);
      expect(jsonString).not.toContain('stack');
      expect(jsonString).not.toContain('at ');
    });
  });

  // -----------------------------------------------------------------------
  // requestId
  // -----------------------------------------------------------------------

  describe('requestId', () => {
    it('generates a UUID v4 requestId for error responses', async () => {
      const handler = vi.fn(async () => {
        throw new MockNotFoundError(MockDomainErrorCode.RESOURCE_NOT_FOUND, 'Not found');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('includes requestId in error response for unknown errors', async () => {
      const handler = vi.fn(async () => {
        throw new Error('boom');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('includes the same requestId in both log and response for correlation', async () => {
      const handler = vi.fn(async () => {
        throw new Error('correlate me');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      // Extract requestId from the response
      const jsonArg = getJsonArg(res);
      const responseRequestId = jsonArg.error.requestId;

      // Extract requestId from the log
      const logCallArgs = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
      const logRequestId = logCallArgs[1].requestId;

      // They must match for correlation
      expect(responseRequestId).toBe(logRequestId);
      expect(responseRequestId).toMatch(UUID_V4_REGEX);
    });
  });

  // -----------------------------------------------------------------------
  // Content-Type header
  // -----------------------------------------------------------------------

  describe('Content-Type header', () => {
    it('sets Content-Type to application/json for known errors', async () => {
      const handler = vi.fn(async () => {
        throw new MockValidationError(MockDomainErrorCode.VALIDATION_FAILED, 'Bad input');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('sets Content-Type to application/json for unknown errors', async () => {
      const handler = vi.fn(async () => {
        throw new Error('unexpected');
      });
      const req = createMockReq();
      const res = createMockRes();

      const wrapped = withErrorHandler(handler);
      await wrapped(req, res);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
  });

  // -----------------------------------------------------------------------
  // Composition compatibility
  // -----------------------------------------------------------------------

  describe('composition', () => {
    it('returns a standard (req, res) => Promise<void> handler', () => {
      const handler = vi.fn(async () => undefined);
      const wrapped = withErrorHandler(handler);

      expect(typeof wrapped).toBe('function');
      expect(wrapped.length).toBe(2); // (req, res)
    });

    it('catches errors from inner middleware (simulated withValidation)', async () => {
      // Simulate withValidation throwing a ValidationError
      const innerHandler = vi.fn(async () => {
        throw new MockValidationError(
          MockDomainErrorCode.VALIDATION_FAILED,
          'Request validation failed',
          { fieldErrors: { 'body.name': ['Required'] } },
        );
      });

      const req = createMockReq();
      const res = createMockRes();

      const composed = withErrorHandler(innerHandler);
      await composed(req, res);

      // The error should be caught and serialized, NOT thrown
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('VALIDATION_FAILED');
      expect(jsonArg.error.message).toBe('Request validation failed');
      expect(jsonArg.error.details).toEqual({ fieldErrors: { 'body.name': ['Required'] } });
    });

    it('catches errors from inner auth middleware (simulated withAuth)', async () => {
      // Simulate withAuth throwing an AuthenticationError
      const innerHandler = vi.fn(async () => {
        throw new MockAuthenticationError(MockDomainErrorCode.AUTH_FAILURE, 'Session expired');
      });

      const req = createMockReq();
      const res = createMockRes();

      const composed = withErrorHandler(innerHandler);
      await composed(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      const jsonArg = getJsonArg(res);
      expect(jsonArg.error.code).toBe('AUTH_FAILURE');
      expect(jsonArg.error.message).toBe('Session expired');
    });
  });
});
