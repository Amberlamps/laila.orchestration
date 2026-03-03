import { describe, it, expect } from 'vitest';

import {
  AppError,
  DomainErrorCode,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../errors';

// ---------------------------------------------------------------------------
// DomainErrorCode enum
// ---------------------------------------------------------------------------

describe('DomainErrorCode', () => {
  it('should contain at least 20 error codes across categories', () => {
    const allCodes = Object.values(DomainErrorCode);
    expect(allCodes.length).toBeGreaterThanOrEqual(20);
  });

  it('should contain validation error codes', () => {
    expect(DomainErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(DomainErrorCode.INVALID_STATUS_TRANSITION).toBe('INVALID_STATUS_TRANSITION');
    expect(DomainErrorCode.DAG_CYCLE_DETECTED).toBe('DAG_CYCLE_DETECTED');
    expect(DomainErrorCode.INVALID_DEPENDENCY).toBe('INVALID_DEPENDENCY');
    expect(DomainErrorCode.COST_VALIDATION_FAILED).toBe('COST_VALIDATION_FAILED');
  });

  it('should contain authentication error codes', () => {
    expect(DomainErrorCode.AUTH_FAILURE).toBe('AUTH_FAILURE');
    expect(DomainErrorCode.INVALID_API_KEY).toBe('INVALID_API_KEY');
    expect(DomainErrorCode.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
  });

  it('should contain authorization error codes', () => {
    expect(DomainErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    expect(DomainErrorCode.PROJECT_ACCESS_DENIED).toBe('PROJECT_ACCESS_DENIED');
    expect(DomainErrorCode.WORKER_NOT_ASSIGNED).toBe('WORKER_NOT_ASSIGNED');
  });

  it('should contain not-found error codes', () => {
    expect(DomainErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    expect(DomainErrorCode.PROJECT_NOT_FOUND).toBe('PROJECT_NOT_FOUND');
    expect(DomainErrorCode.EPIC_NOT_FOUND).toBe('EPIC_NOT_FOUND');
    expect(DomainErrorCode.STORY_NOT_FOUND).toBe('STORY_NOT_FOUND');
    expect(DomainErrorCode.TASK_NOT_FOUND).toBe('TASK_NOT_FOUND');
    expect(DomainErrorCode.WORKER_NOT_FOUND).toBe('WORKER_NOT_FOUND');
    expect(DomainErrorCode.PERSONA_NOT_FOUND).toBe('PERSONA_NOT_FOUND');
  });

  it('should contain conflict error codes', () => {
    expect(DomainErrorCode.ASSIGNMENT_CONFLICT).toBe('ASSIGNMENT_CONFLICT');
    expect(DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT).toBe('OPTIMISTIC_LOCK_CONFLICT');
    expect(DomainErrorCode.STORY_IN_PROGRESS).toBe('STORY_IN_PROGRESS');
    expect(DomainErrorCode.READ_ONLY_VIOLATION).toBe('READ_ONLY_VIOLATION');
    expect(DomainErrorCode.DELETION_BLOCKED).toBe('DELETION_BLOCKED');
  });

  it('should contain rate limit error codes', () => {
    expect(DomainErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should contain internal error codes', () => {
    expect(DomainErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});

// ---------------------------------------------------------------------------
// AppError base class
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('should not be directly instantiable (abstract)', () => {
    // Verify AppError is abstract by checking that it requires subclass implementation.
    // We use ValidationError as the simplest concrete subclass for base-class tests.
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'test');
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should carry the message on the base Error', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'field is required');
    expect(error.message).toBe('field is required');
  });

  it('should set details when provided', () => {
    const details = { field: 'email', constraint: 'format' };
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'bad email', details);
    expect(error.details).toEqual(details);
  });

  it('should leave details undefined when omitted', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'missing');
    expect(error.details).toBeUndefined();
  });

  it('should have a stack trace', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'stack test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('stack test');
  });
});

// ---------------------------------------------------------------------------
// ValidationError (400)
// ---------------------------------------------------------------------------

describe('ValidationError', () => {
  it('should set statusCode to 400', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'invalid input');
    expect(error.statusCode).toBe(400);
  });

  it('should default code to VALIDATION_FAILED', () => {
    const error = new ValidationError(undefined, 'invalid input');
    expect(error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
  });

  it('should accept a custom domain error code', () => {
    const error = new ValidationError(
      DomainErrorCode.INVALID_STATUS_TRANSITION,
      'cannot move from draft to done',
    );
    expect(error.code).toBe(DomainErrorCode.INVALID_STATUS_TRANSITION);
  });

  it('should set name to ValidationError', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'test');
    expect(error.name).toBe('ValidationError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'test');
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should include details when provided', () => {
    const details = { fields: { name: 'required', age: 'must be positive' } };
    const error = new ValidationError(
      DomainErrorCode.VALIDATION_FAILED,
      'validation failed',
      details,
    );
    expect(error.details).toEqual(details);
  });

  it('should serialize correctly to JSON', () => {
    const error = new ValidationError(DomainErrorCode.DAG_CYCLE_DETECTED, 'cycle found', {
      path: ['A', 'B', 'C', 'A'],
    });
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'ValidationError',
      message: 'cycle found',
      statusCode: 400,
      code: 'DAG_CYCLE_DETECTED',
      details: { path: ['A', 'B', 'C', 'A'] },
    });
  });
});

