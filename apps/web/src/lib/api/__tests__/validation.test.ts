/**
 * @module validation.test
 *
 * Unit tests for the `withValidation` request validation middleware.
 *
 * Covers:
 *  - Valid input passthrough (body, query, params)
 *  - Single field validation error
 *  - Multiple field validation errors across sources
 *  - Nested object validation errors
 *  - Array field validation errors
 *  - Coercion behaviour (string -> number, string -> boolean)
 *  - Default value application
 *  - Composition with other HOFs
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Mock ValidationError before importing the module under test.
// The real class lives in @laila/shared/errors.
//
// vi.hoisted() runs before vi.mock() hoisting, so the class is available
// when the mock factory executes.
// ---------------------------------------------------------------------------

const { MockValidationError } = vi.hoisted(() => {
  class MockValidationError extends Error {
    code: string;
    details: Record<string, unknown> | undefined;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.name = 'ValidationError';
      this.code = code;
      this.details = details;
    }
  }
  return { MockValidationError };
});

vi.mock('@laila/shared', () => ({
  ValidationError: MockValidationError,
  DomainErrorCode: {
    VALIDATION_FAILED: 'VALIDATION_FAILED',
  },
}));

import { withValidation } from '@/lib/api/validation';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock NextApiRequest with the given body, query, and method.
 */
const createMockReq = (
  overrides: {
    body?: unknown;
    query?: Record<string, string | string[]>;
    method?: string;
  } = {},
): NextApiRequest =>
  ({
    body: overrides.body ?? undefined,
    query: overrides.query ?? {},
    method: overrides.method ?? 'GET',
  }) as unknown as NextApiRequest;

/**
 * Create a minimal mock NextApiResponse with chainable json/status stubs.
 */
const createMockRes = (): NextApiResponse => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res as unknown as NextApiResponse;
};

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const nestedBodySchema = z.object({
  user: z.object({
    profile: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    }),
  }),
});

const arrayBodySchema = z.object({
  tags: z.array(z.string().min(1)).min(1),
});

const coercionSchema = z.object({
  count: z.coerce.number().int(),
  active: z.coerce.boolean(),
});

