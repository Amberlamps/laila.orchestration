/**
 * Unit tests for API key generation, hashing, format validation, and prefix extraction.
 *
 * These are pure unit tests with no external dependencies -- the functions under test
 * use only Node.js built-in crypto and string operations.
 *
 * Covers:
 * - generateApiKey(): format, length, hex-only body, uniqueness, hash format, prefix format
 * - hashApiKey(): deterministic output, different outputs for different inputs
 * - isValidKeyFormat(): accepts valid, rejects malformed/short/long/wrong-prefix/non-hex
 * - extractPrefix(): correct extraction from valid keys
 */

import { describe, it, expect } from 'vitest';

import { generateApiKey, hashApiKey, extractPrefix, isValidKeyFormat } from '@/lib/api-keys';

import type { GeneratedApiKey } from '@/lib/api-keys';

// ---------------------------------------------------------------------------
// generateApiKey
// ---------------------------------------------------------------------------

describe('generateApiKey', () => {
  it('should produce a key with the lw_ prefix', () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    expect(plaintextKey).toMatch(/^lw_/);
  });

  it('should produce a key with exactly 51 characters (3 prefix + 48 hex)', () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    expect(plaintextKey).toHaveLength(51);
  });

  it('should produce a key body of only lowercase hex characters', () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    const body = plaintextKey.slice(3);
    expect(body).toMatch(/^[0-9a-f]{48}$/);
  });

  it('should produce unique keys on successive calls', () => {
    const keys: string[] = Array.from({ length: 100 }, () => generateApiKey().plaintextKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(100);
  });

  it('should produce a valid SHA-256 hex hash (64 characters)', () => {
    const { hashedKey }: GeneratedApiKey = generateApiKey();
    expect(hashedKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce an 8-character lookup prefix', () => {
    const { prefix }: GeneratedApiKey = generateApiKey();
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should produce a prefix that matches the key body substring', () => {
    const { plaintextKey, prefix }: GeneratedApiKey = generateApiKey();
    // The prefix is the first 8 chars of the body (after "lw_")
    const bodyPrefix = plaintextKey.slice(3, 11);
    expect(prefix).toBe(bodyPrefix);
  });

  it('should return consistent hash for the generated plaintext key', () => {
    const { plaintextKey, hashedKey }: GeneratedApiKey = generateApiKey();
    // The hashedKey in the result should equal independently hashing the plaintext
    expect(hashApiKey(plaintextKey)).toBe(hashedKey);
  });
});

// ---------------------------------------------------------------------------
// hashApiKey
// ---------------------------------------------------------------------------

describe('hashApiKey', () => {
  it('should produce the same hash for the same input', () => {
    const key = 'lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const { plaintextKey: key1 }: GeneratedApiKey = generateApiKey();
    const { plaintextKey: key2 }: GeneratedApiKey = generateApiKey();
    expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
  });

  it('should produce a valid SHA-256 hex digest', () => {
    const hash = hashApiKey('lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// isValidKeyFormat
// ---------------------------------------------------------------------------

describe('isValidKeyFormat', () => {
  it('should accept a correctly formatted key', () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    expect(isValidKeyFormat(plaintextKey)).toBe(true);
  });

  it('should accept a hand-crafted valid key', () => {
    expect(isValidKeyFormat('lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4')).toBe(true);
  });

  it('should reject a key without the lw_ prefix', () => {
    expect(isValidKeyFormat('xx_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4')).toBe(false);
  });

  it('should reject a key that is too short', () => {
    expect(isValidKeyFormat('lw_a1b2c3')).toBe(false);
  });

  it('should reject a key that is too long', () => {
    expect(isValidKeyFormat('lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4ff')).toBe(false);
  });

  it('should reject a key with uppercase hex characters', () => {
    expect(isValidKeyFormat('lw_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4')).toBe(false);
  });

  it('should reject a key with non-hex characters', () => {
    expect(isValidKeyFormat('lw_g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(isValidKeyFormat('')).toBe(false);
  });

  it('should reject the prefix alone', () => {
    expect(isValidKeyFormat('lw_')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractPrefix
// ---------------------------------------------------------------------------

describe('extractPrefix', () => {
  it('should extract the first 8 hex characters after the lw_ prefix', () => {
    const key = 'lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4';
    expect(extractPrefix(key)).toBe('a1b2c3d4');
  });

  it('should match the prefix returned by generateApiKey', () => {
    const { plaintextKey, prefix }: GeneratedApiKey = generateApiKey();
    expect(extractPrefix(plaintextKey)).toBe(prefix);
  });

  it('should return an 8-character string for a valid key', () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    const prefix = extractPrefix(plaintextKey);
    expect(prefix).toHaveLength(8);
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });
});