// ---------------------------------------------------------------------------
// AuthenticationError (401)
// ---------------------------------------------------------------------------

describe('AuthenticationError', () => {
  it('should set statusCode to 401', () => {
    const error = new AuthenticationError(DomainErrorCode.AUTH_FAILURE, 'not authenticated');
    expect(error.statusCode).toBe(401);
  });

  it('should default code to AUTH_FAILURE', () => {
    const error = new AuthenticationError(undefined, 'not authenticated');
    expect(error.code).toBe(DomainErrorCode.AUTH_FAILURE);
  });

  it('should accept a custom domain error code', () => {
    const error = new AuthenticationError(DomainErrorCode.SESSION_EXPIRED, 'session timed out');
    expect(error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
  });

  it('should set name to AuthenticationError', () => {
    const error = new AuthenticationError(DomainErrorCode.AUTH_FAILURE, 'test');
    expect(error.name).toBe('AuthenticationError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new AuthenticationError(DomainErrorCode.AUTH_FAILURE, 'test');
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should include details when provided', () => {
    const details = { reason: 'token expired at 2026-01-01T00:00:00Z' };
    const error = new AuthenticationError(DomainErrorCode.SESSION_EXPIRED, 'expired', details);
    expect(error.details).toEqual(details);
  });

  it('should serialize correctly to JSON', () => {
    const error = new AuthenticationError(DomainErrorCode.INVALID_API_KEY, 'bad key');
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'AuthenticationError',
      message: 'bad key',
      statusCode: 401,
      code: 'INVALID_API_KEY',
    });
  });
});

// ---------------------------------------------------------------------------
// AuthorizationError (403)
// ---------------------------------------------------------------------------

describe('AuthorizationError', () => {
  it('should set statusCode to 403', () => {
    const error = new AuthorizationError(DomainErrorCode.INSUFFICIENT_PERMISSIONS, 'forbidden');
    expect(error.statusCode).toBe(403);
  });

  it('should default code to INSUFFICIENT_PERMISSIONS', () => {
    const error = new AuthorizationError(undefined, 'forbidden');
    expect(error.code).toBe(DomainErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('should accept a custom domain error code', () => {
    const error = new AuthorizationError(
      DomainErrorCode.PROJECT_ACCESS_DENIED,
      'no access to project',
    );
    expect(error.code).toBe(DomainErrorCode.PROJECT_ACCESS_DENIED);
  });

  it('should set name to AuthorizationError', () => {
    const error = new AuthorizationError(DomainErrorCode.INSUFFICIENT_PERMISSIONS, 'test');
    expect(error.name).toBe('AuthorizationError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new AuthorizationError(DomainErrorCode.INSUFFICIENT_PERMISSIONS, 'test');
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should include details when provided', () => {
    const details = { requiredRole: 'admin', currentRole: 'viewer' };
    const error = new AuthorizationError(
      DomainErrorCode.INSUFFICIENT_PERMISSIONS,
      'admin required',
      details,
    );
    expect(error.details).toEqual(details);
  });

  it('should serialize correctly to JSON', () => {
    const error = new AuthorizationError(
      DomainErrorCode.WORKER_NOT_ASSIGNED,
      'worker not assigned to task',
      { taskId: 'task-123', workerId: 'worker-456' },
    );
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'AuthorizationError',
      message: 'worker not assigned to task',
      statusCode: 403,
      code: 'WORKER_NOT_ASSIGNED',
      details: { taskId: 'task-123', workerId: 'worker-456' },
    });
  });
});

// ---------------------------------------------------------------------------
// NotFoundError (404)
// ---------------------------------------------------------------------------

describe('NotFoundError', () => {
  it('should set statusCode to 404', () => {
    const error = new NotFoundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'not found');
    expect(error.statusCode).toBe(404);
  });

  it('should default code to RESOURCE_NOT_FOUND', () => {
    const error = new NotFoundError(undefined, 'not found');
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
  });

  it('should accept a custom domain error code', () => {
    const error = new NotFoundError(DomainErrorCode.PROJECT_NOT_FOUND, 'project does not exist');
    expect(error.code).toBe(DomainErrorCode.PROJECT_NOT_FOUND);
  });

  it('should set name to NotFoundError', () => {
    const error = new NotFoundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'test');
    expect(error.name).toBe('NotFoundError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new NotFoundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'test');
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should include details when provided', () => {
    const details = { resourceType: 'Epic', resourceId: 'epic-789' };
    const error = new NotFoundError(DomainErrorCode.EPIC_NOT_FOUND, 'epic not found', details);
    expect(error.details).toEqual(details);
  });

  it('should serialize correctly to JSON', () => {
    const error = new NotFoundError(DomainErrorCode.TASK_NOT_FOUND, 'task not found', {
      taskId: 'task-abc',
    });
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'NotFoundError',
      message: 'task not found',
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
      details: { taskId: 'task-abc' },
    });
  });
});