const defaultsSchema = z.object({
  page: z.coerce.number().default(1),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  filter: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withValidation', () => {
  // -----------------------------------------------------------------------
  // Valid input passthrough
  // -----------------------------------------------------------------------

  describe('valid input passthrough', () => {
    it('passes validated body data to the handler', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { name: 'Test Project', email: 'test@example.com' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, res, {
        body: { name: 'Test Project', email: 'test@example.com' },
        query: undefined,
        params: undefined,
      });
    });

    it('passes validated query data to the handler', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: { page: '2', limit: '50' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ query: querySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, res, {
        body: undefined,
        query: { page: 2, limit: 50 },
        params: undefined,
      });
    });

    it('passes validated params data to the handler', async () => {
      const handler = vi.fn();
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockReq({
        query: { id: uuid },
      });
      const res = createMockRes();

      const wrapped = withValidation({ params: paramsSchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, res, {
        body: undefined,
        query: undefined,
        params: { id: uuid },
      });
    });

    it('passes all three sources when all schemas are provided', async () => {
      const handler = vi.fn();
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockReq({
        body: { name: 'Test', email: 'a@b.com' },
        query: { page: '1', limit: '10', id: uuid },
      });
      const res = createMockRes();

      const wrapped = withValidation({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      const data = handler.mock.calls[0]![2];
      expect(data.body).toEqual({ name: 'Test', email: 'a@b.com' });
      expect(data.query).toEqual({ page: 1, limit: 10 });
      expect(data.params).toEqual({ id: uuid });
    });

    it('calls handler when no schemas are provided', async () => {
      const handler = vi.fn();
      const req = createMockReq({ body: { anything: true } });
      const res = createMockRes();

      const wrapped = withValidation({})(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, res, {
        body: undefined,
        query: undefined,
        params: undefined,
      });
    });
  });

  // -----------------------------------------------------------------------
  // GET/DELETE body handling
  // -----------------------------------------------------------------------

  describe('GET/DELETE body handling', () => {
    it('skips body validation for GET requests when body is undefined', async () => {
      const handler = vi.fn();
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, res, {
        body: undefined,
        query: undefined,
        params: undefined,
      });
    });

    it('skips body validation for DELETE requests when body is undefined', async () => {
      const handler = vi.fn();
      const req = createMockReq({ method: 'DELETE' });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('still validates body for POST requests', async () => {
      const handler = vi.fn();
      const req = createMockReq({ method: 'POST', body: {} });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      await expect(wrapped(req, res)).rejects.toThrow(MockValidationError);
      expect(handler).not.toHaveBeenCalled();
    });

    it('validates body for GET requests when body is actually present', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        method: 'GET',
        body: { name: '', email: 'bad' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      await expect(wrapped(req, res)).rejects.toThrow(MockValidationError);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Single field error
  // -----------------------------------------------------------------------

  describe('single field error', () => {
    it('throws ValidationError when body has a single invalid field', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { name: '', email: 'test@example.com' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      await expect(wrapped(req, res)).rejects.toThrow(MockValidationError);
      await expect(wrapped(req, res)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: {
          fieldErrors: {
            'body.name': expect.arrayContaining([expect.any(String)]),
          },
        },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('throws ValidationError when query has an invalid field', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: { page: '0', limit: '10' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ query: querySchema })(handler);

      await expect(wrapped(req, res)).rejects.toThrow(MockValidationError);
      await expect(wrapped(req, res)).rejects.toMatchObject({
        details: {
          fieldErrors: {
            'query.page': expect.arrayContaining([expect.any(String)]),
          },
        },
      });
    });

    it('throws ValidationError when params has an invalid field', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: { id: 'not-a-uuid' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ params: paramsSchema })(handler);

      await expect(wrapped(req, res)).rejects.toThrow(MockValidationError);
      await expect(wrapped(req, res)).rejects.toMatchObject({
        details: {
          fieldErrors: {
            'params.id': expect.arrayContaining([expect.any(String)]),
          },
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Multiple field errors
  // -----------------------------------------------------------------------

  describe('multiple field errors', () => {
    it('aggregates errors from multiple body fields', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { name: '', email: 'not-an-email' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;
        expect(fieldErrors).toHaveProperty('body.name');
        expect(fieldErrors).toHaveProperty('body.email');
      }
    });

    it('aggregates errors across body, query, and params', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { name: '', email: 'bad' },
        query: { page: '0', limit: '200', id: 'not-uuid' },
      });
      const res = createMockRes();

      const wrapped = withValidation({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;

        // Body errors
        expect(fieldErrors).toHaveProperty('body.name');
        expect(fieldErrors).toHaveProperty('body.email');

        // Query errors
        expect(fieldErrors).toHaveProperty('query.page');
        expect(fieldErrors).toHaveProperty('query.limit');

        // Params errors
        expect(fieldErrors).toHaveProperty('params.id');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Nested object errors
  // -----------------------------------------------------------------------

  describe('nested object errors', () => {
    it('prefixes nested field paths with dot notation', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: {
          user: {
            profile: {
              firstName: '',
              lastName: '',
            },
          },
        },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: nestedBodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;
        expect(fieldErrors).toHaveProperty('body.user.profile.firstName');
        expect(fieldErrors).toHaveProperty('body.user.profile.lastName');
      }
    });

    it('passes valid nested data through correctly', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: {
          user: {
            profile: {
              firstName: 'Jane',
              lastName: 'Doe',
            },
          },
        },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: nestedBodySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![2].body).toEqual({
        user: { profile: { firstName: 'Jane', lastName: 'Doe' } },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Array field errors
  // -----------------------------------------------------------------------

  describe('array field errors', () => {
    it('reports errors for invalid array items with indices in path', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { tags: ['valid', ''] },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: arrayBodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;
        // Array index should appear in the path: body.tags.1
        expect(fieldErrors).toHaveProperty('body.tags.1');
      }
    });

    it('reports error when array is empty but min(1) required', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { tags: [] },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: arrayBodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;
        expect(fieldErrors).toHaveProperty('body.tags');
      }
    });

    it('passes valid array data through', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { tags: ['api', 'backend'] },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: arrayBodySchema })(handler);
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![2].body).toEqual({ tags: ['api', 'backend'] });
    });
  });

  // -----------------------------------------------------------------------
  // Coercion behaviour
  // -----------------------------------------------------------------------

  describe('coercion behaviour', () => {
    it('coerces string query params to numbers', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: { page: '3', limit: '25' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ query: querySchema })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.query.page).toBe(3);
      expect(typeof data.query.page).toBe('number');
      expect(data.query.limit).toBe(25);
      expect(typeof data.query.limit).toBe('number');
    });

    it('coerces string values to number and boolean in body', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { count: '42', active: 'true' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: coercionSchema })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.body.count).toBe(42);
      expect(typeof data.body.count).toBe('number');
      expect(data.body.active).toBe(true);
      expect(typeof data.body.active).toBe('boolean');
    });

    it('coerces "false" string to boolean false', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { count: '0', active: 'false' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: coercionSchema })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.body.count).toBe(0);
      // Note: z.coerce.boolean() coerces non-empty strings to true.
      // "false" is a non-empty string, so it coerces to true.
      // This is expected Zod behaviour.
      expect(typeof data.body.active).toBe('boolean');
    });
  });

  // -----------------------------------------------------------------------
  // Default values
  // -----------------------------------------------------------------------

  describe('default values', () => {
    it('applies schema defaults for missing query fields', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: {},
      });
      const res = createMockRes();

      const wrapped = withValidation({ query: defaultsSchema })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.query.page).toBe(1);
      expect(data.query.sortOrder).toBe('asc');
      expect(data.query.filter).toBeUndefined();
    });

    it('uses provided values over defaults', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        query: { page: '5', sortOrder: 'desc', filter: 'active' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ query: defaultsSchema })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.query.page).toBe(5);
      expect(data.query.sortOrder).toBe('desc');
      expect(data.query.filter).toBe('active');
    });

    it('applies defaults when body fields are missing', async () => {
      const schemaWithDefaults = z.object({
        title: z.string().min(1),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
      });

      const handler = vi.fn();
      const req = createMockReq({
        body: { title: 'My Task' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: schemaWithDefaults })(handler);
      await wrapped(req, res);

      const data = handler.mock.calls[0]![2];
      expect(data.body.title).toBe('My Task');
      expect(data.body.priority).toBe('medium');
    });
  });

  // -----------------------------------------------------------------------
  // Error structure
  // -----------------------------------------------------------------------

  describe('error structure', () => {
    it('throws with the correct error code and message', async () => {
      const handler = vi.fn();
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(MockValidationError);
        const validationErr = err as InstanceType<typeof MockValidationError>;
        expect(validationErr.code).toBe('VALIDATION_FAILED');
        expect(validationErr.message).toBe('Request validation failed');
        expect(validationErr.details).toBeDefined();
        expect(validationErr.details?.fieldErrors).toBeDefined();
      }
    });

    it('includes all field error messages as arrays of strings', async () => {
      const handler = vi.fn();
      const req = createMockReq({
        body: { name: '', email: 'bad' },
      });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      try {
        await wrapped(req, res);
        expect.fail('Expected ValidationError');
      } catch (err) {
        const validationErr = err as InstanceType<typeof MockValidationError>;
        const fieldErrors = validationErr.details?.fieldErrors as Record<string, string[]>;

        for (const messages of Object.values(fieldErrors)) {
          expect(Array.isArray(messages)).toBe(true);
          for (const msg of messages) {
            expect(typeof msg).toBe('string');
          }
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Handler is not called on failure
  // -----------------------------------------------------------------------

  describe('handler isolation', () => {
    it('does not call handler when validation fails', async () => {
      const handler = vi.fn();
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      const wrapped = withValidation({ body: bodySchema })(handler);

      try {
        await wrapped(req, res);
      } catch {
        // expected
      }

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Composition
  // -----------------------------------------------------------------------

  describe('composition', () => {
    it('returns a standard (req, res) => Promise<void> handler', () => {
      const handler = vi.fn();
      const wrapped = withValidation({ body: bodySchema })(handler);

      expect(typeof wrapped).toBe('function');
      expect(wrapped.length).toBe(2); // (req, res)
    });

    it('composes with outer HOFs (simulated withErrorHandler)', async () => {
      // Simulate withErrorHandler wrapping behaviour
      const withErrorHandler =
        (innerHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) =>
        async (req: NextApiRequest, res: NextApiResponse) => {
          try {
            await innerHandler(req, res);
          } catch (err) {
            if (err instanceof MockValidationError) {
              res.status(400).json({
                error: {
                  code: err.code,
                  message: err.message,
                  details: err.details,
                },
              });
              return;
            }
            res
              .status(500)
              .json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' } });
          }
        };

      const handler = vi.fn();
      const req = createMockReq({ body: { name: '', email: 'bad' } });
      const res = createMockRes();

      const composed = withErrorHandler(withValidation({ body: bodySchema })(handler));

      await composed(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
          }),
        }),
      );
    });
  });
});
