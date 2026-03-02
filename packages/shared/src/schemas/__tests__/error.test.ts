// Unit tests for the error envelope and field error schemas.
// Validates error code enforcement, field-level errors, and structure.

import { describe, it, expect } from 'vitest';

import { ERROR_CODES } from '../../constants';
import { errorEnvelopeSchema, fieldErrorSchema } from '../error';

describe('fieldErrorSchema', () => {
  it('accepts a valid field error', () => {
    const result = fieldErrorSchema.safeParse({
      field: 'name',
      message: 'Name is required',
    });
    expect(result.success).toBe(true);
  });

  it('accepts field error with optional code', () => {
    const result = fieldErrorSchema.safeParse({
      field: 'email',
      message: 'Invalid email format',
      code: 'VALIDATION_INVALID_FORMAT',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty field name', () => {
    const result = fieldErrorSchema.safeParse({ field: '', message: 'Error' });
    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const result = fieldErrorSchema.safeParse({ field: 'name', message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty code string', () => {
    const result = fieldErrorSchema.safeParse({
      field: 'name',
      message: 'Error',
      code: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('errorEnvelopeSchema', () => {
  const validEnvelope = {
    error: {
      code: 'NOT_FOUND_RESOURCE',
      message: 'Project not found',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    },
  } as const;

  it('accepts a valid error envelope', () => {
    const result = errorEnvelopeSchema.safeParse(validEnvelope);
    expect(result.success).toBe(true);
  });

  it('accepts an error envelope with field-level details', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'VALIDATION_REQUIRED_FIELD',
        message: 'Validation failed',
        details: [
          { field: 'name', message: 'Name is required' },
          { field: 'email', message: 'Invalid format', code: 'VALIDATION_INVALID_FORMAT' },
        ],
        requestId: '550e8400-e29b-41d4-a716-446655440001',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an error envelope with empty details array', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        ...validEnvelope.error,
        details: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it.each(ERROR_CODES.slice(0, 5))('accepts error code "%s"', (code) => {
    const result = errorEnvelopeSchema.safeParse({
      error: { ...validEnvelope.error, code },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid error code', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        ...validEnvelope.error,
        code: 'UNKNOWN_ERROR_CODE',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        ...validEnvelope.error,
        message: '',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID requestId', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        ...validEnvelope.error,
        requestId: 'not-a-uuid',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing error wrapper', () => {
    const result = errorEnvelopeSchema.safeParse({
      code: 'NOT_FOUND_RESOURCE',
      message: 'Missing wrapper',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields in error object', () => {
    const result = errorEnvelopeSchema.safeParse({ error: {} });
    expect(result.success).toBe(false);
  });
});