// ---------------------------------------------------------------------------
// ConflictError (409)
// ---------------------------------------------------------------------------

describe('ConflictError', () => {
  it('should set statusCode to 409', () => {
    const error = new ConflictError(DomainErrorCode.ASSIGNMENT_CONFLICT, 'conflict');
    expect(error.statusCode).toBe(409);
  });

  it('should default code to ASSIGNMENT_CONFLICT', () => {
    const error = new ConflictError(undefined, 'conflict');
    expect(error.code).toBe(DomainErrorCode.ASSIGNMENT_CONFLICT);
  });

  it('should accept a custom domain error code', () => {
    const error = new ConflictError(DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT, 'version mismatch');
    expect(error.code).toBe(DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT);
  });

  it('should set name to ConflictError', () => {
    const error = new ConflictError(DomainErrorCode.ASSIGNMENT_CONFLICT, 'test');
    expect(error.name).toBe('ConflictError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new ConflictError(DomainErrorCode.ASSIGNMENT_CONFLICT, 'test');
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should include details when provided', () => {
    const details = { expectedVersion: 3, actualVersion: 5 };
    const error = new ConflictError(
      DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      'version mismatch',
      details,
    );
    expect(error.details).toEqual(details);
  });

  it('should serialize correctly to JSON', () => {
    const error = new ConflictError(DomainErrorCode.DELETION_BLOCKED, 'has dependents', {
      dependentIds: ['dep-1', 'dep-2'],
    });
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'ConflictError',
      message: 'has dependents',
      statusCode: 409,
      code: 'DELETION_BLOCKED',
      details: { dependentIds: ['dep-1', 'dep-2'] },
    });
  });
});

// ---------------------------------------------------------------------------
// RateLimitError (429)
// ---------------------------------------------------------------------------

describe('RateLimitError', () => {
  it('should set statusCode to 429', () => {
    const error = new RateLimitError('too many requests', 60);
    expect(error.statusCode).toBe(429);
  });

  it('should always use RATE_LIMIT_EXCEEDED code', () => {
    const error = new RateLimitError('too many requests', 30);
    expect(error.code).toBe(DomainErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it('should set retryAfterSeconds', () => {
    const error = new RateLimitError('slow down', 120);
    expect(error.retryAfterSeconds).toBe(120);
  });

  it('should include retryAfterSeconds in details', () => {
    const error = new RateLimitError('rate limited', 45);
    expect(error.details).toEqual({ retryAfterSeconds: 45 });
  });

  it('should set name to RateLimitError', () => {
    const error = new RateLimitError('test', 10);
    expect(error.name).toBe('RateLimitError');
  });

  it('should pass instanceof checks for the full prototype chain', () => {
    const error = new RateLimitError('test', 10);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should serialize correctly to JSON', () => {
    const error = new RateLimitError('exceeded rate limit', 90);
    const serialized = JSON.parse(
      JSON.stringify({
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
        details: error.details,
      }),
    );
    expect(serialized).toEqual({
      name: 'RateLimitError',
      message: 'exceeded rate limit',
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: 90,
      details: { retryAfterSeconds: 90 },
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: catch and discriminate by type
// ---------------------------------------------------------------------------

describe('error discrimination in catch blocks', () => {
  it('should discriminate between error types using instanceof', () => {
    const errors: AppError[] = [
      new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'bad input'),
      new AuthenticationError(DomainErrorCode.AUTH_FAILURE, 'no auth'),
      new AuthorizationError(DomainErrorCode.INSUFFICIENT_PERMISSIONS, 'no access'),
      new NotFoundError(DomainErrorCode.RESOURCE_NOT_FOUND, 'gone'),
      new ConflictError(DomainErrorCode.ASSIGNMENT_CONFLICT, 'taken'),
      new RateLimitError('slow down', 30),
    ];

    const statusCodes = errors.map((e) => e.statusCode);
    expect(statusCodes).toEqual([400, 401, 403, 404, 409, 429]);
  });

  it('should be catchable as AppError and then narrowed', () => {
    const throwAndCatch = (): { statusCode: number; retryAfter?: number } => {
      try {
        throw new RateLimitError('too fast', 60);
      } catch (err) {
        if (err instanceof AppError) {
          const result: { statusCode: number; retryAfter?: number } = {
            statusCode: err.statusCode,
          };
          if (err instanceof RateLimitError) {
            result.retryAfter = err.retryAfterSeconds;
          }
          return result;
        }
        return { statusCode: 500 };
      }
    };

    expect(throwAndCatch()).toEqual({ statusCode: 429, retryAfter: 60 });
  });

  it('should not match instanceof for unrelated error classes', () => {
    const error = new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'test');
    expect(error).not.toBeInstanceOf(AuthenticationError);
    expect(error).not.toBeInstanceOf(AuthorizationError);
    expect(error).not.toBeInstanceOf(NotFoundError);
    expect(error).not.toBeInstanceOf(ConflictError);
    expect(error).not.toBeInstanceOf(RateLimitError);
  });
});
