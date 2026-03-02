// Unit tests for API key management schemas.
// Validates create request, create response, and summary schemas.

import { describe, it, expect } from 'vitest';

import { API_KEY_PREFIX } from '../../../constants/api';
import {
  createApiKeyRequestSchema,
  createApiKeyResponseSchema,
  apiKeySummarySchema,
} from '../api-key';

describe('createApiKeyRequestSchema', () => {
  it('accepts valid request with name only', () => {
    const result = createApiKeyRequestSchema.safeParse({ name: 'My API Key' });
    expect(result.success).toBe(true);
  });

  it('accepts request with expiresAt', () => {
    const result = createApiKeyRequestSchema.safeParse({
      name: 'Expiring Key',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createApiKeyRequestSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name exceeding 255 characters', () => {
    expect(createApiKeyRequestSchema.safeParse({ name: 'x'.repeat(256) }).success).toBe(false);
  });

  it('rejects invalid expiresAt datetime', () => {
    const result = createApiKeyRequestSchema.safeParse({
      name: 'Key',
      expiresAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

describe('createApiKeyResponseSchema', () => {
  const validResponse = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'My Key',
    rawKey: `${API_KEY_PREFIX}abc123def456`,
    maskedKey: `${API_KEY_PREFIX}****...f456`,
    createdAt: '2026-03-01T00:00:00.000Z',
    expiresAt: null,
  } as const;

  it('accepts a valid response', () => {
    const result = createApiKeyResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('accepts a response with expiresAt datetime', () => {
    const result = createApiKeyResponseSchema.safeParse({
      ...validResponse,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects rawKey without the system prefix', () => {
    const result = createApiKeyResponseSchema.safeParse({
      ...validResponse,
      rawKey: 'bad_prefix_key123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID id', () => {
    const result = createApiKeyResponseSchema.safeParse({
      ...validResponse,
      id: 'bad',
    });
    expect(result.success).toBe(false);
  });
});

describe('apiKeySummarySchema', () => {
  const validSummary = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'My Key',
    maskedKey: `${API_KEY_PREFIX}****...f456`,
    createdAt: '2026-03-01T00:00:00.000Z',
    expiresAt: null,
    lastUsedAt: null,
  } as const;

  it('accepts a valid summary', () => {
    const result = apiKeySummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
  });

  it('accepts summary with lastUsedAt datetime', () => {
    const result = apiKeySummarySchema.safeParse({
      ...validSummary,
      lastUsedAt: '2026-03-02T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null expiresAt and lastUsedAt', () => {
    const result = apiKeySummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeNull();
      expect(result.data.lastUsedAt).toBeNull();
    }
  });

  it('rejects invalid datetime for lastUsedAt', () => {
    const result = apiKeySummarySchema.safeParse({
      ...validSummary,
      lastUsedAt: 'bad-date',
    });
    expect(result.success).toBe(false);
  });
});
